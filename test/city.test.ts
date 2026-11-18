// City (#445, C1): a stock town, a home for every profile, and where each character is by rules, with no model call.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const city = await import(path.join(root, "plugins/city/plugin.js"));

const noon = Date.UTC(2026, 10, 11, 12, 0, 0); // a Wednesday, band 4
const HOUR = 3600000;
const sched = (cell: string) => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => cell));

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

// a model that must never be used in this phase
const llm = new Proxy({}, { get: () => { throw new Error("the city made a model call"); } });

function world(profiles: Record<string, object> = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0 }));
  for (const [id, p] of Object.entries(profiles)) files.set(`profiles/${id}.json`, JSON.stringify({ name: id.toUpperCase(), hue: 100, schedule: sched("online"), ...p }));
  return { files, host: { fs: memFs(files), llm } as any };
}
const run = <T,>(fn: () => T, at = noon): T => {
  const n = Date.now;
  Date.now = () => at;
  try {
    return fn();
  } finally {
    Date.now = n;
  }
};
const tick = (w: ReturnType<typeof world>, at = noon) => run(() => city.onTick({}, w.host), at);
const get = (w: ReturnType<typeof world>, at = noon) => run(() => city.handleRoute({ method: "GET", path: "/city" }, w.host), at).json;
const stored = (w: ReturnType<typeof world>, f: string) => JSON.parse(w.files.get(f)!);
const ctx = (over: object = {}) => ({ places: city.stockTown().places, band: 4, weekday: 2, day: "2026-11-11", tz: 0, now: noon, seats: {}, placed: {}, close: new Set(), ...over });
const prof = (id: string, over: object = {}) => ({ id, name: id, hue: 1, picture: "", schedule: sched("online"), interests: [], lifeOn: true, workplace: "", ...over });

test("the stock town is plain: districts, places with hours, no real names", () => {
  const t = city.stockTown();
  expect(t.districts.map((d: any) => d.kind)).toEqual(["centre", "nature", "work", "homes"]);
  expect(t.places.length).toBeGreaterThanOrEqual(8);
  for (const p of t.places) {
    expect(p.open.length).toBe(8);
    expect(p.open.every((r: number[]) => r.length === 7)).toBe(true);
  }
  expect(JSON.stringify(t)).not.toMatch(/Kyiv|London|Starbucks/);
});

test("every profile gets exactly one flat, and a new building appears when they run out", () => {
  const ids = Array.from({ length: 10 }, (_, i) => "p" + String(i).padStart(2, "0"));
  const first = city.assignHomes({ buildings: [], flats: {} }, ids);
  expect(Object.keys(first.homes.flats).sort()).toEqual(ids);
  expect(first.homes.buildings.length).toBe(2);
  const spots = Object.values(first.homes.flats).map((f: any) => f.b + "#" + f.n);
  expect(new Set(spots).size).toBe(10);
  // nothing moves when nothing changed, a newcomer takes the first free flat, a leaver frees theirs
  expect(city.assignHomes(first.homes, ids).changed).toBe(false);
  const left = city.assignHomes(first.homes, ids.slice(1));
  const added = city.assignHomes(left.homes, [...ids.slice(1), "zz"]);
  expect(added.homes.flats.zz).toEqual(first.homes.flats[ids[0]]);
  expect(added.homes.flats[ids[5]]).toEqual(first.homes.flats[ids[5]]);
});

test("status off always means home; life off stays home; na or dnd goes to a workplace only in work hours", () => {
  expect(city.placeAt(prof("a", { schedule: sched("off") }), ctx())).toBe("home");
  expect(city.placeAt(prof("a", { lifeOn: false }), ctx())).toBe("home");
  const busy = prof("a", { schedule: sched("na"), workplace: "office" });
  expect(city.placeAt(busy, ctx())).toBe("office");
  expect(city.placeAt(busy, ctx({ band: 6 }))).toBe("home"); // evening
  expect(city.placeAt(busy, ctx({ weekday: 5 }))).toBe("home"); // Saturday
  expect(city.placeAt(prof("a", { schedule: sched("dnd") }), ctx())).toBe("home"); // no workplace
});

test("the same profile and band give the same answer; a closed place or a full one is never picked", () => {
  const p = prof("fox", { interests: ["fishing"] });
  const a = city.placeAt(p, ctx());
  for (let i = 0; i < 5; i++) expect(city.placeAt(p, ctx())).toBe(a);
  const places = city.stockTown().places;
  // Sunday 09:00: the library and the office are closed
  for (let i = 0; i < 300; i++) expect(["library", "office"].includes(city.placeAt(prof("q" + i), ctx({ band: 3, weekday: 6 })))).toBe(false);
  // 00:00 to 03:00: nothing but the park... and the park is open all night in the stock town? no: it opens at 06:00
  for (let i = 0; i < 100; i++) expect(city.placeAt(prof("n" + i), ctx({ band: 0 }))).toBe("home");
  const full = ctx({ seats: Object.fromEntries(places.map((x: any) => [x.id, x.seats])) });
  for (let i = 0; i < 50; i++) expect(city.placeAt(prof("f" + i), full)).toBe("home");
});

