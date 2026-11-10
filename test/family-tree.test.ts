// The family tree's rules (#366): generations from parent and child ties only, couples side by side, one line bus per set of parents, relatives
// beside someone with no other family tie, ties that contradict each other marked and never dropped. Pure (src/screens/profiles/family-model.ts).
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const fam = await import(path.join(root, "src/screens/profiles/family-model.ts"));

const N = (id: string, kind = "character") => ({ key: (kind === "user" ? "u:" : "c:") + id, name: id, kind });
const key = (x: string) => (x.includes(":") ? x : "c:" + x);
/** A link FROM `from` TO `to`: `tie` is what `to` is to `from`. */
const L = (from: string, to: string, ...types: string[]) => ({ from: key(from), to: key(to), level: "friend", band: "", talks: 1, ties: types.map((type) => ({ type })) });
const nodeOf = (g: any, k: string) => g.nodes.find((n: any) => n.key === "c:" + k);

const FAMILY = {
  nodes: ["olha", "mykola", "anna", "boris", "clara", "dmytro", "eva"].map((x) => N(x)),
  links: [
    L("olha", "mykola", "spouse"),
    L("mykola", "olha", "spouse"),
    // Anna, Boris and Clara are the couple's children: stated from the child's side, from the parent's side, and from both
    L("anna", "olha", "parent"),
    L("mykola", "boris", "child"),
    L("boris", "mykola", "parent"),
    L("clara", "olha", "parent"),
    L("clara", "mykola", "parent"),
    // Anna's own family: spouse Dmytro and a daughter Eva
    L("anna", "dmytro", "spouse"),
    L("anna", "eva", "child"),
    L("dmytro", "eva", "child"),
  ],
};

test("generations come from parent and child ties, whichever side states them, and a couple sits in one row", () => {
  const f = fam.familyOf(FAMILY);
  expect(f.groups.length).toBe(1);
  const g = f.groups[0];
  const y = (k: string) => nodeOf(g, k).y;
  expect(y("olha")).toBe(y("mykola"));
  expect(y("anna")).toBe(y("boris"));
  expect(y("anna")).toBe(y("clara"));
  expect(y("anna")).toBe(y("dmytro"));
  expect(y("anna")).toBeGreaterThan(y("olha"));
  expect(y("eva")).toBeGreaterThan(y("anna"));
  expect(g.nodes.length).toBe(7);
  expect(f.loners).toEqual([]);
});

test("couples are joined by a double line, children hang from one bus under the middle of their parents, no two people overlap", () => {
  const g = fam.familyOf(FAMILY).groups[0];
  const spouse = g.lines.filter((l: any) => l.kind === "spouse").map((l: any) => [...l.members].sort().join("+"));
  expect(spouse.sort()).toEqual(["c:anna+c:dmytro", "c:mykola+c:olha"].sort());
  // a child hangs from the parents the ties name: Clara from both (the middle of the couple), Boris from Mykola, Anna from Olha
  const busOf = (k: string) => g.lines.find((l: any) => l.kind === "parent" && l.members.includes("c:" + k) && (k !== "anna" || l.members.includes("c:olha")));
  expect([...busOf("clara").members].sort()).toEqual(["c:clara", "c:mykola", "c:olha"]);
  expect([...busOf("boris").members].sort()).toEqual(["c:boris", "c:mykola"]);
  expect([...busOf("anna").members].sort()).toEqual(["c:anna", "c:olha"]);
  // the buses of one row sit at different heights, so they do not run into each other
  const heights = ["clara", "boris", "anna"].map((k) => /^M[\d.]+ ([\d.]+)H/.exec(busOf(k).d)?.[1]);
  expect(new Set(heights).size).toBe(3);
  // the couple stands over the middle of its children
  const mid = (a: string, b: string) => (nodeOf(g, a).x + nodeOf(g, b).x) / 2;
  const kids = ["anna", "boris", "clara"].map((k) => nodeOf(g, k).x);
  expect(mid("olha", "mykola")).toBeCloseTo((Math.min(...kids) + Math.max(...kids)) / 2, 0);
  // nobody overlaps in a row
  for (const a of g.nodes) for (const b of g.nodes) if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(fam.FAMILY_NODE);
  expect(g.width).toBeGreaterThan(0);
  expect(g.height).toBeGreaterThan(0);
  // the widest row is the children's: Anna and Dmytro, Boris, Clara
  expect(g.widest).toBe(4);
});

