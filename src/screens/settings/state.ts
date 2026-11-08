import { useCallback, useState } from "react";
import { SETTINGS_MOCK, type SettingsMock } from "@/mock/settings";
import type { Lang } from "@/i18n/index";

/** Mock settings state. Nothing is saved; a reload returns to the board's values. */
export function useSettingsState() {
  const [s, setS] = useState<SettingsMock>(SETTINGS_MOCK);
  const set = useCallback((patch: Partial<SettingsMock>) => setS((p) => ({ ...p, ...patch })), []);
  return { s, set };
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