test("interests and company pull a character to a place", () => {
  let fishing = 0;
  let plain = 0;
  for (let i = 0; i < 400; i++) {
    if (city.placeAt(prof("a" + i, { interests: ["fishing"] }), ctx()) === "riverside") fishing++;
    if (city.placeAt(prof("a" + i), ctx()) === "riverside") plain++;
  }
  expect(fishing).toBeGreaterThan(plain);
  let withFriend = 0;
  let without = 0;
  for (let i = 0; i < 400; i++) {
    if (city.placeAt(prof("b" + i), ctx({ band: 5, placed: { pal: "cinema" }, close: new Set(["pal"]) })) === "cinema") withFriend++;
    if (city.placeAt(prof("b" + i), ctx({ band: 5, placed: { pal: "cinema" } })) === "cinema") without++;
  }
  expect(withFriend).toBeGreaterThan(without);
});

test("the tick writes the town once, a flat for everyone, and now.json once per band, with no model call", () => {
  const w = world({ mavka: {}, lis: { interests: ["fishing"] } });
  tick(w);
  expect(stored(w, "city/places.json").places.length).toBeGreaterThanOrEqual(8);
  expect(Object.keys(stored(w, "city/homes.json").flats).sort()).toEqual(["lis", "mavka"]);
  const now1 = stored(w, "city/now.json");
  expect(now1.id).toBe("2026-11-11#4");
  expect(Object.keys(now1.where).sort()).toEqual(["lis", "mavka"]);
  // the same band: nothing is rewritten, even a tampered file stays
  w.files.set("city/now.json", JSON.stringify({ ...now1, at: 1 }));
  tick(w, noon + HOUR);
  expect(stored(w, "city/now.json").at).toBe(1);
  // the next band: written again
  tick(w, noon + 3 * HOUR);
  expect(stored(w, "city/now.json").id).toBe("2026-11-11#5");
});

test("an empty profiles folder (maybe a failed read) assigns and frees nothing", () => {
  const w = world({ mavka: {} });
  tick(w);
  const before = w.files.get("city/homes.json");
  w.files.delete("profiles/mavka.json");
  tick(w, noon + 3 * HOUR);
  expect(w.files.get("city/homes.json")).toBe(before);
});

test("the view lists places with who is there, homes with doors, and shows where someone is only to those who know them", () => {
  const w = world({ mavka: { schedule: sched("off") }, lis: {}, fox: { schedule: sched("online") } });
  w.files.set("you.json", JSON.stringify({ active: "me1", personas: [{ id: "me1", name: "Me" }] }));
  tick(w);
  const v = get(w);
  expect(v.from).toBe(12);
  expect(v.to).toBe(15);
  expect(v.districts.map((d: any) => d.id)).toEqual(["centre", "nature", "work"]);
  const door = (view: any, id: string) => view.homes.buildings.flatMap((b: any) => b.doors).find((d: any) => d.id === id);
  expect(door(v, "mavka").state).toBe("dark");
  const out = ["lis", "fox"].filter((id) => door(v, id).state === "out");
  for (const id of out) expect(door(v, id).where).toBeUndefined();
  for (const id of out) w.files.set(`life/people/${id}.json`, JSON.stringify({ people: [{ key: "u:me1", lvl: "friend" }] }));
  const v2 = get(w);
  for (const id of out) expect(door(v2, id).where).toBeTruthy();
  // everyone shown in a place is also out
  const faces = v.districts.flatMap((d: any) => d.places.flatMap((p: any) => p.people.map((x: any) => x.id)));
  expect(faces.sort()).toEqual(out.sort());
  expect(v.empty).toBe(false);
});

test("the view works before the first tick, and an empty town says so", () => {
  const w = world({ mavka: {} });
  expect(get(w).homes.buildings).toEqual([]); // no flats yet
  expect(get(w).districts.length).toBe(3);
  expect(get(world()).empty).toBe(true);
});

test("a damaged places file falls back to the stock town; a hostile place is dropped", () => {
  const w = world({ mavka: {} });
  w.files.set("city/places.json", "{nope");
  expect(city.readTown(w.host.fs).places.length).toBeGreaterThanOrEqual(8);
  const t = city.stockTown();
  t.places.push({ id: "home", district: "centre", name: "Fake", open: t.places[0].open }, { id: "x1", district: "nowhere", name: "Lost", open: t.places[0].open }, { id: "x2", district: "centre", name: "<b>Bad</b> hours", open: [[1]] });
  w.files.set("city/places.json", JSON.stringify(t));
  const read = city.readTown(w.host.fs);
  expect(read.places.some((p: any) => ["home", "x1", "x2"].includes(p.id))).toBe(false);
});
