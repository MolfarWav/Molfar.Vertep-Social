// City C4 (#445): other plugins read where a character is (city/now.json, read only). One shared reader, copied and pinned here.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const load = (n: string) => import(path.join(root, `plugins/${n}/plugin.js`));
const life = await load("life");
const chatter = await load("chatter");
const clubs = await load("clubs");
const stories = await load("stories");
const journal = await load("journal");
const messenger = await load("messenger");

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
const at = <T,>(t: number, fn: () => T): T => {
  const n = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = n;
  }
};
const withRandom = <T,>(r: number, fn: () => T): T => {
  const old = Math.random;
  Math.random = () => r;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
};

/** A town with the given places; `where` says who is at which place in the band of `noon`. */
function world(where: Record<string, string>, profiles: string[] = Object.keys(where)) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, life: { on: true }, community: { stories: true, chats: true, clubs: true, journalPosts: true }, messengerPlace: true }));
  for (const id of profiles) files.set(`profiles/${id}.json`, JSON.stringify({ name: id.toUpperCase(), hue: 100, about: "x", schedule: always, interests: ["tea"] }));
  files.set("city/now.json", JSON.stringify({ id: "2026-11-11#4", at: noon, where }));
  files.set("city/places.json", JSON.stringify({ districts: [], places: [{ id: "cafe", name: "The cafe\nby the <b>park</b>" }, { id: "park", name: "The park" }] }));
  return { files, fsx: memFs(files) };
}

test("the shared reader is identical in every plugin that has it", () => {
  const block = (n: string) => {
    const s = fs.readFileSync(path.join(root, `plugins/${n}/plugin.js`), "utf8").replace(/\r\n/g, "\n");
    const m = /\/\/ <city-shared>\n([\s\S]*?)\/\/ <\/city-shared>/.exec(s);
    return m ? m[1] : "";
  };
  const first = block("life");
  expect(first).toContain("function cityNow");
  for (const n of ["chatter", "clubs", "stories", "journal", "messenger"]) expect(block(n), n).toBe(first);
});

test("cityNow: a place, who else is there, sanitized; null at home, in another band, without a city or for a bad place", () => {
  const w = world({ a: "cafe", b: "cafe", c: "park", d: "home" });
  const line = (id: string, t = noon) => at(t, () => messenger.placeLineFor(w.fsx, { id }));
  expect(line("a")).toBe("Right now you are at The cafe by the park, with B. Mention it only if it fits.");
  expect(line("c")).toBe("Right now you are at The park. Mention it only if it fits.");
  expect(line("d")).toBe(""); // at home
  expect(line("zz")).toBe(""); // not placed
  expect(line("a", noon + 3 * 3600000)).toBe(""); // the file is of another band
  w.files.delete("city/places.json");
  expect(line("a")).toBe(""); // no town
});

test("the messenger line is off unless switched on, and short", () => {
  const w = world({ a: "cafe", b: "cafe" });
  w.files.set("settings.json", JSON.stringify({ tzOffset: 0 }));
  expect(at(noon, () => messenger.placeLineFor(w.fsx, { id: "a" }))).toBe("");
  w.files.set("settings.json", JSON.stringify({ tzOffset: 0, messengerPlace: true }));
  const line = at(noon, () => messenger.placeLineFor(w.fsx, { id: "a" }));
  expect(line.length).toBeLessThan(120);
  const prompt = messenger.systemPromptFor({ name: "A", voice: {} }, { name: "Me", about: "" }, "", { place: line });
  expect(prompt).toContain("Right now you are at The cafe by the park");
  expect(messenger.systemPromptFor({ name: "A", voice: {} }, { name: "Me", about: "" }, "", {})).not.toContain("Right now you are at");
});

test("chatter: a pair that is at one place is asked about three times as often", () => {
  const w = world({ a: "cafe", b: "cafe", c: "park", d: "home" });
  for (const key of ["a__b", "c__d"]) w.files.set(`chatter/${key}.json`, JSON.stringify({ a: key.split("__")[0], b: key.split("__")[1], on: true, messages: [] }));
  const settings = { on: true, perDay: 5, tz: 0 };
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const count: Record<string, number> = { a__b: 0, c__d: 0 };
  for (let i = 0; i < 1200; i++) count[at(noon, () => chatter.pickPair(w.fsx, settings, noon, rand)).key]++;
  expect(count.a__b / count.c__d).toBeGreaterThan(2.2);
  expect(count.a__b / count.c__d).toBeLessThan(4);
});

