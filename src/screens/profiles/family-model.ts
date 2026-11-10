// The family tree's rules, with no drawing (issue #366, plan: `.fork/handoff/family-tree/PLAN.md` in the engine repo). From the map's links it
// builds the trees: who is whose parent, spouse or sibling, in generations, with the coordinates of every person and the line between them.
// Only what the ties say: a parent is one row above a child, spouses and siblings share a row; no ages, no in-laws, nothing inferred. A tie
// is read as the plugin stores it: a link FROM a character TO a person with tie "parent" means the person is the character's parent. A
// "relative" tie has no generation, so it joins a tree only for someone who has no other family tie (they stand beside that relative, joined
// by a dotted line). Ties that contradict each other never empty the screen: the tree is drawn from the first consistent reading and the
// people involved are marked. Pure and deterministic, so test/family-tree.test.ts covers it.
import type { Graph } from "./map-model";

export const FAMILY_NODE = 44;
const SPOUSE_GAP = 40;
const UNIT_GAP = 48;
const SIDE_GAP = 36;
const ROW_H = 120;
const MARGIN_X = 28;
const MARGIN_TOP = 24;
const NAME_ROOM = 34;

type Kind = "parent" | "spouse" | "sibling" | "relative";
interface Rel {
  kind: Kind;
  /** For "parent": `a` is the parent of `b`. Otherwise the pair is unordered (a < b). */
  a: string;
  b: string;
}

export interface FamilyNode {
  key: string;
  /** The centre of the person's square. */
  x: number;
  y: number;
  /** Stands beside a relative with no other family tie. */
  side: boolean;
  /** One of the ties that did not add up involves this person. */
  conflict: boolean;
}

export interface FamilyLine {
  kind: Kind;
  /** An SVG path; spouse lines are two strokes, a parent line is one bus with its branches. */
  d: string;
  /** Everyone the line joins: parents and children for a parent line. */
  members: string[];
}

export interface OutlineItem {
  members: string[];
  side: string[];
  children: OutlineItem[];
}

export interface FamilyGroup {
  id: string;
  nodes: FamilyNode[];
  lines: FamilyLine[];
  width: number;
  height: number;
  /** The most people in one row (the phone opens the outline when it is wider than 4). */
  widest: number;
  outline: OutlineItem[];
  conflicts: { a: string; b: string; kind: Kind }[];
}

export interface Family {
  groups: FamilyGroup[];
  /** Characters with no family tie at all: not drawn, only counted. */
  loners: string[];
}

const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** The family relations the links state, once each. */
function relationsOf(g: Graph): Rel[] {
  const keys = new Set(g.nodes.map((n) => n.key));
  const seen = new Set<string>();
  const out: Rel[] = [];
  const add = (kind: Kind, a: string, b: string) => {
    if (a === b || !keys.has(a) || !keys.has(b)) return;
    const [x, y] = kind === "parent" ? [a, b] : pairOf(a, b);
    const id = kind + "|" + x + "|" + y;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ kind, a: x, b: y });
  };
  for (const l of g.links) {
    for (const t of l.ties) {
      if (t.type === "parent") add("parent", l.to, l.from);
      else if (t.type === "child") add("parent", l.from, l.to);
      else if (t.type === "spouse") add("spouse", l.from, l.to);
      else if (t.type === "sibling") add("sibling", l.from, l.to);
      else if (t.type === "relative") add("relative", l.from, l.to);
    }
  }
  return out.sort((x, y) => (x.kind + "|" + x.a + "|" + x.b).localeCompare(y.kind + "|" + y.a + "|" + y.b));
}

/** Everyone and who they are linked to through ties that fix a row (parent, spouse, sibling), with the row step. */
function constraintGraph(rels: Rel[]): Map<string, { to: string; step: number }[]> {
  const adj = new Map<string, { to: string; step: number }[]>();
  const put = (a: string, to: string, step: number) => adj.set(a, [...(adj.get(a) ?? []), { to, step }]);
  for (const r of rels) {
    if (r.kind === "relative") continue;
    const step = r.kind === "parent" ? 1 : 0;
    put(r.a, r.b, step);
    put(r.b, r.a, -step);
  }
  for (const v of adj.values()) v.sort((x, y) => x.to.localeCompare(y.to));
  return adj;
}

