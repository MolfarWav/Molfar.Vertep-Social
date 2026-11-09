// Settings > Life talks to the `life` plugin: the state of the shared feed, "Update now", and the weather place lookup.
// In the design preview (`?screen=`) the same calls answer from a small fake, so the screen can be drawn and checked.
import { PREVIEW, call } from "@/lib/api";

/** GET /life/world: what the feed holds now and whether another fetch is due (plugins/life, `worldStatus`). */
export interface WorldStatus {
  fetchedAt: number;
  count: number;
  byCat: Record<string, number>;
  /** Sources that did not answer, by id. */
  errors: Record<string, string>;
  /** The place the weather is fetched for ("" = none looked up yet) and the one the user typed. */
  place: string;
  placeWanted: string;
  due: boolean;
}

const FAKE: WorldStatus = {
  fetchedAt: Date.now() - 3 * 3600 * 1000,
  count: 54,
  byCat: { news: 12, politics: 12, games: 6, film: 6, anime: 6, science: 6, culture: 4, weather: 1 },
  errors: { "r-worldnews": "HTTP 429", "r-gaming": "HTTP 429" },
  place: "Kyiv, Ukraine",
  placeWanted: "Kyiv, Ukraine",
  due: false,
};

export async function loadWorldStatus(): Promise<WorldStatus | null> {
  if (PREVIEW) return FAKE;
  try {
    return (await call<{ status: WorldStatus }>("GET", "/life/world")).status;
  } catch {
    return null;
  }
}

/** Fetches the feed now. Resolves to the new status, or an error text. */
export async function refreshWorld(): Promise<{ status: WorldStatus } | { error: string }> {
  if (PREVIEW) return { status: { ...FAKE, fetchedAt: Date.now() } };
  try {
    const r = await call<{ ok: boolean; error?: string; status: WorldStatus }>("POST", "/life/world/refresh");
    return r.ok ? { status: r.status } : { error: r.error ?? "" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Looks a place up for the weather; "" clears it. The answer is the place's full name, or an error text. */
export async function lookUpPlace(name: string): Promise<{ place: string } | { error: string }> {
  if (PREVIEW) return name.trim().toLowerCase() === "nowhere" ? { error: "no such place" } : { place: name.trim() ? `${name.trim()}, Ukraine` : "" };
  try {
    const r = await call<{ ok: boolean; place: string; error?: string }>("PUT", "/life/place", { name });
    return r.ok ? { place: r.place } : { error: r.error ?? "" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
