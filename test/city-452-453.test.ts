// City #452 (pictures of places and districts) and the City part of #453 (workplace, shared flats, rooms that share the day's caps).
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const city = await import(path.join(root, "plugins/city/plugin.js"));
const clubs = await import(path.join(root, "plugins/clubs/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const life = await import(path.join(root, "plugins/life/plugin.js"));

const noon = Date.UTC(2026, 10, 11, 12, 0, 0); // Wednesday, band 4 (a work band)
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const busy = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "dnd"));

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
function world(profiles: Record<string, object> = {}, settings: object = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, ...settings }));
  files.set("you.json", JSON.stringify({ active: "me1", personas: [{ id: "me1", name: "Me" }] }));
  for (const [id, p] of Object.entries(profiles)) files.set(`profiles/${id}.json`, JSON.stringify({ name: id.toUpperCase(), hue: 100, schedule: always, ...p }));
  return { files, host: { fs: memFs(files), llm: { request() {}, results: {} } } as any };
}
type World = ReturnType<typeof world>;
const run = <T,>(fn: () => T, t = noon): T => {
  const n = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = n;
  }
};
const cityPost = (w: World, p: string, body: object = {}) => run(() => city.handleRoute({ method: "POST", path: p, body }, w.host));
const cityView = (w: World) => run(() => city.handleRoute({ method: "GET", path: "/city" }, w.host).json);
const stored = (w: World) => JSON.parse(w.files.get("city/places.json")!);
const people = (w: World, id: string, list: object[]) => w.files.set(`life/people/${id}.json`, JSON.stringify({ people: list }));

// ---------- #452 pictures ----------

test("a place's background: stored for an asset url, dropped for anything else, removed with an empty value, shown by the view", () => {
  const w = world({ a: {} });
  const r = cityPost(w, "/city/place", { name: "The pier", district: "nature", background: "/v1/assets/pier1" });
  expect(r.status).toBe(200);
  expect(stored(w).places.find((x: any) => x.id === r.json.id).background).toBe("/v1/assets/pier1");
  const v = cityView(w).districts.find((d: any) => d.id === "nature").places.find((p: any) => p.id === r.json.id);
  expect(v.background).toBe("/v1/assets/pier1");
  // an edit that does not name it keeps it; a foreign url is not stored; "" removes it with the old small picture
  cityPost(w, "/city/place", { id: r.json.id, text: "Boards over the water" });
  expect(stored(w).places.find((x: any) => x.id === r.json.id).background).toBe("/v1/assets/pier1");
  cityPost(w, "/city/place", { id: r.json.id, background: "https://evil.example/x.png" });
  expect(stored(w).places.find((x: any) => x.id === r.json.id).background).toBeUndefined();
  cityPost(w, "/city/place", { id: r.json.id, background: "/v1/assets/pier2", picture: "/v1/assets/old" });
  cityPost(w, "/city/place", { id: r.json.id, background: "", picture: "" });
  const p = stored(w).places.find((x: any) => x.id === r.json.id);
  expect(p.background).toBeUndefined();
  expect(p.picture).toBeUndefined();
});

test("a district's background: new and edited districts and Homes keep it; a damaged file drops a bad one; the stock town has none", () => {
  const w = world({ a: {} });
  const r = cityPost(w, "/city/district", { name: "Old town", kind: "centre", background: "/v1/assets/old1" });
  expect(stored(w).districts.find((d: any) => d.id === r.json.id).background).toBe("/v1/assets/old1");
  cityPost(w, "/city/district", { id: "homes", name: "Homes", background: "/v1/assets/homes1" });
  const v = cityView(w);
  expect(v.homesBackground).toBe("/v1/assets/homes1");
  expect(v.districts.find((d: any) => d.id === r.json.id).background).toBe("/v1/assets/old1");
  // renaming keeps the picture, "" removes it
  cityPost(w, "/city/district", { id: r.json.id, name: "Older town" });
  expect(stored(w).districts.find((d: any) => d.id === r.json.id).background).toBe("/v1/assets/old1");
  cityPost(w, "/city/district", { id: r.json.id, name: "Older town", background: "" });
  expect(stored(w).districts.find((d: any) => d.id === r.json.id).background).toBeUndefined();
  const town = stored(w);
  town.districts[0].background = "javascript:alert(1)";
  w.files.set("city/places.json", JSON.stringify(town));
  expect(city.readTown(w.host.fs).districts[0].background).toBeUndefined();
  cityPost(w, "/city/reset");
  expect(stored(w).districts.some((d: any) => d.background)).toBe(false);
});

test("a room carries the picture of its place, and a character's chat carries it only with the place line switched on", () => {
  const w = world({ a: {}, b: {} });
  cityPost(w, "/city/place", { id: "cafe", background: "/v1/assets/cafe1" });
  w.files.set("city/now.json", JSON.stringify({ id: "2026-11-11#4", at: noon, where: { a: "cafe", b: "cafe" } }));
  w.files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { clubs: true } }));
  const room = run(() => clubs.handleRoute({ method: "POST", path: "/clubs/room", body: { place: "cafe", name: "Cafe" }, query: {} } as any, w.host)).json;
  expect(room.club.room.picture).toBe("/v1/assets/cafe1");
  expect(run(() => messenger.placeOf(w.host.fs, { id: "a" }))).toBeNull();
  w.files.set("settings.json", JSON.stringify({ tzOffset: 0, messengerPlace: true }));
  expect(run(() => messenger.placeOf(w.host.fs, { id: "a" }))).toEqual({ id: "cafe", name: "The cafe by the park", picture: "/v1/assets/cafe1" });
  // at home: nothing
  w.files.set("city/now.json", JSON.stringify({ id: "2026-11-11#4", at: noon, where: { a: "home" } }));
  expect(run(() => messenger.placeOf(w.host.fs, { id: "a" }))).toBeNull();
});

