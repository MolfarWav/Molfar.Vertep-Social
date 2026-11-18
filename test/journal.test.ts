// Journal (#444, J1): posts by hand, and stories that run out landing in their author's journal instead of vanishing.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const journal = await import(path.join(root, "plugins/journal/plugin.js"));

const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const HOUR = 3600000;
const DAY = 24 * HOUR;

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

const story = (id: string, by: string, at: number, extra: object = {}) => ({ id, by, name: by, hue: 120, at, text: "Mended the net by the reeds.", ...extra });

function world(settings: object = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { stories: true }, ...settings }));
  files.set("profiles/mavka.json", JSON.stringify({ name: "Mavka", hue: 120, about: "x" }));
  files.set("profiles/lis.json", JSON.stringify({ name: "Lis", hue: 30, about: "y" }));
  const host: any = { fs: memFs(files) };
  const putStories = (stories: object[]) => files.set("stories/items.json", JSON.stringify({ day: "2026-11-10", stories }));
  return { files, host, putStories };
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
const tick = (w: ReturnType<typeof world>, at = noon) => run(() => journal.onTick({}, w.host), at);
const route = (w: ReturnType<typeof world>, method: string, p: string, body: object = {}, query: object = {}, at = noon) => run(() => journal.handleRoute({ method, path: p, body, query } as any, w.host), at);
const posts = (w: ReturnType<typeof world>, owner: string) => JSON.parse(w.files.get(`journal/${owner}.json`) ?? '{"posts":[]}').posts;

test("a story that ran out is filed in its author's journal, once, with its picture", () => {
  const w = world();
  const img = { state: "ready", url: "/v1/assets/abc123", gen: true };
  w.putStories([story("s1", "mavka", noon - 3 * HOUR, { image: img })]);
  tick(w); // live: copied, nothing filed yet
  expect(posts(w, "mavka")).toEqual([]);
  expect(JSON.parse(w.files.get("journal/mirror.json")!).stories.s1.text).toContain("net");
  w.putStories([]); // the stories plugin swept it a day later
  tick(w, noon - 3 * HOUR + DAY + 60000);
  const list = posts(w, "mavka");
  expect(list.length).toBe(1);
  expect(list[0].text).toBe("Mended the net by the reeds.");
  expect(list[0].image.url).toBe("/v1/assets/abc123");
  expect(list[0].from).toBe("story:s1");
  tick(w, noon - 3 * HOUR + DAY + 120000);
  expect(posts(w, "mavka").length).toBe(1);
  expect(JSON.parse(w.files.get("journal/mirror.json")!).stories).toEqual({});
});

test("the stories file may still hold an expired story: it is filed from there, and once", () => {
  const w = world();
  w.putStories([story("s2", "lis", noon - DAY - HOUR)]);
  tick(w);
  tick(w);
  expect(posts(w, "lis").length).toBe(1);
});

test("a story the user removed before it expired is not filed", () => {
  const w = world();
  w.putStories([story("s3", "mavka", noon - 2 * HOUR)]);
  tick(w);
  w.putStories([]); // removed by the user, 2 hours old
  tick(w, noon + HOUR);
  tick(w, noon + DAY + HOUR);
  expect(posts(w, "mavka")).toEqual([]);
});

test("with the switch off nothing is copied or filed", () => {
  const w = world({ community: { stories: true, storiesToJournal: false } });
  w.putStories([story("s4", "mavka", noon - HOUR)]);
  tick(w);
  expect(w.files.has("journal/mirror.json")).toBe(false);
  w.putStories([]);
  tick(w, noon + 2 * DAY);
  expect(posts(w, "mavka")).toEqual([]);
});

test("a removed story post does not come back while the stories file still holds the story", () => {
  const w = world();
  w.putStories([story("s5", "mavka", noon - DAY - HOUR)]);
  tick(w);
  const id = posts(w, "mavka")[0].id;
  expect(route(w, "POST", "/journal/remove", { id, owner: "mavka" }).json.ok).toBe(true);
  tick(w);
  tick(w, noon + HOUR);
  expect(posts(w, "mavka")).toEqual([]);
});

test("a pending picture is kept and listed for the page to draw, then filed", () => {
  const w = world();
  w.putStories([story("s6", "mavka", noon - DAY - HOUR, { image: { state: "pending", prompt: "a reed lake", gen: true } })]);
  tick(w);
  const items = route(w, "GET", "/journal/images").json.items;
  expect(items.length).toBe(1);
  expect(items[0].prompt).toBe("a reed lake");
  const r = route(w, "POST", "/journal/image", { owner: "mavka", id: items[0].id, url: "/v1/assets/img1" });
  expect(r.json.state).toBe("ready");
  expect(posts(w, "mavka")[0].image.url).toBe("/v1/assets/img1");
  expect(route(w, "POST", "/journal/image", { owner: "mavka", id: items[0].id, url: "/v1/assets/img2" }).status).toBe(404);
});

