// Theme: "vertep" (default), "dark" or "light". Picked from `?theme=` (used by
// previews and browser checks), then from the last choice, then Vertep. The
// shell's own scheme is not readable from an app yet; see AGENTS.md.
export type Theme = "vertep" | "dark" | "light";
export const THEMES: Theme[] = ["vertep", "dark", "light"];
const KEY = "social:theme";

const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as string[]).includes(v);

export function initialTheme(): Theme {
  try {
    const q = new URLSearchParams(location.search).get("theme");
    if (isTheme(q)) return q;
    const s = localStorage.getItem(KEY);
    if (isTheme(s)) return s;
  } catch {
    // storage can be blocked; fall through
  }
  return "vertep";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // not worth failing for
  }
}
