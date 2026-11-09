// Two languages, like Roleplay: English (source) and Ukrainian. Each screen
// keeps its strings in its own `strings.ts` ({ en, uk }); this file merges them.
// A missing Ukrainian key falls back to English, a missing English key to the
// key itself, so a gap is visible rather than blank. test/i18n.test.ts keeps
// the two key sets equal.
import { useSyncExternalStore } from "react";
import { shell } from "@/shell/strings";
import { sources } from "@/i18n/sources";

export type Lang = "en" | "uk";
export type Strings = Record<string, string>;
export interface Bundle { en: Strings; uk: Strings }

const all: Bundle[] = [shell, ...sources];
const dict: Record<Lang, Strings> = { en: {}, uk: {} };
for (const b of all) {
  Object.assign(dict.en, b.en);
  Object.assign(dict.uk, b.uk);
}
export const dictionary = dict;

// Which language the UI wears, in this order:
//   1. `?lang=en|uk` (previews and browser checks pin it),
//   2. the user's own choice in Settings > Language ("en" or "uk"; "auto" is no choice),
//   3. the language of the whole app: `window.molfarShell.locale()` from the engine (any appLang locale that is not Ukrainian reads as English),
//   4. outside the engine (a bare browser tab): the browser's language.
// The browser's language is never asked while the engine can answer: the device can be Ukrainian while the app is English.
export type LangPref = "auto" | Lang;
const PREF_KEY = "social:lang-pref";
const SHELL_KEY = "social:shell-lang";

interface LangInput {
  pinned: Lang | null;
  pref: LangPref;
  /** The app's language as the engine last reported it (this run or the last one), or null. */
  appLang: Lang | null;
}

/** Pure: the language for these inputs. No answer from the engine yet reads as English. */
export function resolveLang({ pinned, pref, appLang }: LangInput): Lang {
  if (pinned) return pinned;
  if (pref === "en" || pref === "uk") return pref;
  return appLang ?? "en";
}

/** The language a appLang locale code stands for: Ukrainian stays, everything else is English (Social has two languages). */
export function langFromLocale(code: unknown): Lang | null {
  if (typeof code !== "string" || !code.trim()) return null;
  return code.trim().toLowerCase().startsWith("uk") ? "uk" : "en";
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage can be blocked; the choice then lasts until reload
  }
}

const isLang = (v: unknown): v is Lang => v === "en" || v === "uk";

function pinnedLang(): Lang | null {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    return isLang(q) ? q : null;
  } catch {
    return null;
  }
}

let pref: LangPref = ((v) => (isLang(v) ? v : "auto"))(read(PREF_KEY));
let appLang: Lang | null = ((v) => (isLang(v) ? v : null))(read(SHELL_KEY));
let lang: Lang = resolveLang({ pinned: pinnedLang(), pref, appLang });
const listeners = new Set<() => void>();

function update(): void {
  lang = resolveLang({ pinned: pinnedLang(), pref, appLang });
  try {
    document.documentElement.lang = lang;
  } catch {
    // no document (tests)
  }
  listeners.forEach((l) => l());
}

/** The user's choice in Settings: "auto" follows the app, "en" and "uk" pin Social to one language. */
export function setLangPref(next: LangPref): void {
  pref = next;
  write(PREF_KEY, next);
  update();
}

export function langPref(): LangPref {
  return pref;
}

/** The app's language as last reported by the engine (null until it has answered once). */
export function shellLang(): Lang | null {
  return appLang;
}

/** Take a appLang locale code (what `molfarShell.locale()` resolves with). Ignores garbage. */
export function applyShellLocale(code: unknown): void {
  const next = langFromLocale(code);
  if (!next) return;
  if (next === appLang) return;
  appLang = next;
  write(SHELL_KEY, next);
  update();
}

/**
 * Ask the engine for the app's language now, and again whenever Social comes back into view (the engine has no
 * "language changed" event, and the app's frame is only hidden while another tab is open: a focus, a visibility
 * change or a resize tells us it is back). Outside the engine the browser's language stands in.
 */
export function followShellLanguage(): void {
  let last = 0;
  const ask = () => {
    last = Date.now();
    const locale = window.molfarShell?.locale;
    if (!locale) return fallback();
    locale().then(applyShellLocale, fallback);
  };
  const fallback = () => {
    if (appLang) return; // the last answer stands
    try {
      applyShellLocale(navigator.language);
    } catch {
      // no navigator
    }
  };
  ask();
  const again = () => {
    if (document.visibilityState === "visible" && Date.now() - last > 1000) ask();
  };
  window.addEventListener("focus", again);
  window.addEventListener("resize", again);
  document.addEventListener("visibilitychange", again);
}

export function translate(key: string, vars?: Record<string, string | number>): string {
  let s = dict[lang][key] ?? dict.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** `const t = useT(); t("shell.tab.forum")`. Re-renders when the language changes. */
export function useT(): typeof translate {
  useSyncExternalStore(subscribe, () => lang);
  return translate;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The user's language choice, re-rendering when it or the app's language changes. */
export function useLangPref(): { pref: LangPref; appLang: Lang | null; lang: Lang } {
  useSyncExternalStore(subscribe, () => `${pref}|${appLang}|${lang}`);
  return { pref, appLang, lang };
}

export function currentLang(): Lang {
  return lang;
}