test("the user writes, edits and removes their own post", () => {
  const w = world();
  const made = route(w, "POST", "/journal/post", { title: " First <b>day</b> ", text: "Hello\r\n\r\n\r\n\r\nthere", mood: "calm", tags: "#one, two, ONE, three, four, five, six" });
  expect(made.status).toBe(200);
  const p = made.json.post;
  expect(p.title).toBe("First day");
  expect(p.text).toBe("Hello\n\nthere");
  expect(p.tags).toEqual(["one", "two", "three", "four", "five"]);
  expect(p.mine).toBe(true);
  const edited = route(w, "POST", "/journal/edit", { id: p.id, text: "Changed", mood: "" });
  expect(edited.json.post.text).toBe("Changed");
  expect(edited.json.post.mood).toBeUndefined();
  expect(edited.json.post.at).toBe(p.at);
  expect(route(w, "POST", "/journal/edit", { id: "nope", text: "x" }).status).toBe(404);
  expect(route(w, "POST", "/journal/edit", { id: p.id, text: "", title: "" }).status).toBe(400);
  expect(route(w, "POST", "/journal/remove", { id: p.id }).json.ok).toBe(true);
  expect(posts(w, "you")).toEqual([]);
  expect(route(w, "POST", "/journal/post", { text: "  " }).status).toBe(400);
});

test("the feed mixes the journals newest first, pages by `before`, and filters by owner", () => {
  const w = world();
  w.files.set("journal/mavka.json", JSON.stringify({ posts: Array.from({ length: 31 }, (_, i) => ({ id: "m" + i, at: 1000 + i, text: "t" + i, from: "you" })) }));
  w.files.set("journal/lis.json", JSON.stringify({ posts: [{ id: "l1", at: 5000, text: "fox", from: "story:x" }] }));
  w.files.set("journal/gone.json", JSON.stringify({ posts: [{ id: "g1", at: 9000, text: "no profile", from: "you" }] }));
  route(w, "POST", "/journal/post", { text: "mine" }, {}, 2000);
  const a = route(w, "GET", "/journal/feed").json;
  expect(a.posts.length).toBe(30);
  expect(a.more).toBe(true);
  expect(a.posts[0].id).toBe("l1");
  expect(a.posts[0].by).toBe("Lis");
  expect(a.posts.some((p: any) => p.id === "g1")).toBe(false);
  const b = route(w, "GET", "/journal/feed", {}, { before: a.posts[29].at }).json;
  expect(b.more).toBe(false);
  expect(b.posts.length).toBe(3);
  const only = route(w, "GET", "/journal/feed", {}, { owner: "you" }).json;
  expect(only.posts.map((p: any) => p.text)).toEqual(["mine"]);
});

test("a deleted character takes its journal with it; a failed profiles read does not", () => {
  const w = world();
  w.files.set("journal/old.json", JSON.stringify({ posts: [{ id: "o1", at: 1, text: "x", from: "you" }] }));
  tick(w);
  expect(w.files.has("journal/old.json")).toBe(false);
  const empty = world();
  empty.files.delete("profiles/mavka.json");
  empty.files.delete("profiles/lis.json");
  empty.files.set("journal/old.json", JSON.stringify({ posts: [{ id: "o1", at: 1, text: "x", from: "you" }] }));
  tick(empty);
  expect(empty.files.has("journal/old.json")).toBe(true);
});

test("a damaged file reads as empty, and a hostile post is cleaned", () => {
  const w = world();
  w.files.set("journal/mavka.json", "{not json");
  expect(journal.readPosts(w.host.fs, "mavka")).toEqual([]);
  const p = journal.cleanPost({ id: "x1", at: 5, text: "<script>alert(1)</script>ok", image: { state: "ready", url: "https://evil.example/x.png" }, visible: "everyone", from: "../../etc" });
  expect(p.text).toBe("alert(1) ok");
  expect(p.image).toBeUndefined();
  expect(p.visible).toBe("all");
  expect(p.from).toBe("you");
  expect(journal.cleanPost({ id: "../x", at: 5, text: "a" })).toBeNull();
});

test("a story with no profile (deleted) is not filed", () => {
  const w = world();
  w.putStories([story("s7", "ghost", noon - DAY - HOUR)]);
  tick(w);
  expect(w.files.has("journal/ghost.json")).toBe(false);
});

// ---------- J2: a character writes a post from its diary ----------

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const asleep = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off"));

