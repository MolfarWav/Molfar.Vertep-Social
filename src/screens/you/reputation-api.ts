// How a persona looks from outside (#367): what the characters think of it, read by rules from their lists of people (the Life plugin,
// GET /life/reputation). Nothing private is in it: no impressions, no quoted words. Preview mode draws a mock.
import { PREVIEW, call } from "@/lib/api";

export type Mood = "unknown" | "liked" | "cool" | "mixed";
export interface Group {
  count: number;
  names: string[];
}
export interface Reputation {
  id: string;
  name: string;
  known: Group;
  fond: Group;
  cool: Group;
  mood: Mood;
}
export interface ReputationView {
  characters: number;
  personas: Reputation[];
}

const isGroup = (v: unknown): v is Group => !!v && typeof v === "object" && Number.isInteger((v as Group).count) && Array.isArray((v as Group).names);

/** The engine's answer, checked; anything that does not fit is dropped. */
export function readReputation(raw: unknown): ReputationView {
  const o = (raw && typeof raw === "object" ? raw : {}) as { characters?: unknown; personas?: unknown };
  const personas = (Array.isArray(o.personas) ? o.personas : [])
    .map((p): Reputation | null => {
      const r = p as Partial<Reputation> | null;
      if (!r || typeof r.id !== "string" || typeof r.name !== "string" || !isGroup(r.known) || !isGroup(r.fond) || !isGroup(r.cool)) return null;
      const mood: Mood = r.mood === "liked" || r.mood === "cool" || r.mood === "mixed" ? r.mood : "unknown";
      const clean = (g: Group): Group => ({ count: Math.max(0, g.count), names: g.names.filter((n) => typeof n === "string").slice(0, 6) });
      return { id: r.id, name: r.name, known: clean(r.known), fond: clean(r.fond), cool: clean(r.cool), mood };
    })
    .filter((x): x is Reputation => x !== null);
  return { characters: Number.isInteger(o.characters) ? (o.characters as number) : 0, personas };
}

export async function loadReputation(): Promise<ReputationView> {
  if (PREVIEW) return MOCK;
  return readReputation(await call<unknown>("GET", "/life/reputation"));
}

/** The preview: the first persona is well liked, the second is not known yet. */
const MOCK: ReputationView = {
  characters: 8,
  personas: [
    { id: "u-yaroslav", name: "Ярослав", known: { count: 5, names: ["Мавка", "Лісовик", "Ярина", "Домовик", "Берегиня"] }, fond: { count: 3, names: ["Мавка", "Ярина", "Берегиня"] }, cool: { count: 1, names: ["Лісовик"] }, mood: "liked" },
    { id: "pe-wanderer", name: "Мандрівник", known: { count: 0, names: [] }, fond: { count: 0, names: [] }, cool: { count: 0, names: [] }, mood: "unknown" },
  ],
};
