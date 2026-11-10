// The relationship map (#366): the Life plugin's GET /life/graph gives the page nodes and links built from the people lists, with nothing private,
// and the map's pure layout and wording rules (src/screens/profiles/map-model.ts).
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
  const host = {
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => void files.delete(p),
      list: (d: string) => {
        const out = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
        if (!out.length) throw new Error("ENOENT");
        return out.sort();
      },
    },
    llm: { results: {}, request: () => {} },
    net: { results: {}, request: () => {} },
  };
  return { files, host };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const prof = (id: string, extra: object = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), hue: 100, about: "x", interests: [], habits: [], voice: {}, life: { on: true, world: true }, ...extra });
const person = (key: string, extra: object = {}) => ({ key, name: key.slice(2), seen: 3, toMe: 1, fromMe: 1, said: [{ at: 1, where: "forum", text: "a private line" }], note: "a private impression", feel: 0, ...extra });
const list = (h: H, id: string, people: object[]) => put(h, `life/people/${id}.json`, { scanned: 0, noteDay: "", failedAt: 0, people });
const graph = (h: H) => life.handleRoute({ method: "GET", path: "/life/graph" }, h.host).json;

function seed() {
  const h = makeHost();
  put(h, "profiles/anna.json", prof("anna", { adult: true }));
  put(h, "profiles/boris.json", prof("boris", { adult: true }));
  put(h, "profiles/clara.json", prof("clara"));
  put(h, "you.json", { active: "me1", personas: [{ id: "me1", name: "Serhii", about: "" }, { id: "me2", name: "Olha", about: "" }] });
  return h;
}

test("graph: every character is a node, links are how a character sees a person it has met, personas appear only when someone knows them", () => {
  const h = seed();
  list(h, "anna", [person("c:boris", { lvl: "friend", feel: 8, ties: [{ type: "crush" }, { type: "sibling" }] }), person("u:me1", { lvl: "close" }), person("c:clara", { seen: 0, toMe: 0, fromMe: 0, feel: 0 })]);
  list(h, "boris", [person("c:anna", { lvl: "acquaintance" })]);
  const g = graph(h);
  expect(g.nodes.map((n: any) => n.key).sort()).toEqual(["c:anna", "c:boris", "c:clara", "u:me1"]);
  expect(g.nodes.find((n: any) => n.key === "u:me1")).toMatchObject({ name: "Serhii", kind: "user" });
  const ab = g.links.find((l: any) => l.from === "c:anna" && l.to === "c:boris");
  expect(ab).toMatchObject({ level: "friend", band: "close", talks: 2, ties: [{ type: "crush" }, { type: "sibling" }] });
  expect(g.links.find((l: any) => l.from === "c:boris" && l.to === "c:anna")).toMatchObject({ level: "acquaintance" });
  // someone not met and with nothing set is not a link
  expect(g.links.some((l: any) => l.to === "c:clara")).toBe(false);
});

test("graph carries nothing private and drops a romantic tie that is not allowed", () => {
  const h = seed();
  // Clara is not an adult: Anna's crush on her is not shown; a family tie stays
  list(h, "anna", [person("c:clara", { ties: [{ type: "crush" }, { type: "colleague" }, { type: "other", label: "old neighbour" }] })]);
  const g = graph(h);
  const l = g.links[0];
  expect(l.ties).toEqual([{ type: "colleague" }, { type: "other", label: "old neighbour" }]);
  const raw = JSON.stringify(g);
  expect(raw).not.toContain("private");
  expect(Object.keys(l).sort()).toEqual(["band", "follow", "from", "level", "talks", "ties", "to"]);
});

test("graph with no lists is the characters alone; a person that is gone or the character itself is skipped; a set level counts without meetings", () => {
  const h = seed();
  expect(graph(h).links).toEqual([]);
  expect(graph(h).nodes.length).toBe(3);
  list(h, "anna", [person("c:ghost"), person("c:anna"), person("u:nobody"), person("c:boris", { seen: 0, toMe: 0, fromMe: 0, tier: "friend", lvl: "friend" })]);
  const g = graph(h);
  expect(g.links.map((x: any) => x.to)).toEqual(["c:boris"]);
});

// ---------- the map's own rules (no drawing) ----------

