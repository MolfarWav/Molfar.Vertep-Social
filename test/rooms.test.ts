// City C2 (#445): listening at a place, and walking in (a room: a club of the characters who are there, until the band ends).
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const city = await import(path.join(root, "plugins/city/plugin.js"));
const clubs = await import(path.join(root, "plugins/clubs/plugin.js"));

const noon = Date.UTC(2026, 10, 11, 12, 0, 0); // Wednesday, band 4 (12:00 to 15:00)
const HOUR = 3600000;
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

function world(ids: string[], at: Record<string, string>, clubsOn = true) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { clubs: clubsOn } }));
  files.set("you.json", JSON.stringify({ active: "me1", personas: [{ id: "me1", name: "Me" }] }));
  for (const id of ids) files.set(`profiles/${id}.json`, JSON.stringify({ name: id.toUpperCase(), hue: 100, about: "x", schedule: always }));
  files.set("city/now.json", JSON.stringify({ id: "2026-11-11#4", at: noon, where: at }));
  return { files, host: { fs: memFs(files), llm: { request() {}, results: {} } } as any };
}
const run = <T,>(fn: () => T, t = noon): T => {
  const n = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = n;
  }
};
const clubRoute = (w: ReturnType<typeof world>, method: string, p: string, body: object = {}, t = noon) => run(() => clubs.handleRoute({ method, path: p, body, query: {} } as any, w.host), t);
const listen = (w: ReturnType<typeof world>, place: string, t = noon) => run(() => city.handleRoute({ method: "GET", path: "/city/listen", query: { place } } as any, w.host), t).json;
const msg = (id: string, by: string, at: number, text: string) => ({ id, by, at, text });