// ---------- #453 workplace ----------

test("a busy character works at its own workplace; one with none takes the workplace of its boss, subordinate or colleague", () => {
  const w = world({ boss: { schedule: busy, workplace: "workshop" }, clerk: { schedule: busy }, loner: { schedule: busy }, gone: { schedule: busy, workplace: "nowhere" } });
  people(w, "clerk", [{ key: "c:boss", ties: [{ type: "boss" }] }]);
  const where = run(() => city.whereAll(w.host.fs, noon, 0));
  expect(where.boss).toBe("workshop");
  expect(where.clerk).toBe("workshop");
  expect(where.loner).toBe("home");
  // a workplace that is not a place of the town counts as none
  expect(where.gone).toBe("home");
  // a family tie does not carry a workplace
  people(w, "loner", [{ key: "c:boss", ties: [{ type: "sibling" }] }]);
  expect(run(() => city.whereAll(w.host.fs, noon, 0)).loner).toBe("home");
});

// ---------- #453 shared flats ----------

test("Life keeps the Live together mark only on family and romantic ties, and mirrors it with a family tie", () => {
  expect(life.cleanTies([{ type: "spouse", home: true }, { type: "colleague", home: true }])).toEqual([{ type: "spouse", home: true }, { type: "colleague" }]);
  expect(life.mirrorTies([{ type: "parent", home: true }])).toEqual([{ type: "child", home: true }]);
});

test("profiles who live together share one flat; when the mark goes, the later one moves out to a free flat", () => {
  const w = world({ ann: {}, bob: {}, cat: {} });
  run(() => city.onTick({}, w.host));
  const first = JSON.parse(w.files.get("city/homes.json")!).flats;
  expect(new Set(Object.values(first).map((f: any) => f.b + "#" + f.n)).size).toBe(3);
  // one side's mark is enough (a romantic tie is one way)
  people(w, "bob", [{ key: "c:ann", ties: [{ type: "partner", home: true }] }]);
  run(() => city.onTick({}, w.host));
  const shared = JSON.parse(w.files.get("city/homes.json")!).flats;
  expect(shared.bob).toEqual(shared.ann);
  expect(shared.cat).not.toEqual(shared.ann);
  // the doors of both show the same flat number
  const doors = cityView(w).homes.buildings.flatMap((b: any) => b.doors);
  expect(doors.find((d: any) => d.id === "ann").flat).toBe(doors.find((d: any) => d.id === "bob").flat);
  people(w, "bob", [{ key: "c:ann", ties: [{ type: "partner" }] }]);
  run(() => city.onTick({}, w.host));
  const apart = JSON.parse(w.files.get("city/homes.json")!).flats;
  expect(apart.ann).toEqual(shared.ann);
  expect(apart.bob).not.toEqual(apart.ann);
  expect(apart.bob).not.toEqual(apart.cat);
});

test("assignHomes: a group of three in one flat, a member that is gone frees nothing of the others", () => {
  const out = city.assignHomes({ buildings: [], flats: {} }, ["a", "b", "c", "d"], [["a", "b", "c"]]).homes;
  expect(out.flats.a).toEqual(out.flats.b);
  expect(out.flats.b).toEqual(out.flats.c);
  expect(out.flats.d).not.toEqual(out.flats.a);
  const later = city.assignHomes(out, ["b", "c", "d"], [["b", "c"]]).homes;
  expect(later.flats.b).toEqual(out.flats.b);
  expect(later.flats.c).toEqual(out.flats.b);
});

// ---------- #453 rooms share the day's caps ----------

test("a new room of the same day starts from the counts of the rooms that ended, not from zero", () => {
  const w = world({ a: {}, b: {} }, { community: { clubs: true } });
  w.files.set("city/now.json", JSON.stringify({ id: "2026-11-11#4", at: noon, where: { a: "cafe", b: "cafe" } }));
  const walk = (place: string) => run(() => clubs.handleRoute({ method: "POST", path: "/clubs/room", body: { place, name: "Room" }, query: {} } as any, w.host)).json.club.id;
  const id1 = walk("cafe");
  const c1 = JSON.parse(w.files.get(`clubs/${id1}.json`)!);
  w.files.set(`clubs/${id1}.json`, JSON.stringify({ ...c1, today: 7, answered: 3 }));
  // walking into another place ends the first room; the new one carries its counts
  const id2 = walk("cafe");
  const c2 = JSON.parse(w.files.get(`clubs/${id2}.json`)!);
  expect(w.files.has(`clubs/${id1}.json`)).toBe(false);
  expect([c2.today, c2.answered]).toEqual([7, 3]);
  // leaving keeps them too; the next day starts again
  run(() => clubs.handleRoute({ method: "POST", path: "/clubs/remove", body: { id: id2 }, query: {} } as any, w.host));
  const id3 = walk("cafe");
  expect(JSON.parse(w.files.get(`clubs/${id3}.json`)!).today).toBe(7);
  const tomorrow = noon + 24 * 3600000;
  w.files.set("city/now.json", JSON.stringify({ id: "2026-11-12#4", at: tomorrow, where: { a: "cafe", b: "cafe" } }));
  const id4 = run(() => clubs.handleRoute({ method: "POST", path: "/clubs/room", body: { place: "cafe", name: "Room" }, query: {} } as any, w.host), tomorrow).json.club.id;
  expect(JSON.parse(w.files.get(`clubs/${id4}.json`)!).today).toBe(0);
});