interface Core {
  keys: string[];
  gen: Map<string, number>;
  conflicts: { a: string; b: string; kind: Kind }[];
}

/** The groups joined by ties that fix a row, with a generation for each person (the first consistent reading wins). */
function cores(rels: Rel[]): Core[] {
  const adj = constraintGraph(rels);
  const kindOf = (a: string, b: string): Kind => rels.find((r) => r.kind !== "relative" && ((r.a === a && r.b === b) || (r.a === b && r.b === a)))?.kind ?? "spouse";
  const done = new Set<string>();
  const out: Core[] = [];
  for (const start of [...adj.keys()].sort()) {
    if (done.has(start)) continue;
    const gen = new Map<string, number>([[start, 0]]);
    const queue = [start];
    const conflicts: Core["conflicts"] = [];
    while (queue.length) {
      const k = queue.shift() as string;
      for (const e of adj.get(k) ?? []) {
        const want = (gen.get(k) as number) + e.step;
        if (!gen.has(e.to)) {
          gen.set(e.to, want);
          queue.push(e.to);
        } else if (gen.get(e.to) !== want && !conflicts.some((c) => (c.a === k && c.b === e.to) || (c.a === e.to && c.b === k))) {
          conflicts.push({ a: k, b: e.to, kind: kindOf(k, e.to) });
        }
      }
    }
    const keys = [...gen.keys()].sort();
    for (const k of keys) done.add(k);
    const low = Math.min(...gen.values());
    for (const k of keys) gen.set(k, (gen.get(k) as number) - low);
    out.push({ keys, gen, conflicts });
  }
  return out;
}

interface Unit {
  members: string[];
  side: string[];
  x: number;
  w: number;
}

const unitWidth = (u: { members: string[]; side: string[] }) => u.members.length * FAMILY_NODE + (u.members.length - 1) * SPOUSE_GAP + u.side.length * (FAMILY_NODE + SIDE_GAP);

/** Pushes units to the right where they overlap, each wanting its centre at `want` (or where it is). Order is kept. */
function sweep(units: Unit[], want: (u: Unit) => number | null) {
  let edge = -Infinity;
  for (const u of units) {
    const w = want(u);
    const left = w === null ? u.x : w - u.w / 2;
    u.x = Math.max(left, edge + UNIT_GAP);
    edge = u.x + u.w;
  }
}

