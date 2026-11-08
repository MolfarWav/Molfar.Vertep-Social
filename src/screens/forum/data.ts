// Data hooks of the real forum: a polled GET, and the "Write now" call. Preview mode (`?screen=`) never calls the engine.
import { useCallback, useEffect, useRef, useState } from "react";
import { PREVIEW, call } from "@/lib/api";
import type { ForceAnswer, Translate, WriteNotice } from "./model";
import { noticeFromForce } from "./model";

export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface Got<T> {
  /** The last answer for this path; null until one arrives (and after the path changes). */
  data: T | null;
  /** The last failure, shown only while there is no data. */
  error: string;
  reload: () => Promise<void>;
}

/** GET `path` now and every `pollMs` (0: once). A null path asks for nothing. A failed poll keeps the data on screen. */
export function useGet<T>(path: string | null, pollMs = 0): Got<T> {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string }>({ path, data: null, error: "" });
  const alive = useRef(true);
  const current = useRef(path);
  current.current = path;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (PREVIEW || !path) return;
    try {
      const data = await call<T>("GET", path);
      if (alive.current && current.current === path) setState({ path, data, error: "" });
    } catch (e) {
      if (alive.current && current.current === path) setState((s) => ({ ...s, path, error: messageOf(e) }));
    }
  }, [path]);

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const timer = setInterval(() => void reload(), pollMs);
    return () => clearInterval(timer);
  }, [reload, pollMs]);

  const same = state.path === path;
  return { data: same ? state.data : null, error: same ? state.error : "", reload };
}

/** What "Write now" asks for: the whole forum, one board, or one topic. */
export interface WriteScope {
  board?: string;
  topic?: string;
}

export interface WriteNow {
  busy: boolean;
  notice: WriteNotice | null;
  run: () => void;
  dismiss: () => void;
}

/**
 * "Write now": POST /forum/force with the current scope, then the line that says what came of it. `key` names the page
 * the call started on: when the user has moved on by the time the model answers, the line is not shown on the wrong page.
 * `after` runs once the answer is in (the page reloads its data).
 */
export function useWriteNow(scope: WriteScope, key: string, plural: (n: number) => string, t: Translate, after: () => void): WriteNow {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ key: string; value: WriteNotice | null }>({ key, value: null });
  const keyRef = useRef(key);
  keyRef.current = key;
  const run = useCallback(() => {
    if (busy) return;
    const started = key;
    setBusy(true);
    setNotice({ key: started, value: null });
    call<ForceAnswer>("POST", "/forum/force", { ...scope, count: 1 })
      .then((ans) => noticeFromForce(ans, plural, t))
      .catch((e: unknown): WriteNotice => ({ kind: "error", text: t("forum.notice.failed", { error: messageOf(e) }) }))
      .then((value) => {
        setBusy(false);
        if (keyRef.current === started) setNotice({ key: started, value });
        after();
      });
  }, [busy, key, scope, plural, t, after]);
  return { busy, notice: notice.key === key ? notice.value : null, run, dismiss: () => setNotice({ key, value: null }) };
}
