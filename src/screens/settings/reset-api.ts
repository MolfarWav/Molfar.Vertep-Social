// "Start over" (issue #366): what each part holds now, and clearing parts for good. The plugin is `profiles`
// (`GET`/`POST /settings/reset`). In the design preview (`?screen=`) the same calls work on a fake and clear nothing.
import { PREVIEW, call } from "@/lib/api";

export type ResetPart = "forum" | "chats" | "diaries" | "personas" | "profiles" | "settings";

/** The parts in the order the screen lists them. */
export const RESET_PARTS: ResetPart[] = ["forum", "chats", "diaries", "personas", "profiles", "settings"];

/** Parts that go with the profiles: without a profile their chat and diary would be orphans. Mirrors the plugin. */
export const WITH_PROFILES: ResetPart[] = ["chats", "diaries"];

/** How many things each part holds now; null for a part that is not a list (settings). */
export type ResetCounts = Record<ResetPart, number | null>;

/** The parts that will really go: the chosen ones, plus what goes with the profiles. */
export function effectiveParts(chosen: ReadonlySet<ResetPart>): ResetPart[] {
  const want = new Set(chosen);
  if (want.has("profiles")) for (const p of WITH_PROFILES) want.add(p);
  return RESET_PARTS.filter((p) => want.has(p));
}

export async function loadCounts(): Promise<ResetCounts> {
  if (PREVIEW) return { forum: 14, chats: 6, diaries: 6, personas: 2, profiles: 6, settings: null };
  const r = await call<{ counts: ResetCounts }>("GET", "/settings/reset");
  return r.counts;
}

/** Clears the parts for good; resolves with the parts the plugin cleared. Throws when nothing was cleared. */
export async function clearParts(parts: ResetPart[]): Promise<ResetPart[]> {
  if (PREVIEW) return parts;
  const r = await call<{ ok: boolean; cleared?: ResetPart[]; error?: string }>("POST", "/settings/reset", { parts });
  if (!r.ok) throw new Error(r.error || "failed");
  return r.cleared ?? parts;
}