function layoutCore(core: Core, rels: Rel[], sides: Map<string, string[]>, id: string): FamilyGroup {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  // a tie that contradicts the rows (the conflicts) is not drawn: its people are marked instead
  const gen = (k: string) => core.gen.get(k) as number;
  for (const r of rels) {
    if (r.kind === "parent" && core.gen.has(r.a) && core.gen.has(r.b) && gen(r.b) === gen(r.a) + 1) {
      parents.set(r.b, [...(parents.get(r.b) ?? []), r.a]);
      children.set(r.a, [...(children.get(r.a) ?? []), r.b]);
    } else if (r.kind === "spouse" && core.gen.has(r.a) && core.gen.has(r.b) && gen(r.a) === gen(r.b)) {
      spouses.set(r.a, [...(spouses.get(r.a) ?? []), r.b]);
      spouses.set(r.b, [...(spouses.get(r.b) ?? []), r.a]);
    }
  }
  const rows = new Map<number, string[]>();
  for (const k of core.keys) rows.set(core.gen.get(k) as number, [...(rows.get(core.gen.get(k) as number) ?? []), k]);
  const rowIds = [...rows.keys()].sort((a, b) => a - b);

  // units of a row: spouses side by side (a chain), then ordered by where their parents stand in the row above
  const order = new Map<string, number>();
  const unitsByRow: Unit[][] = [];
  for (const rowId of rowIds) {
    const keys = (rows.get(rowId) as string[]).slice().sort();
    const seen = new Set<string>();
    const units: Unit[] = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      const chain: string[] = [];
      const stack = [k];
      while (stack.length) {
        const c = stack.pop() as string;
        if (seen.has(c) || !keys.includes(c)) continue;
        seen.add(c);
        chain.push(c);
        for (const s of spouses.get(c) ?? []) stack.push(s);
      }
      // the member with parents in the tree first, so the couple sits on the side its parents are
      chain.sort((a, b) => Number((parents.get(b) ?? []).length > 0) - Number((parents.get(a) ?? []).length > 0) || a.localeCompare(b));
      const side = chain.flatMap((m) => sides.get(m) ?? []);
      units.push({ members: chain, side, x: 0, w: 0 });
    }
    const bary = (u: Unit) => {
      const ps = u.members.flatMap((m) => parents.get(m) ?? []).map((p) => order.get(p)).filter((v): v is number => v !== undefined);
      return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : Infinity;
    };
    units.sort((a, b) => bary(a) - bary(b) || a.members[0].localeCompare(b.members[0]));
    let i = 0;
    for (const u of units) for (const m of [...u.members, ...u.side]) order.set(m, i++);
    for (const u of units) u.w = unitWidth(u);
    unitsByRow.push(units);
  }

  // packed rows, each centred on zero; then parents are pulled over their children (bottom-up), keeping the order
  for (const units of unitsByRow) {
    const total = units.reduce((s, u) => s + u.w, 0) + UNIT_GAP * Math.max(0, units.length - 1);
    let x = -total / 2;
    for (const u of units) {
      u.x = x;
      x += u.w + UNIT_GAP;
    }
  }
  const centre = new Map<string, number>();
  const place = (u: Unit) => {
    let x = u.x;
    for (const m of u.members) {
      centre.set(m, x + FAMILY_NODE / 2);
      x += FAMILY_NODE + SPOUSE_GAP;
    }
    x = u.x + u.members.length * FAMILY_NODE + (u.members.length - 1) * SPOUSE_GAP;
    for (const s of u.side) {
      x += SIDE_GAP;
      centre.set(s, x + FAMILY_NODE / 2);
      x += FAMILY_NODE;
    }
  };
  for (const units of unitsByRow) units.forEach(place);
  for (let r = unitsByRow.length - 2; r >= 0; r--) {
    sweep(unitsByRow[r], (u) => {
      const kids = u.members.flatMap((m) => children.get(m) ?? []).map((c) => centre.get(c)).filter((v): v is number => v !== undefined);
      return kids.length ? kids.reduce((s, v) => s + v, 0) / kids.length : null;
    });
    unitsByRow[r].forEach(place);
  }
  // a second top-down sweep keeps children from overlapping once parents moved
  for (let r = 1; r < unitsByRow.length; r++) {
    sweep(unitsByRow[r], () => null);
    unitsByRow[r].forEach(place);
  }

  const minX = Math.min(...[...centre.values()]) - FAMILY_NODE / 2;
  const shift = MARGIN_X - minX;
  for (const [k, v] of centre) centre.set(k, Math.round((v + shift) * 10) / 10);
  const rowOf = new Map<string, number>();
  rowIds.forEach((rid, i) => (rows.get(rid) as string[]).forEach((k) => rowOf.set(k, i)));
  for (const [k] of sides) for (const s of sides.get(k) ?? []) rowOf.set(s, rowOf.get(k) as number);
  const yOf = (k: string) => MARGIN_TOP + (rowOf.get(k) as number) * ROW_H + FAMILY_NODE / 2;
  const conflictKeys = new Set(core.conflicts.flatMap((c) => [c.a, c.b]));

  const nodes: FamilyNode[] = [];
  const sideKeys = new Set([...sides.values()].flat());
  for (const [k, x] of centre) nodes.push({ key: k, x: Math.round(x * 10) / 10, y: yOf(k), side: sideKeys.has(k), conflict: conflictKeys.has(k) });
  nodes.sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: FamilyLine[] = [];
  const half = FAMILY_NODE / 2;
  // spouses: a double line between neighbours of a unit
  for (const units of unitsByRow) {
    for (const u of units) {
      for (let i = 0; i + 1 < u.members.length; i++) {
        const a = u.members[i];
        const b = u.members[i + 1];
        const y = yOf(a);
        const x1 = (centre.get(a) as number) + half;
        const x2 = (centre.get(b) as number) - half;
        lines.push({ kind: "spouse", d: `M${x1} ${y - 2.5}H${x2}M${x1} ${y + 2.5}H${x2}`, members: [a, b] });
      }
    }
  }
  // parents to children: children with the same parents hang from one bus
  const byParents = new Map<string, string[]>();
  for (const [c, ps] of parents) byParents.set(ps.slice().sort().join("|"), [...(byParents.get(ps.slice().sort().join("|")) ?? []), c]);
  const busGroups = [...byParents.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  const perRow = new Map<number, number>();
  for (const [pk] of busGroups) perRow.set(yOf(pk.split("|")[0]), (perRow.get(yOf(pk.split("|")[0])) ?? 0) + 1);
  const used = new Map<number, number>();
  for (const [pk, kids] of busGroups) {
    const ps = pk.split("|");
    const py = yOf(ps[0]) + half;
    const n = perRow.get(yOf(ps[0])) as number;
    const idx = used.get(yOf(ps[0])) ?? 0;
    used.set(yOf(ps[0]), idx + 1);
    const bus = py + (ROW_H - FAMILY_NODE) / 2 + (idx - (n - 1) / 2) * 7;
    const adjacent = ps.length === 2 && spouses.get(ps[0])?.includes(ps[1]);
    const sources = adjacent ? [((centre.get(ps[0]) as number) + (centre.get(ps[1]) as number)) / 2] : ps.map((p) => centre.get(p) as number);
    const xs = [...sources, ...kids.map((c) => centre.get(c) as number)];
    let d = `M${Math.min(...xs)} ${bus}H${Math.max(...xs)}`;
    for (const sx of sources) d += `M${sx} ${py}V${bus}`;
    for (const c of kids.sort()) d += `M${centre.get(c)} ${bus}V${yOf(c) - half - 2}`;
    lines.push({ kind: "parent", d, members: [...ps, ...kids] });
  }
  // siblings with no parent in the tree, and relatives: a dotted arc over the row
  const arc = (kind: Kind, a: string, b: string) => {
    const [x1, x2] = [centre.get(a) as number, centre.get(b) as number];
    const y = yOf(a) - half;
    lines.push({ kind, d: `M${x1} ${y}Q${(x1 + x2) / 2} ${y - 18} ${x2} ${y}`, members: [a, b] });
  };
  const shared = (a: string, b: string) => (parents.get(a) ?? []).some((p) => (parents.get(b) ?? []).includes(p));
  for (const r of rels) {
    if (r.kind === "sibling" && core.gen.has(r.a) && core.gen.has(r.b) && gen(r.a) === gen(r.b) && !shared(r.a, r.b)) arc("sibling", r.a, r.b);
  }
  for (const [k, ss] of sides) for (const s of ss) arc("relative", k, s);

  // the outline: the same trees as nested rows (parents with their children), everyone once
  const unitOf = new Map<string, Unit>();
  for (const units of unitsByRow) for (const u of units) for (const m of u.members) unitOf.set(m, u);
  const placed = new Set<Unit>();
  const item = (u: Unit): OutlineItem => {
    placed.add(u);
    const kids = [...new Set(u.members.flatMap((m) => children.get(m) ?? []))].map((c) => unitOf.get(c) as Unit).filter((cu, i, all) => cu && !placed.has(cu) && all.indexOf(cu) === i);
    const below: OutlineItem[] = [];
    for (const cu of kids.slice().sort((a, b) => a.x - b.x)) if (!placed.has(cu)) below.push(item(cu));
    return { members: u.members, side: u.side, children: below };
  };
  const outline: OutlineItem[] = [];
  for (const u of unitsByRow[0] ?? []) if (!placed.has(u)) outline.push(item(u));
  for (const units of unitsByRow) for (const u of units) if (!placed.has(u)) outline.push(item(u));

  const maxX = Math.max(...nodes.map((n) => n.x)) + half + MARGIN_X;
  return {
    id,
    nodes,
    lines,
    width: Math.ceil(maxX),
    height: MARGIN_TOP + (rowIds.length - 1) * ROW_H + FAMILY_NODE + NAME_ROOM,
    widest: Math.max(...unitsByRow.map((us) => us.reduce((s, u) => s + u.members.length + u.side.length, 0))),
    outline,
    conflicts: core.conflicts,
  };
}

