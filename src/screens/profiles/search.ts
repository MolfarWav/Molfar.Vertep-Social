// Search and source filter for the profile list. Pure functions, no React.
import type { MockProfile, ProfileSource } from "@/mock/profiles";

export type SourceFilter = "all" | ProfileSource;
export const FILTERS: SourceFilter[] = ["all", "roleplay", "own", "persona"];
export const isFilter = (v: unknown): v is SourceFilter => typeof v === "string" && (FILTERS as string[]).includes(v);

/** Case-insensitive substring match on the name. An empty query matches everything. */
export function filterProfiles(list: MockProfile[], query: string, source: SourceFilter): MockProfile[] {
  const q = query.trim().toLocaleLowerCase("uk");
  return list.filter(
    (p) => (source === "all" || p.source === source) && (q === "" || p.name.toLocaleLowerCase("uk").includes(q)),
  );
}

/** Splits a name around the first match, so the matched part can be coloured. */
export function splitMatch(name: string, query: string): { before: string; hit: string; after: string } {
  const q = query.trim();
  if (!q) return { before: name, hit: "", after: "" };
  const i = name.toLocaleLowerCase("uk").indexOf(q.toLocaleLowerCase("uk"));
  if (i < 0) return { before: name, hit: "", after: "" };
  return { before: name.slice(0, i), hit: name.slice(i, i + q.length), after: name.slice(i + q.length) };
}

/** Counts per filter, for the "Roleplay 8" style labels. */
export function countBySource(list: MockProfile[]): Record<SourceFilter, number> {
  const c: Record<SourceFilter, number> = { all: list.length, roleplay: 0, own: 0, persona: 0 };
  for (const p of list) c[p.source] += 1;
  return c;
}