test("listening: only lines between characters who are at the place, newest last, within three days", () => {
  const w = world(["a", "b", "c", "d"], { a: "cafe", b: "cafe", c: "park", d: "cafe" });
  w.files.set("chatter/a__b.json", JSON.stringify({ a: "a", b: "b", on: true, messages: [msg("1", "a", noon - HOUR, "Coffee?"), msg("2", "b", noon - HOUR + 1000, "Yes, please."), msg("0", "a", noon - 5 * 24 * HOUR, "Too old.")] }));
  w.files.set("chatter/a__c.json", JSON.stringify({ a: "a", b: "c", on: true, messages: [msg("3", "a", noon - HOUR, "c is in the park")] }));
  w.files.set("clubs/cl-1.json", JSON.stringify({ id: "cl-1", members: ["a", "b", "d"], messages: [msg("m1", "d", noon - 2 * HOUR, "Anyone read it?"), msg("m2", "me", noon - 2 * HOUR, "the user's own line"), msg("m3", "c", noon - 2 * HOUR, "not a member here")] }));
  w.files.set("clubs/cl-2.json", JSON.stringify({ id: "cl-2", members: ["a", "c", "x"], messages: [msg("n1", "a", noon - HOUR, "only one of this club is here")] }));
  const r = listen(w, "cafe");
  expect(r.present).toBe(3);
  expect(r.lines.map((l: any) => l.text)).toEqual(["Anyone read it?", "Coffee?", "Yes, please."]);
  expect(r.lines.map((l: any) => l.via)).toEqual(["club", "chatter", "chatter"]);
  expect(JSON.stringify(r)).not.toMatch(/Too old|park|user's own|only one/);
  expect(listen(w, "park").lines).toEqual([]); // one character: nobody to talk to
  expect(city.handleRoute({ method: "GET", path: "/city/listen", query: { place: "../x" } }, w.host).status).toBe(400);
});

test("walking in: a room of the characters who are here, the best-known first, at most four", () => {
  const w = world(["a", "b", "c", "d", "e", "z"], { a: "cafe", b: "cafe", c: "cafe", d: "cafe", e: "cafe", z: "park" });
  w.files.set("life/people/e.json", JSON.stringify({ people: [{ key: "u:me1", lvl: "friend" }] }));
  w.files.set("life/people/c.json", JSON.stringify({ people: [{ key: "u:me1", lvl: "acquaintance" }] }));
  const r = clubRoute(w, "POST", "/clubs/room", { place: "cafe", name: "The cafe" });
  expect(r.status).toBe(200);
  expect(r.json.club.members.map((m: any) => m.id)).toEqual(["e", "c", "a", "b"]);
  expect(r.json.club.room.place).toBe("cafe");
  expect(r.json.club.room.until).toBe(noon + 3 * HOUR);
  expect(r.json.club.on).toBe(true);
  const list = clubRoute(w, "GET", "/clubs").json;
  expect(list.clubs.length).toBe(1);
});

test("walking in is refused when clubs are off, the city has not moved, or fewer than two are here", () => {
  expect(clubRoute(world(["a", "b"], { a: "cafe", b: "cafe" }, false), "POST", "/clubs/room", { place: "cafe" }).status).toBe(409);
  const stale = world(["a", "b"], { a: "cafe", b: "cafe" });
  stale.files.set("city/now.json", JSON.stringify({ id: "2026-11-11#3", at: 1, where: { a: "cafe", b: "cafe" } }));
  expect(clubRoute(stale, "POST", "/clubs/room", { place: "cafe" }).status).toBe(409);
  const lonely = world(["a", "b"], { a: "cafe", b: "park" });
  expect(clubRoute(lonely, "POST", "/clubs/room", { place: "cafe" }).status).toBe(409);
  expect(clubRoute(lonely, "POST", "/clubs/room", { place: "../x" }).status).toBe(400);
});

test("one room at a time, not counted toward the most clubs, and it cannot be edited", () => {
  const w = world(["a", "b", "c", "d"], { a: "cafe", b: "cafe", c: "park", d: "park" });
  for (const n of ["k1", "k2", "k3"]) w.files.set(`clubs/cl-${n}.json`, JSON.stringify({ id: `cl-${n}`, name: n, members: ["a", "b", "c"], on: true, messages: [] }));
  expect(clubRoute(w, "POST", "/clubs/club", { name: "fourth", members: ["a", "b", "c"] }).status).toBe(409); // three clubs already
  const first = clubRoute(w, "POST", "/clubs/room", { place: "cafe", name: "Cafe" });
  expect(first.status).toBe(200); // a room does not need a slot
  const second = clubRoute(w, "POST", "/clubs/room", { place: "park", name: "Park" });
  expect(second.status).toBe(200);
  const list = clubRoute(w, "GET", "/clubs").json.clubs;
  expect(list.filter((c: any) => c.room).map((c: any) => c.room.place)).toEqual(["park"]);
  expect(list.length).toBe(4);
  const id = second.json.club.id;
  expect(clubRoute(w, "POST", "/clubs/edit", { id, name: "Mine" }).status).toBe(409);
  expect(clubRoute(w, "POST", "/clubs/edit", { id, on: false }).json.club.on).toBe(false);
  // leaving ends it
  expect(clubRoute(w, "POST", "/clubs/remove", { id }).json.ok).toBe(true);
  expect(clubRoute(w, "GET", "/clubs").json.clubs.some((c: any) => c.room)).toBe(false);
});

test("a room ends when its band ends (the tick sweeps it), and a room of two stays on", () => {
  const w = world(["a", "b"], { a: "cafe", b: "cafe" });
  const made = clubRoute(w, "POST", "/clubs/room", { place: "cafe", name: "Cafe" });
  expect(made.json.club.members.length).toBe(2);
  expect(made.json.club.on).toBe(true);
  run(() => clubs.onTick({}, w.host), noon + HOUR);
  expect([...w.files.keys()].some((k) => k.startsWith("clubs/cl-"))).toBe(true);
  run(() => clubs.onTick({}, w.host), noon + 3 * HOUR + 1000);
  expect([...w.files.keys()].some((k) => k.startsWith("clubs/cl-"))).toBe(false);
});

test("an ordinary club of two is still switched off", () => {
  const w = world(["a", "b"], {});
  w.files.set("clubs/cl-x.json", JSON.stringify({ id: "cl-x", name: "x", members: ["a", "b"], on: true, messages: [] }));
  expect(clubRoute(w, "GET", "/clubs").json.clubs[0].on).toBe(false);
});
