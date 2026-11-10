// The relationship map's rules, with no drawing: one edge per pair of people from the plugin's links (each link is how one character sees
// another), which style an edge gets, the order of the people round the ring, the positions, and which size and labels the crowd allows.
// Pure, so test/relationship-map.test.ts covers it. The picture is `RelationMap.tsx`, the screen is `MapScreen.tsx`.
import { LEVELS, TIE_GROUPS, type Level, type Tie } from "./people-api";

export type Band = "" | "close" | "warm" | "cold" | "hostile";

/** One person on the map: a character ("c:<id>") or one of the user's personas ("u:<id>"). */
export interface GNode {
  key: string;
  name: string;
  kind: "character" | "user";
}

/** How `from` (always a character) sees `to`: the level, the feeling band, how often they dealt with each other, the ties. */
export interface GLink {
  from: string;
  to: string;
  level: Level;
  band: Band;
  talks: number;
  ties: Tie[];
}

export interface Graph {
  nodes: GNode[];
  links: GLink[];
}

/** What the line between two people looks like: the strongest fact wins (a romantic tie, then rivalry or being at odds, then family). */
export type EdgeKind = "romance" | "rival" | "family" | "plain";

export interface Edge {
  /** The two keys, sorted, so a pair has one edge whichever way the links run. */
  a: string;
  b: string;
  kind: EdgeKind;
  /** 0 to 6: the higher level of the two directions (an index of LEVELS); thickness follows it. */
  weight: number;
  /** The links of this pair, one or two (a to b and b to a). */
  links: GLink[];
}

const ROMANTIC = ["crush", "dating", "partner"];
const FAMILY: readonly string[] = TIE_GROUPS.family;

const levelIndex = (l: Level) => Math.max(0, LEVELS.indexOf(l));
export const pairKey = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);

function kindOf(links: GLink[]): EdgeKind {
  const ties = links.flatMap((l) => l.ties.map((t) => t.type as string));
  if (ties.some((t) => ROMANTIC.includes(t))) return "romance";
  if (ties.includes("rival") || links.some((l) => l.band === "cold" || l.band === "hostile")) return "rival";
  if (ties.some((t) => FAMILY.includes(t))) return "family";
  return "plain";
}

/** One edge per pair; a link to someone who is not a node is dropped. */
export function edgesOf(g: Graph): Edge[] {
  const keys = new Set(g.nodes.map((n) => n.key));
  const by = new Map<string, GLink[]>();
  for (const l of g.links) {
    if (!keys.has(l.from) || !keys.has(l.to) || l.from === l.to) continue;
    const k = pairKey(l.from, l.to);
    by.set(k, [...(by.get(k) ?? []), l]);
  }
  return [...by.entries()].map(([k, links]) => {
    const [a, b] = k.split("|");
    return { a, b, kind: kindOf(links), weight: Math.max(...links.map((l) => levelIndex(l.level))), links };
  });
}

/** The other people a person has an edge with. */
export const neighboursOf = (key: string, edges: Edge[]): string[] => edges.filter((e) => e.a === key || e.b === key).map((e) => (e.a === key ? e.b : e.a));

/**
 * The order round the ring. Not the order of the data: a greedy walk that puts the people with strong links next to each other, which keeps
 * most lines short and few of them crossing the middle. Start with the most connected; the next is the unplaced one linked most strongly to
 * the last placed (the rest, by their count of links). Deterministic: the same graph is always drawn the same way.
 */
export function ringOrder(nodes: GNode[], edges: Edge[]): string[] {
  const score = new Map<string, number>();
  const deg = new Map<string, number>();
  for (const e of edges) {
    score.set(pairKey(e.a, e.b), e.weight + 1);
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  const left = nodes.map((n) => n.key).sort((x, y) => (deg.get(y) ?? 0) - (deg.get(x) ?? 0) || x.localeCompare(y));
  const out: string[] = [];
  while (left.length) {
    const last = out[out.length - 1];
    let best = 0;
    if (last) {
      let top = -1;
      left.forEach((k, i) => {
        const s = score.get(pairKey(last, k)) ?? 0;
        if (s > top) {
          top = s;
          best = i;
        }
      });
    }
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

export interface Point {
  x: number;
  y: number;
}

/** `n` points on a ring in a box, the first at the top, clockwise; one person sits in the middle, two on the sides. */
export function ringPoints(n: number, w: number, h: number, margin: number): Point[] {
  const cx = w / 2;
  const cy = h / 2;
  if (n <= 0) return [];
  if (n === 1) return [{ x: cx, y: cy }];
  const rx = Math.max(10, w / 2 - margin);
  const ry = Math.max(10, h / 2 - margin);
  if (n === 2) return [{ x: cx - rx, y: cy }, { x: cx + rx, y: cy }];
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: Math.round((cx + rx * Math.cos(a)) * 10) / 10, y: Math.round((cy + ry * Math.sin(a)) * 10) / 10 };
  });
}

/** The size of a node and whether every name is written, for a crowd of `n`: the map thins out instead of becoming a hairball. */
export function crowd(n: number): { size: number; allNames: boolean; listFirst: boolean } {
  return { size: n <= 8 ? 44 : n <= 16 ? 36 : 28, allNames: n <= 12, listFirst: n > 24 };
}
