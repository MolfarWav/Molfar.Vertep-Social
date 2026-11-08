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

const KEY = "social:lang";
let lang: Lang = pickLang();
const listeners = new Set<() => void>();

function pickLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "uk") return q;
    const s = localStorage.getItem(KEY);
    if (s === "en" || s === "uk") return s;
    return navigator.language.toLowerCase().startsWith("uk") ? "uk" : "en";
  } catch {
    return "en";
  }
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // ignore
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

export function translate(key: string, vars?: Record<string, string | number>): string {
  let s = dict[lang][key] ?? dict.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** `const t = useT(); t("shell.tab.forum")`. Re-renders when the language changes. */
export function useT(): typeof translate {
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => lang,
  );
  return translate;
}

export function currentLang(): Lang {
  return lang;
}