test("a single parent sends its own line; unmarried parents each send one into the same bus; siblings with no known parent are joined by a dotted arc", () => {
  const solo = fam.familyOf({ nodes: ["p", "c1", "c2"].map((x) => N(x)), links: [L("c1", "p", "parent"), L("c2", "p", "parent")] }).groups[0];
  const bus = solo.lines.find((l: any) => l.kind === "parent");
  expect([...bus.members].sort()).toEqual(["c:c1", "c:c2", "c:p"]);
  expect((bus.d.match(/V/g) ?? []).length).toBe(3);
  const unmarried = fam.familyOf({ nodes: ["m", "f", "k"].map((x) => N(x)), links: [L("k", "m", "parent"), L("k", "f", "parent")] }).groups[0];
  const b2 = unmarried.lines.find((l: any) => l.kind === "parent");
  expect((b2.d.match(/V/g) ?? []).length).toBe(3);
  expect(unmarried.lines.some((l: any) => l.kind === "spouse")).toBe(false);
  const sib = fam.familyOf({ nodes: ["a", "b"].map((x) => N(x)), links: [L("a", "b", "sibling"), L("b", "a", "sibling")] }).groups[0];
  expect(sib.lines.map((l: any) => l.kind)).toEqual(["sibling"]);
  // every path is well formed: numbers separated, no run-together coordinates
  for (const l of sib.lines) expect(/^M[\d.]+ [\d.]+Q[\d.]+ [\d.]+ [\d.]+ [\d.]+$/.test(l.d)).toBe(true);
  expect(nodeOf(sib, "a").y).toBe(nodeOf(sib, "b").y);
});

test("a relative joins a tree only when they have no other family tie; two such relatives are a group of their own; loners are counted, personas are not", () => {
  const g = {
    nodes: [...["p", "c", "cousin", "r1", "r2", "alone"].map((x) => N(x)), N("me", "user")],
    links: [L("c", "p", "parent"), L("p", "cousin", "relative"), L("r1", "r2", "relative"), L("c", "u:me", "child")],
  };
  const f = fam.familyOf(g);
  expect(f.groups.length).toBe(2);
  const tree = f.groups.find((x: any) => x.nodes.some((n: any) => n.key === "c:p"));
  expect(tree.nodes.find((n: any) => n.key === "c:cousin")).toMatchObject({ side: true });
  expect(tree.nodes.find((n: any) => n.key === "c:cousin").y).toBe(tree.nodes.find((n: any) => n.key === "c:p").y);
  expect(tree.lines.some((l: any) => l.kind === "relative")).toBe(true);
  const pair = f.groups.find((x: any) => x.nodes.some((n: any) => n.key === "c:r1"));
  expect(pair.nodes.length).toBe(2);
  expect(pair.lines.map((l: any) => l.kind)).toEqual(["relative"]);
  expect(f.loners).toEqual(["c:alone"]);
  // a persona that is somebody's child is drawn in the tree
  expect(tree.nodes.some((n: any) => n.key === "u:me")).toBe(true);
});

test("ties that do not add up are marked, never dropped: everyone is still drawn and in the outline once", () => {
  const g = { nodes: ["a", "b", "c", "d"].map((x) => N(x)), links: [L("b", "a", "parent"), L("c", "b", "parent"), L("a", "c", "parent"), L("d", "a", "spouse")] };
  const f = fam.familyOf(g);
  const grp = f.groups[0];
  expect(grp.conflicts.length).toBeGreaterThan(0);
  expect(grp.nodes.length).toBe(4);
  expect(grp.nodes.some((n: any) => n.conflict)).toBe(true);
  const all = (items: any[]): string[] => items.flatMap((i) => [...i.members, ...i.side, ...all(i.children)]);
  expect(all(grp.outline).sort()).toEqual(["c:a", "c:b", "c:c", "c:d"]);
});

test("the outline nests children under their parents, couples as one row, and lists everyone once", () => {
  const g = fam.familyOf(FAMILY).groups[0];
  const top = g.outline;
  expect(top.length).toBe(1);
  expect([...top[0].members].sort()).toEqual(["c:mykola", "c:olha"]);
  expect(top[0].children.length).toBe(3);
  const annaRow = top[0].children.find((c: any) => c.members.includes("c:anna"));
  expect([...annaRow.members].sort()).toEqual(["c:anna", "c:dmytro"]);
  expect(annaRow.children[0].members).toEqual(["c:eva"]);
  const all = (items: any[]): string[] => items.flatMap((i) => [...i.members, ...i.side, ...all(i.children)]);
  expect(all(top).sort()).toEqual(g.nodes.map((n: any) => n.key).sort());
});

test("the same graph is always drawn the same way, and a graph with no family ties is no groups", () => {
  expect(JSON.stringify(fam.familyOf(FAMILY))).toBe(JSON.stringify(fam.familyOf({ nodes: [...FAMILY.nodes].reverse(), links: [...FAMILY.links].reverse() })));
  const none = fam.familyOf({ nodes: [N("a"), N("b")], links: [L("a", "b", "colleague", "rival")] });
  expect(none.groups).toEqual([]);
  expect(none.loners).toEqual(["c:a", "c:b"]);
  expect(fam.familyOf({ nodes: [], links: [] })).toEqual({ groups: [], loners: [] });
});