function writerWorld(settings: object = {}, profile: object = {}) {
  const w = world({ community: { stories: true, journalPosts: true, journalPerDay: 1 }, ...settings });
  w.files.set("profiles/mavka.json", JSON.stringify({ name: "Mavka", hue: 120, about: "A mavka of the lake.", schedule: always, ...profile }));
  w.files.set("life/diary/mavka.json", JSON.stringify({ entries: [{ id: "e1", at: noon - 3600000, day: "2026-11-10", text: "Mended the net by the reeds.", by: "model" }, { id: "e2", at: noon - 7200000, day: "2026-11-10", text: "The lake was calm.", by: "model" }, { id: "e3", at: noon - 9000000, day: "2026-11-09", text: "Yesterday's line.", by: "model" }, { id: "e4", at: noon, day: "2026-11-10", text: "my own note", by: "you" }] }));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  w.host.llm = { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) };
  return { ...w, requests, setResults: (r: Record<string, unknown>) => (results = r) };
}
const withRandom = <T,>(r: number, fn: () => T): T => {
  const old = Math.random;
  Math.random = () => r;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
};
const writeTick = (w: ReturnType<typeof writerWorld>, at = noon) => run(() => withRandom(0, () => journal.onTick({}, w.host)), at);

test("J2: a character writes from today's own diary lines, one model call, filed once", () => {
  const w = writerWorld();
  writeTick(w);
  expect(w.requests.length).toBe(1);
  expect(w.requests[0].key).toBe("jp:mavka");
  const user = w.requests[0].req.messages[0].content;
  expect(user).toContain("Mended the net");
  expect(user).toContain("The lake was calm");
  expect(user).not.toMatch(/Yesterday|my own note/);
  expect(w.requests[0].req.systemPrompt).toContain("A mavka of the lake.");
  // the answer arrives on a later tick
  w.setResults({ "jp:mavka": { text: '```json\n{"title":"By the reeds","text":"I mended the net today. The lake stayed calm.","mood":"calm","tags":["#lake","net"]}\n```' } });
  writeTick(w, noon + 60000);
  const list = posts(w, "mavka");
  expect(list.length).toBe(1);
  expect(list[0].title).toBe("By the reeds");
  expect(list[0].mood).toBe("calm");
  expect(list[0].tags).toEqual(["lake", "net"]);
  expect(list[0].from).toBe("diary:e1");
  const st = JSON.parse(w.files.get("journal/state.json")!);
  expect(st.counts.mavka).toBe(1);
  expect(st.used.mavka).toEqual(["e1", "e2"]);
  expect(st.pending.mavka).toBeUndefined();
  // under the cap of one a day: no second request, even with a diary line left over
  w.setResults({});
  const before = w.requests.length;
  writeTick(w, noon + 120000);
  expect(w.requests.length).toBe(before);
});

test("J2: nothing is asked with the switch off, Life off, the character asleep, at cap 0, or with no diary lines", () => {
  for (const [settings, profile] of [
    [{ community: { journalPosts: false } }, {}],
    [{ community: { journalPosts: true }, life: { on: false } }, {}],
    [{ community: { journalPosts: true, journalPerDay: 0 } }, {}],
    [{}, { schedule: asleep }],
    [{}, { life: { on: false } }],
  ] as [object, object][]) {
    const w = writerWorld(settings, profile);
    writeTick(w);
    expect(w.requests.length).toBe(0);
  }
  const noDiary = writerWorld();
  noDiary.files.delete("life/diary/mavka.json");
  writeTick(noDiary);
  expect(noDiary.requests.length).toBe(0);
  // the chance gates it
  const unlucky = writerWorld();
  run(() => withRandom(0.99, () => journal.onTick({}, unlucky.host)));
  expect(unlucky.requests.length).toBe(0);
});

test("J2: a failed or empty answer files nothing and the character waits half an hour; a pending request is not asked twice", () => {
  const w = writerWorld();
  writeTick(w);
  writeTick(w, noon + 60000); // pending
  expect(w.requests.length).toBe(1);
  w.setResults({ "jp:mavka": { error: "rate limit" } });
  writeTick(w, noon + 120000);
  expect(posts(w, "mavka")).toEqual([]);
  w.setResults({});
  writeTick(w, noon + 10 * 60000);
  expect(w.requests.length).toBe(1); // still waiting
  writeTick(w, noon + 40 * 60000);
  expect(w.requests.length).toBe(2);
});

test("J2: an answer that is plain text becomes the post; HTML and junk are cleaned; a gone profile files nothing", () => {
  const w = writerWorld();
  writeTick(w);
  w.setResults({ "jp:mavka": { text: "<b>Just</b> some plain words about the day." } });
  writeTick(w, noon + 60000);
  expect(posts(w, "mavka")[0].text).toBe("Just some plain words about the day.");
  const gone = writerWorld();
  writeTick(gone);
  gone.files.delete("profiles/mavka.json");
  gone.setResults({ "jp:mavka": { text: '{"text":"hello"}' } });
  writeTick(gone, noon + 60000);
  expect(gone.files.has("journal/mavka.json")).toBe(false);
  expect(journal.fileWriterResult(gone.host.fs, "jp:../x", { text: "x" }, noon, 0).error).toBe("bad key");
});
