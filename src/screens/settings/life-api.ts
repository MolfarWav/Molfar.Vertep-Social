// Settings > Life talks to the `life` plugin: the state of the shared feed, "Update now", and the weather place lookup.
// In the design preview (`?screen=`) the same calls answer from a small fake, so the screen can be drawn and checked.
import { PREVIEW, call } from "@/lib/api";
import type { TopicsCatalog } from "./topics";

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
  /** How many of the kept items matched each chosen subject. */
  byTopic?: Record<string, number>;
  /** The feed was fetched under another choice of subjects: it catches up on the next fetch. */
  topicsStale?: boolean;
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

const FAKE_TOPICS: TopicsCatalog = {
  groups: [
    { id: "world", en: "World and society", uk: "Світ і суспільство" },
    { id: "tech", en: "Technology", uk: "Технології" },
    { id: "science", en: "Science and nature", uk: "Наука й природа" },
    { id: "screen", en: "Games and screen", uk: "Ігри й екран" },
  ],
  topics: [
    { id: "europe", group: "world", en: "Europe", uk: "Європа" },
    { id: "economy", group: "world", en: "Economy and business", uk: "Економіка й бізнес" },
    { id: "health", group: "world", en: "Health and medicine", uk: "Здоровʼя й медицина" },
    { id: "tech", group: "tech", en: "Technology", uk: "Технології" },
    { id: "ai", group: "tech", en: "AI and robots", uk: "ШІ й роботи" },
    { id: "space", group: "science", en: "Space", uk: "Космос" },
    { id: "nature", group: "science", en: "Nature and animals", uk: "Природа й тварини" },
    { id: "games", group: "screen", en: "PC and console games", uk: "Ігри" },
    { id: "anime", group: "screen", en: "Anime and manga", uk: "Аніме й манга" },
  ],
  max: 12,
  customMax: 6,
  byTopic: { space: 6, anime: 6 },
};

/** The list of subjects the user can pick (plugins/life, `TOPICS`). */
export async function loadTopics(): Promise<TopicsCatalog | null> {
  if (PREVIEW) return FAKE_TOPICS;
  try {
    return await call<TopicsCatalog>("GET", "/life/topics");
  } catch {
    return null;
  }
}

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
