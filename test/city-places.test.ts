// City C3 (#445): the user's own places and districts.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const city = await import(path.join(root, "plugins/city/plugin.js"));

const noon = Date.UTC(2026, 10, 11, 12, 0, 0); // Wednesday, band 4
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));

function memFs(files: Map<string, string>) {
  return {
    read: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    write: (p: string, c: string) => void files.set(p, c),
    remove: (p: string) => void files.delete(p),
    list: (d: string) => {
      const o = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
      if (!o.length) throw new Error("ENOENT");
      return o;
    },
  } as any;
}
function world(ids: string[] = []) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0 }));
  for (const id of ids) files.set(`profiles/${id}.json`, JSON.stringify({ name: id, hue: 100, schedule: always, interests: ["chess"] }));
  return { files, host: { fs: memFs(files) } as any };
}
type World = ReturnType<typeof world>;
const post = (w: World, p: string, body: object = {}) => city.handleRoute({ method: "POST", path: p, body }, w.host);
const stored = (w: World) => JSON.parse(w.files.get("city/places.json")!);
const view = (w: World) => {
  const n = Date.now;
  Date.now = () => noon;
  try {
    return city.handleRoute({ method: "GET", path: "/city" }, w.host).json;
  } finally {
    Date.now = n;
  }
};

test("a new place: defaults fill in, tags and text are cleaned, hours become the grid, an unknown asset is dropped", () => {
  const w = world();
  const r = post(w, "/city/place", { name: " <b>The chess club</b> ", district: "centre", kind: "club", text: "Boards\nand tea", tags: "#Chess, board games, CHESS", seats: 4, hours: { from: 5, to: 8, days: [4, 5, 6] }, picture: "https://evil.example/x.png" });
  expect(r.status).toBe(200);
  const p = stored(w).places.find((x: any) => x.id === r.json.id);
  expect(p.name).toBe("The chess club");
  expect(p.by).toBe("you");
  expect(p.icon).toBeTruthy();
  expect(p.tags).toEqual(["chess", "board games"]);
  expect(p.text).toBe("Boards and tea");
  expect(p.seats).toBe(4);
  expect(p.picture).toBeUndefined();
  expect(city.hoursOf(p.open)).toEqual({ from: 5, to: 8, days: [4, 5, 6] });
  const ok = post(w, "/city/place", { id: p.id, picture: "/v1/assets/abc123" });
  expect(ok.status).toBe(200);
  expect(stored(w).places.find((x: any) => x.id === p.id).picture).toBe("/v1/assets/abc123");
  // an update keeps what it was not told about
  expect(stored(w).places.find((x: any) => x.id === p.id).tags).toEqual(["chess", "board games"]);
});

test("the checks: a name, a district that exists and is not Homes, sane hours, a place that exists", () => {
  const w = world();
  expect(post(w, "/city/place", { name: "", district: "centre" }).status).toBe(400);
  expect(post(w, "/city/place", { name: "A", district: "nowhere" }).status).toBe(400);
  expect(post(w, "/city/place", { name: "A", district: "homes" }).status).toBe(400);
  expect(post(w, "/city/place", { name: "A", district: "centre", hours: { from: 6, to: 3, days: [1] } }).status).toBe(400);
  expect(post(w, "/city/place", { name: "A", district: "centre", hours: { from: 1, to: 3, days: [] } }).status).toBe(400);
  expect(post(w, "/city/place", { id: "ghost", name: "A", district: "centre" }).status).toBe(404);
  expect(post(w, "/city/place/remove", { id: "ghost" }).status).toBe(404);
});

test("changing a stock place makes it the user's (its name is then the stored one); removing works; the cap holds", () => {
  const w = world();
  expect(view(w).districts[0].places.find((p: any) => p.id === "cafe").by).toBe("stock");
  post(w, "/city/place", { id: "cafe", name: "Kava", district: "centre" });
  expect(view(w).districts[0].places.find((p: any) => p.id === "cafe")).toMatchObject({ by: "you", name: "Kava" });
  expect(post(w, "/city/place/remove", { id: "library" }).json.ok).toBe(true);
  expect(stored(w).places.some((p: any) => p.id === "library")).toBe(false);
  for (let i = 0; stored(w).places.length < 60; i++) post(w, "/city/place", { name: "P" + i, district: "work" });
  expect(post(w, "/city/place", { name: "one more", district: "work" }).status).toBe(409);
});