test("clubs: a club with two members at one place talks three times as often", () => {
  const w = world({ a: "cafe", b: "cafe", c: "park", d: "park", e: "home", f: "home" });
  w.files.set("clubs/cl-t.json", JSON.stringify({ id: "cl-t", name: "T", members: ["a", "b", "e"], on: true, messages: [], created: 1 }));
  w.files.set("clubs/cl-s.json", JSON.stringify({ id: "cl-s", name: "S", members: ["c", "e", "f"], on: true, messages: [], created: 1 }));
  const settings = { on: true, perDay: 12, answers: 20, tz: 0 };
  let seed = 11;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const count: Record<string, number> = { "cl-t": 0, "cl-s": 0 };
  let none = 0;
  for (let i = 0; i < 4000; i++) {
    const pick = at(noon, () => clubs.pickTurn(w.fsx, settings, noon, rand));
    if (pick) count[pick.club.id]++;
    else none++;
  }
  expect(none).toBeGreaterThan(0);
  expect(count["cl-t"] / count["cl-s"]).toBeGreaterThan(2.2);
  expect(count["cl-t"] / count["cl-s"]).toBeLessThan(4);
});

test("stories carry the place, journal posts from them and from the diary carry it on", () => {
  const w = world({ mavka: "cafe", lis: "home" });
  w.files.set("life/diary/mavka.json", JSON.stringify({ entries: [{ id: "e1", at: noon - 3600000, day: "2026-11-11", text: "Mended the net by the reeds. The lake was calm.", kind: "routine", by: "model" }] }));
  const host: any = { fs: w.fsx, llm: { results: {}, request() {} } };
  at(noon, () => withRandom(0, () => stories.onTick({}, host)));
  const items = JSON.parse(w.files.get("stories/items.json")!);
  expect(items.stories[0]).toMatchObject({ by: "mavka", place: "The cafe by the park" });
  expect(at(noon, () => stories.handleRoute({ method: "GET", path: "/stories" }, host)).json.stories[0].place).toBe("The cafe by the park");
  // the story runs out: the journal post keeps the place
  w.files.set("stories/items.json", JSON.stringify({ day: "2026-11-11", stories: [{ ...items.stories[0], at: noon - 25 * 3600000 }] }));
  const jh: any = { fs: w.fsx };
  at(noon, () => journal.onTick({}, jh));
  expect(JSON.parse(w.files.get("journal/mavka.json")!).posts[0].place).toBe("The cafe by the park");
  // a post the character writes from its diary
  const j2: any = { fs: w.fsx, llm: { get results() { return { "jp:mavka": { text: '{"title":"T","text":"A calm day."}' } }; }, request() {} } };
  w.files.set("journal/state.json", JSON.stringify({ day: "2026-11-11", pending: { mavka: { at: noon - 1000, entries: ["e1"] } } }));
  at(noon, () => journal.onTick({}, j2));
  const posts = JSON.parse(w.files.get("journal/mavka.json")!).posts;
  expect(posts.some((p: any) => p.from === "diary:e1" && p.place === "The cafe by the park")).toBe(true);
});

test("life: a day of 'seen' names the place the character is at; other kinds do not", () => {
  const w = world({ mavka: "cafe", lis: "cafe" });
  const requests: { key: string; req: any }[] = [];
  const host: any = { fs: w.fsx, llm: { results: {}, request: (key: string, req: any) => void requests.push({ key, req }) } };
  at(noon, () => withRandom(0.75, () => life.onTick({}, host)));
  const seen = requests.find((r) => r.key.startsWith("d:mavka:seen"));
  expect(seen, requests.map((r) => r.key).join()).toBeTruthy();
  expect(seen!.req.messages[0].content).toContain("Where you are as you write this: The cafe by the park, with LIS.");
  const other = world({ mavka: "cafe" });
  const req2: { key: string; req: any }[] = [];
  const h2: any = { fs: other.fsx, llm: { results: {}, request: (key: string, req: any) => void req2.push({ key, req }) } };
  at(noon, () => withRandom(0.05, () => life.onTick({}, h2)));
  expect(req2.length).toBeGreaterThan(0);
  expect(req2[0].req.messages[0].content).not.toContain("Where you are as you write this");
});
