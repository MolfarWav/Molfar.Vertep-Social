// Recently used emoji and the skin tone, kept in the browser (a convenience only: it works without storage).
export const RECENT_MAX = 24;
const RECENT_KEY = "social:emoji:recent";
const TONE_KEY = "social:emoji:tone";

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** `ch` moved to the front, no duplicates, at most RECENT_MAX. Pure. */
export function pushRecent(list: string[], ch: string): string[] {
  return [ch, ...list.filter((x) => x !== ch)].slice(0, RECENT_MAX);
}

export function loadRecent(s: Store | null = store()): string[] {
  try {
    const v = JSON.parse(s?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 90).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: string[], s: Store | null = store()): void {
  try {
    s?.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // storage blocked or full: the list lives until the picker closes
  }
}

export function loadTone(s: Store | null = store()): number {
  try {
    const n = Number(s?.getItem(TONE_KEY));
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveTone(tone: number, s: Store | null = store()): void {
  try {
    s?.setItem(TONE_KEY, String(tone));
  } catch {
    // ignore
  }
}