test("districts: make, rename, kind; never a second Homes; remove only when empty; Homes never", () => {
  const w = world();
  const made = post(w, "/city/district", { name: " Old town ", kind: "centre" });
  expect(made.status).toBe(200);
  const id = made.json.id;
  expect(stored(w).districts.find((d: any) => d.id === id)).toMatchObject({ name: "Old town", kind: "centre", by: "you" });
  expect(post(w, "/city/district", { name: "More homes", kind: "homes" }).json.id).toBeTruthy();
  expect(stored(w).districts.filter((d: any) => d.kind === "homes").length).toBe(1); // the new one is custom
  post(w, "/city/district", { id, name: "Harbour", kind: "nature" });
  expect(stored(w).districts.find((d: any) => d.id === id)).toMatchObject({ name: "Harbour", kind: "nature" });
  const place = post(w, "/city/place", { name: "Pier", district: id });
  expect(post(w, "/city/district/remove", { id }).status).toBe(409);
  post(w, "/city/place/remove", { id: place.json.id });
  expect(post(w, "/city/district/remove", { id }).json.ok).toBe(true);
  expect(post(w, "/city/district/remove", { id: "homes" }).status).toBe(409);
  expect(post(w, "/city/district", { name: "" }).status).toBe(400);
  expect(post(w, "/city/district", { id: "ghost", name: "x" }).status).toBe(404);
});

test("the view carries what the form needs, and Homes stays last in the town", () => {
  const w = world(["a"]);
  const d = post(w, "/city/district", { name: "Harbour" }).json.id;
  const pl = post(w, "/city/place", { name: "Pier", district: d, tags: ["boats"], hours: { from: 2, to: 8, days: [0, 1, 2, 3, 4, 5, 6] } }).json.id;
  const v = view(w);
  const harbour = v.districts.find((x: any) => x.id === d);
  expect(harbour).toMatchObject({ name: "Harbour", by: "you", kind: "custom" });
  expect(harbour.places[0]).toMatchObject({ id: pl, district: d, tags: ["boats"], hours: { from: 2, to: 8, days: [0, 1, 2, 3, 4, 5, 6] } });
  expect(v.homesDistrict).toBe("homes");
  expect(v.districts.some((x: any) => x.id === "homes")).toBe(false);
});

test("hoursOf gives null for a grid the form cannot show, and the stock hours round-trip", () => {
  for (const p of city.stockTown().places) {
    const h = city.hoursOf(p.open);
    expect(h, p.id).not.toBeNull();
    expect(city.gridFromHours(h)).toEqual(p.open);
  }
  const odd = city.stockTown().places[0].open.map((r: number[]) => r.slice());
  odd[0][0] = 1;
  expect(city.hoursOf(odd)).toBeNull();
});

test("a place the user made takes part in the day: a matching interest draws characters there", () => {
  const w = world();
  const places = city.stockTown().places;
  const mine = { ...places[0], id: "chess", name: "Chess", tags: ["chess"], seats: 200, by: "you" };
  const ctx = (extra: object = {}) => ({ places: [mine], band: 4, weekday: 2, day: "2026-11-11", tz: 0, now: noon, seats: {}, placed: {}, close: new Set(), ...extra });
  const prof = (id: string, interests: string[]) => ({ id, name: id, hue: 1, picture: "", schedule: always, interests, lifeOn: true, workplace: "" });
  let fans = 0;
  let others = 0;
  for (let i = 0; i < 300; i++) {
    if (city.placeAt(prof("f" + i, ["chess"]), ctx()) === "chess") fans++;
    if (city.placeAt(prof("f" + i, ["knitting"]), ctx()) === "chess") others++;
  }
  expect(fans).toBeGreaterThan(others);
  expect(w.files.size).toBeGreaterThan(0);
});

test("restore the stock town: own places and districts go, the rest stays", () => {
  const w = world(["a"]);
  const d = post(w, "/city/district", { name: "Harbour" }).json.id;
  post(w, "/city/place", { name: "Pier", district: d });
  post(w, "/city/place/remove", { id: "park" });
  w.files.set("city/homes.json", JSON.stringify({ buildings: [{ id: "b1", n: 1, flats: 8 }], flats: { a: { b: "b1", n: 1 } } }));
  expect(post(w, "/city/reset").json.ok).toBe(true);
  expect(stored(w).districts.map((x: any) => x.id)).toEqual(["centre", "nature", "work", "homes"]);
  expect(stored(w).places.some((p: any) => p.id === "park")).toBe(true);
  expect(stored(w).places.every((p: any) => p.by === "stock")).toBe(true);
  expect(JSON.parse(w.files.get("city/homes.json")!).flats.a).toEqual({ b: "b1", n: 1 });
});
