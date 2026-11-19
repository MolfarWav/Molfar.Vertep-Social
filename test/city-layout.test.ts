// City C5 follow-up (#458): the user moves a building on the district's drawing. The geometry (which lot each place stands on) and the
// route that keeps the order; the order is a field of the district, not of the place, so a stock place stays stock.
import { expect, test } from "bun:test";
import path from "node:path";
import { isoAllLots, isoGrid, isoSlots } from "../src/screens/city/iso";

const root = path.resolve(import.meta.dir, "..");
const city = await import(path.join(root, "plugins/city/plugin.js"));

test("with nothing saved the places stand in the tiles' order; a saved lot is kept and the others fill the free ones", () => {
  expect(isoSlots(["a", "b", "c"])).toEqual([0, 1, 2]);
  expect(isoSlots(["a", "b", "c"], { g: 2, at: { b: 3 } })).toEqual([0, 3, 1]);
  // a place of the district that has no saved lot (added later) takes the first free one
  expect(isoSlots(["a", "b", "c", "d"], { g: 2, at: { a: 2, b: 0 } })).toEqual([2, 0, 1, 3]);
});

test("a layout made for another grid size, a lot outside the grid and two places on one lot are ignored", () => {
  expect(isoSlots(["a", "b", "c", "d", "e"], { g: 2, at: { a: 3 } })).toEqual([0, 1, 2, 3, 4]); // five places make a 3 x 3 grid now
  expect(isoSlots(["a", "b"], { g: 2, at: { a: 9, b: 1.5 } })).toEqual([0, 1]);
  expect(isoSlots(["a", "b"], { g: 2, at: { a: 2, b: 2 } })).toEqual([2, 0]);
  const slots = isoSlots(["a", "b", "c"], { g: 2, at: { c: 0, a: 0 } });
  expect(new Set(slots).size).toBe(3);
});

test("every slot is a real lot of the grid, whatever was saved", () => {
  for (const n of [1, 2, 5, 10, 17, 25]) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const g = isoGrid(n);
    const saved = { g, at: Object.fromEntries(ids.map((id, i) => [id, (i * 7) % (g * g)])) };
    const slots = isoSlots(ids, saved);
    expect(new Set(slots).size).toBe(n);
    expect(slots.every((s) => s >= 0 && s < isoAllLots(n).length)).toBe(true);
  }
});

const noon = Date.UTC(2026, 10, 11, 12, 0, 0);
function world() {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0 }));
  const fs = {
    read: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    write: (p: string, c: string) => void files.set(p, c),
    remove: (p: string) => void files.delete(p),
    list: () => {
      throw new Error("ENOENT");
    },
  } as any;
  return { files, host: { fs } as any };
}
const post = (w: ReturnType<typeof world>, p: string, body: object) => city.handleRoute({ method: "POST", path: p, body }, w.host);
const stored = (w: ReturnType<typeof world>) => JSON.parse(w.files.get("city/places.json")!);
const districtView = (w: ReturnType<typeof world>, id: string) => {
  const was = Date.now;
  Date.now = () => noon;
  try {
    return city.handleRoute({ method: "GET", path: "/city" }, w.host).json.districts.find((d: any) => d.id === id);
  } finally {
    Date.now = was;
  }
};

test("the layout route keeps the order on the district, answers with it, and never turns a stock place into a place of yours", () => {
  const w = world();
  const d = districtView(w, "centre");
  expect(d.lots).toBeUndefined();
  const ids = d.places.map((p: any) => p.id);
  expect(ids.length).toBeGreaterThan(1);
  const g = isoGrid(ids.length);
  const r = post(w, "/city/layout", { district: "centre", lots: { g, at: { [ids[0]]: g * g - 1, [ids[1]]: 0 } } });
  expect(r.json.ok).toBe(true);
  expect(districtView(w, "centre").lots).toEqual({ g, at: { [ids[0]]: g * g - 1, [ids[1]]: 0 } });
  const t = stored(w);
  expect(t.places.every((p: any) => p.by === "stock")).toBe(true);
  expect(t.districts.find((x: any) => x.id === "centre").by).toBe("stock");
  // editing the district's name keeps the order
  post(w, "/city/district", { id: "centre", name: "Old town" });
  expect(districtView(w, "centre").lots).toBeTruthy();
  // null puts the drawing back in the tiles' order
  expect(post(w, "/city/layout", { district: "centre", lots: null }).json.ok).toBe(true);
  expect(districtView(w, "centre").lots).toBeUndefined();
});

test("the layout route refuses an unknown district, Homes, a bad grid and ids that are not places of the district", () => {
  const w = world();
  expect(post(w, "/city/layout", { district: "nowhere", lots: null }).status).toBe(404);
  expect(post(w, "/city/layout", { district: "homes", lots: { g: 2, at: { x: 0 } } }).status).toBe(400);
  const ids = districtView(w, "centre").places.map((p: any) => p.id);
  expect(post(w, "/city/layout", { district: "centre", lots: { g: 0, at: { [ids[0]]: 0 } } }).status).toBe(400);
  expect(post(w, "/city/layout", { district: "centre", lots: { g: 9, at: { [ids[0]]: 0 } } }).status).toBe(400);
  expect(post(w, "/city/layout", { district: "centre", lots: { g: 2, at: { "not-a-place": 0 } } }).status).toBe(400);
  expect(post(w, "/city/layout", { district: "centre", lots: "x" }).status).toBe(400);
  // a lot twice, a lot outside the grid and a fractional lot are dropped one by one
  const g = isoGrid(ids.length);
  expect(post(w, "/city/layout", { district: "centre", lots: { g, at: { [ids[0]]: 1, [ids[1]]: 1, [ids[2] ?? ids[0]]: 99 } } }).json.ok).toBe(true);
  expect(districtView(w, "centre").lots.at).toEqual({ [ids[0]]: 1 });
  expect(districtView(w, "nature").lots).toBeUndefined();
});

test("a places file with a broken layout reads as no layout", () => {
  const w = world();
  const town = JSON.parse(JSON.stringify(city.readTown(w.host.fs)));
  town.districts[0].lots = { g: 2, at: { a: "x" } };
  w.files.set("city/places.json", JSON.stringify(town));
  expect(city.readTown(w.host.fs).districts[0].lots).toBeUndefined();
  expect(city.cleanLots({ g: 2, at: { ok: 1 } })).toEqual({ g: 2, at: { ok: 1 } });
  expect(city.cleanLots(null)).toBeNull();
  expect(city.cleanLots({ g: 2, at: {} })).toBeNull();
});
