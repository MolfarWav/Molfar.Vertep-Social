import { useCallback, useEffect, useRef, useState } from "react";
import { PREVIEW, call, listModels, type ModelChoice } from "@/lib/api";
import { SETTINGS_MOCK, type SettingsMock } from "@/mock/settings";
import type { Lang } from "@/i18n/index";
import { REAL_DEFAULTS, adoptEngine, applyPatch, fromEngine, mergePatch, type EngineSettings, type Patch } from "./real";

/** A load or save failure, shown as one line. `message` is the engine's or the network's text. */
export interface SettingsError {
  kind: "load" | "save";
  message: string;
}

export interface SettingsState {
  s: SettingsMock;
  set: (patch: Patch) => void;
  /** The models the user switched on (real mode; empty in preview and until the list answers). */
  models: ModelChoice[];
  error: SettingsError | null;
}

const SAVE_DELAY_MS = 400;

/**
 * The screen's settings. Preview mode (`?screen=`) is the mock: nothing is read or saved.
 * Real mode starts from the defaults, takes the engine's settings on mount, and saves every change
 * with a debounce. Until the engine answers nothing is saved, so the defaults never overwrite the file.
 */
export function useSettingsState(): SettingsState {
  return PREVIEW ? usePreviewState() : useLiveState();
}

function usePreviewState(): SettingsState {
  const [s, setS] = useState<SettingsMock>(SETTINGS_MOCK);
  const set = useCallback((patch: Patch) => setS((p) => ({ ...p, ...patch })), []);
  return { s, set, models: [], error: null };
}

function useLiveState(): SettingsState {
  const [s, setS] = useState<SettingsMock>(REAL_DEFAULTS);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [error, setError] = useState<SettingsError | null>(null);
  const loaded = useRef(false);
  // Edits the engine has not taken yet (they wait for the debounce, or for the first answer).
  const unsaved = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    const patch = unsaved.current;
    if (!patch) return;
    unsaved.current = null;
    call<{ ok: boolean; settings: EngineSettings }>("PUT", "/settings", patch)
      .then((r) => {
        setError(null);
        setS((local) => adoptEngine(local, patch, fromEngine(r.settings)));
      })
      .catch((e: unknown) => {
        // Keep the failed edits queued: newer edits win over them, and the next change sends all of it.
        unsaved.current = mergePatch(patch, unsaved.current);
        setError({ kind: "save", message: messageOf(e) });
      });
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save();
    }, SAVE_DELAY_MS);
  }, [save]);

  const set = useCallback(
    (patch: Patch) => {
      setS((p) => applyPatch(p, patch));
      unsaved.current = mergePatch(unsaved.current, patch);
      if (loaded.current) schedule();
    },
    [schedule],
  );

  useEffect(() => {
    let alive = true;
    call<{ settings: EngineSettings }>("GET", "/settings")
      .then((r) => {
        if (!alive) return;
        loaded.current = true;
        // Edits made before the answer go on top of the engine's values, and are saved now.
        setS(applyPatch(fromEngine(r.settings), unsaved.current ?? {}));
        if (unsaved.current) schedule();
      })
      .catch((e: unknown) => {
        if (alive) setError({ kind: "load", message: messageOf(e) });
      });
    listModels().then((list) => {
      if (alive) setModels(list);
    });
    return () => {
      alive = false;
    };
  }, [schedule]);

  // Leaving the screen inside the debounce window still saves the last edit.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        save();
      }
    },
    [save],
  );

  return { s, set, models, error };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** One forum request per post, and none while autonomous posts are off. */
export function requestsPerDay(s: SettingsMock): number {
  return s.autonomous ? s.postsPerDay : 0;
}

/** Which Ukrainian plural form of "request" goes with n; English has one and many. */
export function reqForm(n: number, lang: Lang): "one" | "few" | "many" {
  if (lang === "en") return n === 1 ? "one" : "many";
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "one";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "few";
  return "many";
}