const model = await import(path.join(root, "src/screens/profiles/map-model.ts"));
const N = (id: string, kind = "character") => ({ key: (kind === "user" ? "u:" : "c:") + id, name: id, kind });
const L = (from: string, to: string, level = "acquaintance", band = "", ties: object[] = []) => ({ from: "c:" + from, to: to.includes(":") ? to : "c:" + to, level, band, talks: 1, ties });

test("one edge per pair whichever way the links run, the strongest fact sets its style, the higher level sets its weight", () => {
  const g = { nodes: [N("a"), N("b"), N("c"), N("d"), N("e"), N("me", "user")], links: [L("a", "b", "friend"), L("b", "a", "close", "warm", [{ type: "sibling" }]), L("a", "c", "acquaintance", "hostile"), L("c", "a", "slight", "", [{ type: "crush" }]), L("d", "e", "slight", "", [{ type: "rival" }]), L("a", "u:me", "friend"), L("a", "c:ghost")] };
  const edges = model.edgesOf(g);
  const of = (a: string, b: string) => edges.find((e: any) => e.a === model.pairKey("c:" + a, "c:" + b).split("|")[0] && e.b === model.pairKey("c:" + a, "c:" + b).split("|")[1]);
  expect(edges.length).toBe(4);
  expect(of("a", "b")).toMatchObject({ kind: "family", weight: 5 });
  // a romantic tie beats being at odds; a rival tie beats nothing
  expect(of("a", "c")).toMatchObject({ kind: "romance", weight: 2 });
  expect(of("d", "e")).toMatchObject({ kind: "rival" });
  expect(edges.find((e: any) => e.b === "u:me" || e.a === "u:me")).toMatchObject({ kind: "plain", weight: 4 });
  // cold or hostile alone is "rival" style; an ex is not romantic here
  expect(model.edgesOf({ nodes: [N("a"), N("b")], links: [L("a", "b", "friend", "cold")] })[0].kind).toBe("rival");
  expect(model.edgesOf({ nodes: [N("a"), N("b")], links: [L("a", "b", "friend", "", [{ type: "ex" }])] })[0].kind).toBe("plain");
  expect(model.neighboursOf("c:a", edges).sort()).toEqual(["c:b", "c:c", "u:me"]);
});

test("ringOrder is deterministic, keeps linked people side by side, and places everyone once", () => {
  const nodes = ["a", "b", "c", "d", "e", "f"].map((x) => N(x));
  const links = [L("a", "b", "close"), L("b", "c", "close"), L("d", "e", "close"), L("e", "f", "close"), L("c", "d", "slight")];
  const edges = model.edgesOf({ nodes, links });
  const order = model.ringOrder(nodes, edges);
  expect(order.length).toBe(6);
  expect(new Set(order).size).toBe(6);
  expect(model.ringOrder(nodes, edges)).toEqual(order);
  const pos = (k: string) => order.indexOf("c:" + k);
  for (const [x, y] of [["a", "b"], ["b", "c"], ["d", "e"], ["e", "f"]]) { const d = Math.abs(pos(x) - pos(y)); expect(Math.min(d, 6 - d)).toBeLessThanOrEqual(2); }
  expect(model.ringOrder([], [])).toEqual([]);
});

test("ringPoints: nobody, one in the middle, two on the sides, n on a ring starting at the top", () => {
  expect(model.ringPoints(0, 400, 300, 40)).toEqual([]);
  expect(model.ringPoints(1, 400, 300, 40)).toEqual([{ x: 200, y: 150 }]);
  expect(model.ringPoints(2, 400, 300, 40)).toEqual([{ x: 40, y: 150 }, { x: 360, y: 150 }]);
  const p = model.ringPoints(4, 400, 300, 40);
  expect(p[0]).toEqual({ x: 200, y: 40 });
  expect(p[1].x).toBeCloseTo(360, 0);
  expect(p.every((q: any) => q.x >= 40 && q.x <= 360 && q.y >= 40 && q.y <= 260)).toBe(true);
});

test("crowd: names for all up to 12, smaller nodes after 8 and 16, the list first above 24", () => {
  expect(model.crowd(5)).toEqual({ size: 44, allNames: true, listFirst: false });
  expect(model.crowd(12)).toMatchObject({ size: 36, allNames: true });
  expect(model.crowd(13)).toMatchObject({ size: 36, allNames: false });
  expect(model.crowd(20)).toMatchObject({ size: 28, listFirst: false });
  expect(model.crowd(25).listFirst).toBe(true);
});