/** The trees of a graph: one group per set of people joined by parent, spouse or sibling ties, relatives beside them, the rest counted. */
export function familyOf(g: Graph): Family {
  const rels = relationsOf(g);
  const cs = cores(rels);
  const inCore = new Set(cs.flatMap((c) => c.keys));
  // relatives of a person with no other family tie stand beside the first person they are related to
  const sides = new Map<string, string[]>();
  const loose = new Set<string>();
  for (const r of rels) {
    if (r.kind !== "relative") continue;
    for (const k of [r.a, r.b]) if (!inCore.has(k)) loose.add(k);
  }
  const attached = new Set<string>();
  for (const r of rels) {
    if (r.kind !== "relative") continue;
    const [x, y] = [r.a, r.b];
    const pairs: [string, string][] = [[x, y], [y, x]];
    for (const [core, other] of pairs) {
      if (inCore.has(core) && loose.has(other) && !attached.has(other)) {
        sides.set(core, [...(sides.get(core) ?? []), other]);
        attached.add(other);
      }
    }
  }
  const groups: FamilyGroup[] = cs.map((c) => {
    const mine = new Map<string, string[]>();
    for (const k of c.keys) if (sides.has(k)) mine.set(k, (sides.get(k) as string[]).slice().sort());
    return layoutCore(c, rels, mine, c.keys[0]);
  });
  // relatives joined only to each other: a group of their own on one row
  const left = [...loose].filter((k) => !attached.has(k)).sort();
  const seen = new Set<string>();
  for (const k of left) {
    if (seen.has(k)) continue;
    const keys: string[] = [];
    const stack = [k];
    while (stack.length) {
      const c = stack.pop() as string;
      if (seen.has(c) || !left.includes(c)) continue;
      seen.add(c);
      keys.push(c);
      for (const r of rels) if (r.kind === "relative" && (r.a === c || r.b === c)) stack.push(r.a === c ? r.b : r.a);
    }
    keys.sort();
    const core: Core = { keys, gen: new Map(keys.map((x) => [x, 0])), conflicts: [] };
    const g2 = layoutCore(core, rels.filter((r) => r.kind === "relative"), new Map(), keys[0]);
    // a row of relatives: dotted arcs between neighbours
    const lines: FamilyLine[] = [];
    for (let i = 0; i + 1 < keys.length; i++) {
      const a = g2.nodes.find((n) => n.key === keys[i]) as FamilyNode;
      const b = g2.nodes.find((n) => n.key === keys[i + 1]) as FamilyNode;
      const y = a.y - FAMILY_NODE / 2;
      lines.push({ kind: "relative", d: `M${a.x} ${y}Q${(a.x + b.x) / 2} ${y - 18} ${b.x} ${y}`, members: [a.key, b.key] });
    }
    groups.push({ ...g2, lines });
  }
  const inGroup = new Set(groups.flatMap((gr) => gr.nodes.map((n) => n.key)));
  return { groups, loners: g.nodes.filter((n) => n.kind === "character" && !inGroup.has(n.key)).map((n) => n.key) };
}
