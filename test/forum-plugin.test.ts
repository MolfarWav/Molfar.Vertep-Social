import { afterEach, expect, test } from "bun:test";
import path from "node:path";

const plugin = await import(path.resolve(import.meta.dir, "../plugins/forum/plugin.js"));

type Answer = (key: string, req: any) => { text?: string; error?: string };

function makeHost(files: Map<string, string> = new Map(), results: Record<string, unknown> = {}) {
  const requests: { key: string; req: any }[] = [];
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
    llm: { results, request: (key: string, req: any) => void requests.push({ key, req }) },
  };
  return { host, files, requests };
}
type H = ReturnType<typeof makeHost>;

const always = (status: string) => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => status));
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);

function seedProfile(h: H, id: string, name: string, extra: Record<string, unknown> = {}, forum: Record<string, unknown> = {}) {
  put(h, `profiles/${id}.json`, {
    id,
    name,
    hue: 150,
    about: `About ${name}.`,
    interests: ["reeds", "songs"],
    habits: [{ text: "writes at night" }],
    voice: { text: "Quiet.", length: 0, emoji: 0, formality: 20, never: ["caps"] },
    schedule: always("online"),
    createdAt: 1000,
    forum: { rank: "Elder", signature: "sig", frequency: 50, opensOwn: true, repliesYou: true, repliesOthers: true, favourites: [], ...forum },
    ...extra,
  });
}
const seedSettings = (h: H, patch: Record<string, unknown> = {}) => put(h, "settings.json", { autonomous: true, activity: "moderate", postsPerDay: 30, postsPerAuthor: 6, newTopicShare: 20, quietFrom: "01:00", quietTo: "08:00", writers: "profile", tzOffset: 0, models: { forum: "" }, ...patch });
const seedBoards = (h: H) => put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Guest", desc: "Hello" }, { id: "b2", name: "Tales", desc: "Stories" }] }] });
function seedTopic(h: H, id: string, board: string, lastAt: number, posts: any[] = [], extra: object = {}) {
  const ps = posts.length ? posts : [{ id: "p-" + id, by: "x9", name: "Хтось", hue: 150, at: lastAt, text: "Hello there " + id }];
  put(h, `forum/topics/${id}.json`, { id, board, title: "Topic " + id, by: ps[0].by, name: ps[0].name, hue: 150, createdAt: lastAt, lastAt, locked: false, unread: false, owe: 0, posts: ps, ...extra });
}
const route = (h: H, method: string, p: string, body?: unknown, query?: object) => plugin.handleRoute({ method, path: p, body, query }, h.host);

/** Runs a route through its two passes the way the engine does, answering model requests with `answer`. */
function run(h: H, method: string, p: string, body: unknown, answer: Answer, query?: object) {
  const req: any = { method, path: p, body, query };
  let out = plugin.handleRoute(req, h.host);
  if (out && out.__llmPending) {
    const asked = h.requests.splice(0);
    const results: Record<string, unknown> = {};
    for (const a of asked) results[a.key] = answer(a.key, a.req);
    const host2 = { ...h.host, llm: { ...h.host.llm, results } };
    out = plugin.handleRoute({ ...req, stash: out.stash }, host2);
  }
  return out;
}

/** One tick as the engine runs it: the first pass asks, the second files the answers. */
function tick(h: H, answer: Answer) {
  plugin.onTick({}, h.host);
  const asked = h.requests.splice(0);
  if (!asked.length) return 0;
  const results: Record<string, unknown> = {};
  for (const a of asked) results[a.key] = answer(a.key, a.req);
  plugin.onTick({}, { ...h.host, llm: { ...h.host.llm, results } });
  return asked.length;
}

let n = 0;
const text: Answer = (_key, req) => (String(req.messages[0].content).includes("Answer with JSON only") ? { text: JSON.stringify({ title: "Fresh topic " + ++n, text: "First post " + n }) } : { text: "A reply number " + ++n });

const realNow = Date.now;
afterEach(() => {
  Date.now = realNow;
});
const at = (iso: string) => Date.parse(iso);

// ---------- time helpers ----------

test("quiet hours wrap past midnight and follow the user's offset", () => {
  const t = at("2026-11-10T00:30:00Z");
  expect(plugin.inQuiet(t, 0, "23:00", "07:00")).toBe(true);
  expect(plugin.inQuiet(t, 0, "01:00", "08:00")).toBe(false);
  expect(plugin.inQuiet(t, -120, "01:00", "08:00")).toBe(true); // 02:30 at UTC+2
  expect(plugin.inQuiet(t, 0, "01:00", "01:00")).toBe(false); // equal ends: no quiet hours
  expect(plugin.awakeMinutes("01:00", "08:00")).toBe(1440 - 420);
  expect(plugin.awakeMinutes("23:00", "07:00")).toBe(1440 - 480);
  expect(plugin.localDay(at("2026-11-10T23:30:00Z"), -120)).toBe("2026-11-11");
});

test("the average gap spreads the day and never drops under the hard minimum", () => {
  const base = { postsPerDay: 30, quietFrom: "01:00", quietTo: "08:00", activity: "moderate" };
  expect(plugin.avgGapMs(base)).toBe((1020 * 60000) / 30);
  expect(plugin.avgGapMs({ ...base, activity: "quiet" })).toBe(2 * plugin.avgGapMs(base));
  expect(plugin.avgGapMs({ ...base, postsPerDay: 200, activity: "chaotic" })).toBe(plugin.MIN_GAP_MS);
  expect(plugin.nextGapMs({ ...base, postsPerDay: 200, activity: "chaotic" }, () => 0)).toBe(plugin.MIN_GAP_MS);
});

// ---------- the safety net ----------

test("autoBlock names the reason: off, limit, quiet, gap, cap, wait", () => {
  const s = { autonomous: true, postsPerDay: 5, quietFrom: "01:00", quietTo: "08:00" };
  const day = at("2026-11-10T12:00:00Z");
  const log = (o: object = {}) => ({ posts: 0, lastAutoAt: 0, nextAt: 0, recent: [], ...o });
  expect(plugin.autoBlock(log(), { ...s, autonomous: false }, day, 0)).toBe("off");
  expect(plugin.autoBlock(log({ posts: 5 }), s, day, 0)).toBe("limit");
  expect(plugin.autoBlock(log(), s, at("2026-11-10T03:00:00Z"), 0)).toBe("quiet");
  expect(plugin.autoBlock(log({ lastAutoAt: day - 60000 }), s, day, 0)).toBe("gap");
  expect(plugin.autoBlock(log({ recent: [day - 400000, day - 300000, day - 200000] }), s, day, 0)).toBe("cap");
  expect(plugin.autoBlock(log({ nextAt: day + 1 }), s, day, 0)).toBe("wait");
  expect(plugin.autoBlock(log(), s, day, 0)).toBe("");
});

function simulate(h: H, dayStart: number, minutes: number, restartAt: number | null) {
  const posts: number[] = [];
  let hh = h;
  for (let m = 0; m < minutes; m++) {
    if (restartAt !== null && m === restartAt) hh = makeHost(h.files); // a restart: a new host over the same files
    Date.now = () => dayStart + m * 60000;
    const before = hh.files.has("forum/log.json") ? get(hh, "forum/log.json").posts : 0;
    tick(hh, text);
    const after = hh.files.has("forum/log.json") ? get(hh, "forum/log.json").posts : 0;
    for (let i = before; i < after; i++) posts.push(dayStart + m * 60000);
  }
  return posts;
}

function simSetup(settings: Record<string, unknown>, profiles = 4) {
  const h = makeHost();
  seedBoards(h);
  for (let i = 0; i < profiles; i++) seedProfile(h, "p" + i, "Char" + i);
  seedSettings(h, settings);
  return h;
}

test("a simulated day (30 posts, moderate): within the limit, spread, no two posts too close, a restart changes nothing", () => {
  const h = simSetup({ postsPerDay: 30, postsPerAuthor: 10, activity: "moderate" });
  const start = at("2026-11-10T00:00:00Z");
  const posts = simulate(h, start, 24 * 60, 12 * 60); // a restart at noon
  expect(posts.length).toBeLessThanOrEqual(30);
  expect(posts.length).toBeGreaterThan(10);
  const gaps = posts.slice(1).map((t, i) => t - posts[i]);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(plugin.MIN_GAP_MS);
  // no post inside the quiet hours (01:00-08:00)
  for (const t of posts) expect(plugin.inQuiet(t, 0, "01:00", "08:00")).toBe(false);
  // spread: never more than 4 posts in any 30 minutes (the whole day's limit does not fire at once)
  for (const t of posts) expect(posts.filter((x) => x >= t && x < t + 30 * 60000).length).toBeLessThanOrEqual(4);
  // the counters survived the restart
  expect(get(h, "forum/log.json").posts).toBe(posts.length);
});

test("a simulated day in the most aggressive setting: the daily limit, the hard gap and the 10-minute cap hold", () => {
  const h = simSetup({ postsPerDay: 200, postsPerAuthor: 50, activity: "chaotic" }, 6);
  const start = at("2026-11-10T00:00:00Z");
  const posts = simulate(h, start, 24 * 60, 9 * 60);
  expect(posts.length).toBeLessThanOrEqual(200);
  expect(posts.length).toBeGreaterThan(50);
  const gaps = posts.slice(1).map((t, i) => t - posts[i]);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(plugin.MIN_GAP_MS);
  for (const t of posts) expect(posts.filter((x) => x > t - plugin.CAP_WINDOW_MS && x <= t).length).toBeLessThanOrEqual(plugin.CAP_COUNT);
});

test("the limit per author holds, and a new day starts the counters again", () => {
  const h = simSetup({ postsPerDay: 200, postsPerAuthor: 2, activity: "chaotic" }, 3);
  const posts = simulate(h, at("2026-11-10T08:00:00Z"), 16 * 60, null);
  expect(posts.length).toBe(6); // 3 authors x 2
  const log = get(h, "forum/log.json");
  expect(Math.max(...(Object.values(log.byAuthor) as number[]))).toBe(2);
  Date.now = () => at("2026-11-11T09:00:00Z");
  expect(plugin.readLog(h.host.fs, Date.now(), 0).posts).toBe(0);
});

test("after the engine was off for hours there is no burst: one post per tick, then the gap", () => {
  const h = simSetup({ postsPerDay: 30, activity: "chaotic" }, 4);
  put(h, "forum/log.json", { day: "2026-11-10", posts: 3, byAuthor: {}, lastAutoAt: at("2026-11-10T09:00:00Z"), nextAt: at("2026-11-10T09:10:00Z"), recent: [] });
  const start = at("2026-11-10T15:00:00Z");
  Date.now = () => start;
  expect(tick(h, text)).toBe(1);
  Date.now = () => start + 60000;
  expect(tick(h, text)).toBe(0); // inside the hard gap
});

// ---------- bump order ----------

test("topics are ordered by the last post: a new topic and a topic with a new reply rise to the top", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedTopic(h, "a", "b1", 1000);
  seedTopic(h, "b", "b1", 2000);
  seedTopic(h, "c", "b1", 3000);
  const order = () => route(h, "GET", "/forum/board", undefined, { id: "b1" }).json.topics.map((t: any) => t.id);
  expect(order()).toEqual(["c", "b", "a"]);
  // each step is a separate moment: two writes in one millisecond would tie and the order would be down to luck
  const base = realNow();
  Date.now = () => base + 1000;
  // the user replies to the oldest topic: it jumps to the top
  expect(route(h, "POST", "/forum/reply", { topic: "a", text: "up" }).json.ok).toBe(true);
  expect(order()[0]).toBe("a");
  // the user opens a new topic: it is the top now
  Date.now = () => base + 2000;
  const made = route(h, "POST", "/forum/topic", { board: "b1", title: "Brand new", text: "hello" }).json;
  expect(order()[0]).toBe(made.topic);
  // a character's reply to an older topic also bumps it
  const r = plugin.fileResult(h.host.fs, { kind: "reply", author: "m1", topic: "c", quote: "" }, { text: "bump" }, base + 10000, plugin.readBoards(h.host.fs));
  expect(r.post).toBeTruthy();
  expect(order()[0]).toBe("c");
  // the home page counts per board and names the last post
  const home = route(h, "GET", "/forum/home").json;
  const b1 = home.categories[0].boards[0];
  expect(b1.topics).toBe(4);
  expect(b1.last.topicId).toBe("c");
  expect(home.categories[0].boards[1].last).toBeNull();
});

// ---------- planning ----------

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
function plan(h: H, rand: () => number, over: Record<string, unknown> = {}) {
  const fsx = h.host.fs;
  const now = at("2026-11-10T12:00:00Z");
  return plugin.planAction(
    { profiles: plugin.loadProfiles(fsx), topics: plugin.loadTopics(fsx), boards: plugin.readBoards(fsx), settings: plugin.readSettings(fsx), log: plugin.readLog(fsx, now, 0), now, tz: 0, mode: "auto", ...over },
    rand,
  );
}

test("a user's post that is owed replies is answered first, with the user's post quoted", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedSettings(h);
  const now = at("2026-11-10T11:50:00Z");
  seedTopic(h, "old", "b1", now - 3600000);
  seedTopic(h, "mine", "b2", now, [{ id: "u1", by: "me", name: "", hue: 200, at: now, text: "Anyone here?" }], { owe: 2 });
  for (let s = 1; s < 20; s++) {
    const p = plan(h, seeded(s));
    expect(p.kind).toBe("reply");
    expect(p.topic.id).toBe("mine");
    expect(p.target.id).toBe("u1");
  }
});

test("a mention of the author comes next after the user's posts", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedProfile(h, "y1", "Ярина");
  seedSettings(h, { newTopicShare: 0 });
  const now = at("2026-11-10T11:50:00Z");
  seedTopic(h, "t1", "b1", now - 100000, [
    { id: "x1", by: "y1", name: "Ярина", hue: 10, at: now - 200000, text: "Мавка, ти бачила?" },
    { id: "x2", by: "y1", name: "Ярина", hue: 10, at: now - 100000, text: "Ще раз питаю" },
  ]);
  seedTopic(h, "t2", "b2", now - 50000);
  const hits = new Set<string>();
  for (let s = 1; s < 40; s++) {
    const p = plan(h, seeded(s));
    if (p.author.id === "m1") hits.add(p.topic.id);
  }
  expect([...hits]).toEqual(["t1"]); // Мавка, whenever she writes, answers the topic that names her
});

test("the profile's flags decide: no new topics, no replies to the user, no replies to others", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка", {}, { opensOwn: false });
  seedSettings(h, { newTopicShare: 100 });
  const now = at("2026-11-10T11:50:00Z");
  seedTopic(h, "t1", "b1", now - 100000);
  for (let s = 1; s < 10; s++) expect(plan(h, seeded(s)).kind).toBe("reply"); // opensOwn false: never a new topic
  // nobody can open a topic and there is nothing to reply to
  const h2 = makeHost();
  seedBoards(h2);
  seedProfile(h2, "m1", "Мавка", {}, { opensOwn: false });
  seedSettings(h2);
  expect(plan(h2, seeded(1))).toBeNull();
  // repliesOthers false: a character's post is not answered; repliesYou false: the user's is not
  const h3 = makeHost();
  seedBoards(h3);
  seedProfile(h3, "m1", "Мавка", {}, { opensOwn: false, repliesOthers: false });
  seedProfile(h3, "y1", "Ярина", {}, { opensOwn: false });
  seedSettings(h3);
  seedTopic(h3, "t1", "b1", now - 100000);
  for (let s = 1; s < 20; s++) expect(plan(h3, seeded(s)).author.id).not.toBe("m1");
  const h4 = makeHost();
  seedBoards(h4);
  seedProfile(h4, "m1", "Мавка", {}, { opensOwn: false, repliesYou: false });
  seedSettings(h4);
  seedTopic(h4, "t1", "b1", now, [{ id: "u1", by: "me", name: "", hue: 200, at: now, text: "Hi" }], { owe: 2 });
  expect(plan(h4, seeded(1))).toBeNull();
});

test("a profile that is offline does not write on its own", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка", { schedule: always("off") });
  seedSettings(h);
  expect(plan(h, seeded(1))).toBeNull();
  expect(plan(h, seeded(1), { mode: "force" })).not.toBeNull(); // "Write now" ignores the schedule
});

test("a new topic goes to a favourite board of the author", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка", {}, { favourites: [{ name: "tales", on: true }, { name: "Guest", on: false }] });
  seedSettings(h, { newTopicShare: 100 });
  for (let s = 1; s < 15; s++) expect(plan(h, seeded(s)).board.id).toBe("b2");
});

// ---------- model flow ----------

test("a tick asks once, then files the post; the slot moves and the counters grow", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedSettings(h, { newTopicShare: 100 });
  Date.now = () => at("2026-11-10T12:00:00Z");
  plugin.onTick({}, h.host);
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0].key).toMatch(/^an:m1:b[12]$/);
  expect(h.requests[0].req.systemPrompt).toContain("You are Мавка");
  expect(h.requests[0].req.systemPrompt).toContain("About Мавка.");
  h.requests.length = 0;
  tick(h, () => ({ text: '```json\n{"title":"Дивний ранок","text":"Туман над очеретом."}\n```' }));
  const topics = h.host.fs.list("forum/topics").map((f: string) => plugin.readTopic(h.host.fs, f.replace(".json", "")));
  expect(topics).toHaveLength(1);
  expect(topics[0].title).toBe("Дивний ранок");
  expect(topics[0].unread).toBe(true);
  const log = get(h, "forum/log.json");
  expect(log.posts).toBe(1);
  expect(log.byAuthor).toEqual({ m1: 1 });
  expect(log.nextAt).toBeGreaterThan(Date.now() + plugin.MIN_GAP_MS - 1);
  expect(route(h, "GET", "/forum/unread").json.unread).toBe(1);
  expect(route(h, "POST", "/forum/read", { topic: topics[0].id }).json.ok).toBe(true);
  expect(route(h, "GET", "/forum/unread").json.unread).toBe(0);
});

test("a bad answer posts nothing: not JSON, a repeat, no model; the slot waits, the error is kept", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedSettings(h, { newTopicShare: 100 });
  const t0 = at("2026-11-10T12:00:00Z");
  Date.now = () => t0;
  tick(h, () => ({ text: "I would like to talk about reeds." }));
  expect(() => h.host.fs.list("forum/topics")).toThrow();
  let log = get(h, "forum/log.json");
  expect(log.posts).toBe(0);
  expect(log.error.error).toContain("not a topic");
  expect(log.nextAt).toBeGreaterThanOrEqual(t0 + 10 * 60000); // no retry storm
  Date.now = () => t0 + 11 * 60000;
  tick(h, () => ({ error: "no model providers are configured" }));
  log = get(h, "forum/log.json");
  expect(log.error.code).toBe("no-model");
  // a reply that repeats an earlier post is dropped
  seedTopic(h, "t1", "b1", t0 - 1000, [{ id: "x1", by: "m1", name: "Мавка", hue: 1, at: t0 - 1000, text: "Same words!" }]);
  const r = plugin.fileResult(h.host.fs, { kind: "reply", author: "m1", topic: "t1", quote: "" }, { text: "same words" }, t0, plugin.readBoards(h.host.fs));
  expect(r.error).toContain("repeats");
  // thinking notes and a name label are stripped
  expect(plugin.cleanReply("<think>x</think>Мавка: Привіт!", "Мавка")).toBe("Привіт!");
});

test("the reply prompt carries the board, the recent posts with names, and who is answered; the card is never read", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedSettings(h, { newTopicShare: 0, models: { forum: "prov/fast" } });
  const now = at("2026-11-10T11:50:00Z");
  Date.now = () => now + 600000;
  seedTopic(h, "mine", "b1", now, [{ id: "u1", by: "me", name: "", hue: 200, at: now, text: "Who broke the fence?" }], { owe: 1 });
  plugin.onTick({}, h.host);
  const rq = h.requests[0];
  expect(rq.key).toBe("ar:m1:mine:u1");
  expect(rq.req.model).toBe("prov/fast");
  const msg = rq.req.messages[0].content;
  expect(msg).toContain("Board: Guest");
  expect(msg).toContain("User: Who broke the fence?");
  expect(msg).toContain("answering the user's post");
});

test("a post is asked of the author's own model first, then the forum's model in Settings", () => {
  const ask = (own: string) => {
    const h = makeHost();
    seedBoards(h);
    seedProfile(h, "m1", "Мавка", own ? { model: own } : {});
    seedSettings(h, { newTopicShare: 0, models: { forum: "prov/app" } });
    const now = at("2026-11-10T11:50:00Z");
    Date.now = () => now + 600000;
    seedTopic(h, "mine", "b1", now, [{ id: "u1", by: "me", name: "", hue: 200, at: now, text: "Hello" }], { owe: 1 });
    plugin.onTick({}, h.host);
    return h.requests[0].req.model;
  };
  expect(ask("prov/own")).toBe("prov/own");
  expect(ask("")).toBe("prov/app");
});

test("a reply to the user's post carries a quote and uses up one owed reply", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  const now = at("2026-11-10T11:50:00Z");
  seedTopic(h, "mine", "b1", now, [{ id: "u1", by: "me", name: "", hue: 200, at: now, text: "Anyone here?" }], { owe: 2 });
  const r = plugin.fileResult(h.host.fs, { kind: "reply", author: "m1", topic: "mine", quote: "u1" }, { text: "I am." }, now + 1000, plugin.readBoards(h.host.fs));
  expect(r.post.quote).toEqual({ by: "me", name: "", text: "Anyone here?" });
  expect(plugin.readTopic(h.host.fs, "mine").owe).toBe(1);
});

// ---------- Write now ----------

test("Write now ignores the limit, the quiet hours, the schedule and the slot, and still counts toward the day", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка", { schedule: always("off") });
  seedSettings(h, { postsPerDay: 1, newTopicShare: 100 });
  const t0 = at("2026-11-10T03:00:00Z"); // inside the quiet hours
  Date.now = () => t0;
  put(h, "forum/log.json", { day: "2026-11-10", posts: 1, byAuthor: { m1: 6 }, lastAutoAt: t0 - 1000, nextAt: t0 + 3600000, recent: [t0 - 1000] });
  expect(plugin.autoBlock(plugin.readLog(h.host.fs, t0, 0), plugin.readSettings(h.host.fs), t0, 0)).not.toBe("");
  const out = run(h, "POST", "/forum/force", { count: 2 }, text);
  expect(out.json.ok).toBe(true);
  expect(out.json.written).toBe(2);
  const log = get(h, "forum/log.json");
  expect(log.posts).toBe(3);
  expect(log.byAuthor.m1).toBe(8);
  expect(log.nextAt).toBe(t0 + 3600000); // the autonomous slot is untouched
  expect(log.recent).toEqual([t0 - 1000]);
});

test("Write now with a topic replies in that topic; with no boards or no profiles it says so", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedProfile(h, "y1", "Ярина");
  seedSettings(h);
  const t0 = at("2026-11-10T12:00:00Z");
  Date.now = () => t0;
  seedTopic(h, "t1", "b1", t0 - 5000, [{ id: "x1", by: "y1", name: "Ярина", hue: 10, at: t0 - 5000, text: "Anything new?" }]);
  const out = run(h, "POST", "/forum/force", { topic: "t1" }, text);
  expect(out.json.ok).toBe(true);
  expect(plugin.readTopic(h.host.fs, "t1").posts.length).toBe(2);
  const bare = makeHost();
  seedSettings(bare);
  seedProfile(bare, "m1", "Мавка");
  expect(route(bare, "POST", "/forum/force", {}).json.code).toBe("no-target");
  const none = makeHost();
  seedBoards(none);
  expect(route(none, "POST", "/forum/force", {}).json.code).toBe("no-profiles");
  // a model failure comes back as the error with the no-model code, nothing is posted
  const failed = run(h, "POST", "/forum/force", { topic: "t1" }, () => ({ error: "no model providers are configured" }));
  expect(failed.json.ok).toBe(false);
  expect(failed.json.errors[0].code).toBe("no-model");
  expect(plugin.readTopic(h.host.fs, "t1").posts.length).toBe(2);
});

// ---------- boards and safety ----------

test("boards merge by name; defaults can be created once", () => {
  const h = makeHost();
  const body = { categories: [{ name: "General", boards: [{ name: "Guest", desc: "Hi" }, { name: "Tales" }] }] };
  const first = route(h, "POST", "/forum/boards", body).json;
  expect(first.categories[0].boards).toHaveLength(2);
  const again = route(h, "POST", "/forum/boards", { categories: [{ name: "general", boards: [{ name: "guest" }, { name: "Bazaar" }] }] }).json;
  expect(again.categories).toHaveLength(1);
  expect(again.categories[0].boards.map((b: any) => b.name)).toEqual(["Guest", "Tales", "Bazaar"]);
  const home = route(h, "GET", "/forum/home").json;
  expect(home.strip.boards).toBe(3);
  expect(home.strip.state).toBe("nobody"); // no profiles yet
});

test("ids cannot leave the forum folder; texts are cleaned and capped", () => {
  const h = makeHost();
  seedBoards(h);
  for (const bad of ["../profiles/x", "a/b", "..", "x.json", ""]) {
    expect(route(h, "GET", "/forum/topic", undefined, { id: bad }).status).toBe(404);
    expect(route(h, "GET", "/forum/board", undefined, { id: bad }).status).toBe(404);
    expect(route(h, "POST", "/forum/reply", { topic: bad, text: "x" }).status).toBe(404);
    expect(route(h, "POST", "/forum/topic", { board: bad, title: "abc", text: "x" }).status).toBe(404);
  }
  expect(route(h, "POST", "/forum/topic", { board: "b1", title: "ab", text: "x" }).status).toBe(400);
  expect(route(h, "POST", "/forum/topic", { board: "b1", title: "Fine title", text: "   " }).status).toBe(400);
  const big = route(h, "POST", "/forum/topic", { board: "b1", title: "<b>Fine</b> title", text: "x".repeat(9000) }).json;
  const topic = route(h, "GET", "/forum/topic", undefined, { id: big.topic }).json;
  expect(topic.topic.title).toBe("Fine title");
  expect(topic.topic.posts[0].text.length).toBe(4000);
  expect(topic.authors.me.name).toBe("");
  expect(plugin.handleRoute({ path: "/other", method: "GET" }, h.host)).toBeNull();
});

test("a locked topic refuses replies; the topic route carries the authors' facts", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка", {}, { rank: "Elder" });
  seedTopic(h, "t1", "b1", 1000, [{ id: "p1", by: "m1", name: "Мавка", hue: 150, at: 1000, text: "Hello" }], { locked: true });
  expect(route(h, "POST", "/forum/reply", { topic: "t1", text: "x" }).status).toBe(409);
  const t = route(h, "GET", "/forum/topic", undefined, { id: "t1" }).json;
  expect(t.topic.board).toEqual({ id: "b1", name: "Guest", category: "General" });
  expect(t.authors.m1.rank).toBe("Elder");
  expect(t.authors.m1.count).toBe(1);
  expect(t.authors.m1.online).toBe(true);
});

test("the user closes a topic and reopens it: no posts meanwhile, the place stays, nothing owed is left", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedTopic(h, "a", "b1", 1000, [{ id: "p1", by: "me", name: "", hue: 200, at: 1000, text: "Hello all" }], { owe: 2 });
  seedTopic(h, "b", "b1", 2000);
  const order = () => route(h, "GET", "/forum/board", undefined, { id: "b1" }).json.topics.map((t: any) => [t.id, t.locked]);
  expect(order()).toEqual([["b", false], ["a", false]]);
  // closing: the answer says so, the topic keeps lastAt (no bump), the debt of replies is dropped
  expect(route(h, "POST", "/forum/lock", { topic: "a", locked: true }).json).toEqual({ ok: true, locked: true });
  const closed = get(h, "forum/topics/a.json");
  expect(closed.locked).toBe(true);
  expect(closed.lastAt).toBe(1000);
  expect(closed.owe).toBe(0);
  expect(order()).toEqual([["b", false], ["a", true]]);
  // nobody writes in it: not the user, not a character on the tick, not "Write now" aimed at it
  expect(route(h, "POST", "/forum/reply", { topic: "a", text: "x" }).status).toBe(409);
  expect(plan(h, seeded(1), { mode: "force", scope: { topic: "a" } })).toBeNull();
  expect(route(h, "POST", "/forum/force", { topic: "a" }).json.code).toBe("no-target");
  // a model call that was in flight when the topic was closed files nothing
  const late = plugin.fileResult(h.host.fs, { kind: "reply", author: "m1", topic: "a", quote: "" }, { text: "too late" }, 5000, plugin.readBoards(h.host.fs));
  expect(late.post).toBeUndefined();
  expect(get(h, "forum/topics/a.json").posts.length).toBe(1);
  // a new post elsewhere rises above it; the closed one stays where it was
  Date.now = () => 9000;
  route(h, "POST", "/forum/reply", { topic: "b", text: "up" });
  expect(order()).toEqual([["b", false], ["a", true]]);
  // the topic page and the home page still read it
  expect(route(h, "GET", "/forum/topic", undefined, { id: "a" }).json.topic.locked).toBe(true);
  // reopening: replies work again, the topic is not bumped by the reopening itself
  expect(route(h, "POST", "/forum/lock", { topic: "a", locked: false }).json).toEqual({ ok: true, locked: false });
  expect(get(h, "forum/topics/a.json").lastAt).toBe(1000);
  expect(route(h, "POST", "/forum/reply", { topic: "a", text: "back" }).json.ok).toBe(true);
  expect(order()[0][0]).toBe("a");
});

test("a closed topic is left out of the characters' own choices on the tick", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  const base = at("2026-11-10T12:00:00Z");
  seedTopic(h, "a", "b1", base - 60000, [{ id: "p1", by: "me", name: "", hue: 200, at: base - 60000, text: "Hello Мавка" }], { owe: 3, locked: true });
  for (let i = 0; i < 20; i++) {
    const p = plan(h, seeded(i + 1));
    // the only topic is closed: a character can only open a new topic, never reply
    expect(p && p.kind).not.toBe("reply");
  }
});

test("the lock route checks its input", () => {
  const h = makeHost();
  seedBoards(h);
  seedTopic(h, "a", "b1", 1000);
  expect(route(h, "POST", "/forum/lock", { topic: "nope", locked: true }).status).toBe(404);
  expect(route(h, "POST", "/forum/lock", { topic: "a" }).status).toBe(400);
  expect(route(h, "POST", "/forum/lock", { topic: "a", locked: "yes" }).status).toBe(400);
  expect(route(h, "POST", "/forum/lock", { topic: "../x", locked: true }).status).toBe(404);
  expect(get(h, "forum/topics/a.json").locked).toBe(false);
});

test("the home strip reports the state, the count and the next slot", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  const t0 = at("2026-11-10T12:00:00Z");
  Date.now = () => t0;
  seedSettings(h, { postsPerDay: 5 });
  put(h, "forum/log.json", { day: "2026-11-10", posts: 2, byAuthor: { m1: 2 }, lastAutoAt: t0 - 600000, nextAt: t0 + 20 * 60000, recent: [] });
  expect(route(h, "GET", "/forum/home").json.strip).toMatchObject({ state: "on", posted: 2, max: 5, nextInMin: 20 });
  put(h, "forum/log.json", { day: "2026-11-10", posts: 5, byAuthor: {}, lastAutoAt: 0, nextAt: 0, recent: [] });
  expect(route(h, "GET", "/forum/home").json.strip.state).toBe("limit");
  seedSettings(h, { autonomous: false });
  expect(route(h, "GET", "/forum/home").json.strip.state).toBe("off");
  Date.now = () => at("2026-11-10T03:00:00Z");
  seedSettings(h);
  expect(route(h, "GET", "/forum/home").json.strip.state).toBe("quiet");
});

test("repeat detection compares words, not punctuation, and tells different Cyrillic texts apart", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  const t0 = at("2026-11-10T12:00:00Z");
  seedTopic(h, "t1", "b1", t0 - 1000, [{ id: "x1", by: "y1", name: "Ярина", hue: 1, at: t0 - 1000, text: "Привіт, світе!" }]);
  const boards = plugin.readBoards(h.host.fs);
  const file = (txt: string) => plugin.fileResult(h.host.fs, { kind: "reply", author: "m1", topic: "t1", quote: "" }, { text: txt }, t0, boards);
  expect(file("привіт світе").error).toContain("repeats");
  expect(file("Я теж бачила цей туман.").post).toBeTruthy();
  expect(file("Зовсім інша думка про очерет.").post).toBeTruthy();
});

test("the unread route counts topics and names the newest unread post", () => {
  const h = makeHost();
  seedBoards(h);
  expect(route(h, "GET", "/forum/unread").json).toEqual({ unread: 0, latest: null });
  seedTopic(h, "a", "b1", 1000, [{ id: "p1", by: "m1", name: "Мавка", hue: 1, at: 1000, text: "one" }], { unread: true });
  seedTopic(h, "b", "b1", 2000, [{ id: "p2", by: "y1", name: "Ярина", hue: 2, at: 2000, text: "two" }], { unread: true });
  seedTopic(h, "c", "b1", 3000, [{ id: "p3", by: "me", name: "", hue: 3, at: 3000, text: "mine" }], { unread: false });
  const r = route(h, "GET", "/forum/unread").json;
  expect(r.unread).toBe(2);
  expect(r.latest).toEqual({ title: "Topic b", who: "Ярина", at: 2000 });
});

// ---------- paging and search (#320) ----------

const manyPosts = (n: number, by = "m1", name = "Мавка") => Array.from({ length: n }, (_, i) => ({ id: "p" + (i + 1), by, name, hue: 150, at: 1000 + i, text: `Post number ${i + 1}` }));

test("a long topic comes in pages: the page, the count, the first post, and only that page's authors", () => {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  seedProfile(h, "y1", "Ярина");
  const posts = [...manyPosts(30), ...manyPosts(30, "y1", "Ярина").map((p, i) => ({ ...p, id: "q" + i, text: "Late " + i, at: 5000 + i }))];
  seedTopic(h, "t1", "b1", 6000, posts);
  const size = plugin.PAGE_SIZE;
  const first = route(h, "GET", "/forum/topic", undefined, { id: "t1" }).json;
  expect(first.paging).toEqual({ page: 1, pages: Math.ceil(60 / size), size, total: 60, from: 0, live: 60 });
  expect(first.topic.posts).toHaveLength(size);
  expect(first.topic.posts[0].id).toBe("p1");
  expect(Object.keys(first.authors)).toEqual(["m1"]);
  const last = route(h, "GET", "/forum/topic", undefined, { id: "t1", page: "last" }).json;
  expect(last.paging.page).toBe(last.paging.pages);
  expect(last.topic.posts.at(-1).id).toBe("q29");
  expect(last.paging.from + last.topic.posts.length).toBe(60);
  expect(Object.keys(last.authors)).toEqual(["y1"]);
  // a page past the end or a bad page falls back to the nearest real one
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1", page: "99" }).json.paging.page).toBe(last.paging.pages);
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1", page: "0" }).json.paging.page).toBe(1);
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1", page: "x" }).json.paging.page).toBe(1);
});

test("a short topic is one page and pages do not drop posts", () => {
  const h = makeHost();
  seedBoards(h);
  seedTopic(h, "t1", "b1", 1000, manyPosts(plugin.PAGE_SIZE));
  seedTopic(h, "t2", "b1", 1000, manyPosts(plugin.PAGE_SIZE + 1));
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1", page: "last" }).json.paging).toMatchObject({ page: 1, pages: 1, total: plugin.PAGE_SIZE });
  const seen: string[] = [];
  for (const page of [1, 2]) seen.push(...route(h, "GET", "/forum/topic", undefined, { id: "t2", page }).json.topic.posts.map((p: any) => p.id));
  expect(seen).toEqual(manyPosts(plugin.PAGE_SIZE + 1).map((p) => p.id));
});

test("a reply lands on the last page", () => {
  const h = makeHost();
  seedBoards(h);
  seedTopic(h, "t1", "b1", 1000, manyPosts(plugin.PAGE_SIZE));
  expect(route(h, "POST", "/forum/reply", { topic: "t1", text: "My answer" }).status).toBe(200);
  const r = route(h, "GET", "/forum/topic", undefined, { id: "t1", page: "last" }).json;
  expect(r.paging.pages).toBe(2);
  expect(r.topic.posts.map((p: any) => p.text)).toEqual(["My answer"]);
});

test("search finds every word in a title or a post, titles first, with a snippet and the page of the post", () => {
  const h = makeHost();
  seedBoards(h);
  const body = Array.from({ length: 40 }, (_, i) => ({ id: "p" + i, by: "m1", name: "Мавка", hue: 150, at: 1000 + i, text: i === 33 ? "The old WELL behind the mill is dry again" : "filler " + i }));
  seedTopic(h, "a", "b1", 3000, body, {});
  seedTopic(h, "b", "b2", 2000, [{ id: "pb", by: "y1", name: "Ярина", hue: 3, at: 2000, text: "Nothing here" }], { title: "The well of wishes" });
  seedTopic(h, "c", "b1", 4000, [{ id: "pc", by: "me", name: "", hue: 3, at: 4000, text: "Something else" }]);
  const r = route(h, "GET", "/forum/search", undefined, { q: "  well  " }).json;
  expect(r.tooShort).toBe(false);
  expect(r.topics.map((t: any) => t.id)).toEqual(["b", "a"]); // the title hit first
  const a = r.topics[1];
  expect(a).toMatchObject({ n: 34, matches: 1, titleHit: false, board: { id: "b1", name: "Guest" }, category: "General", by: "m1" });
  expect(a.page).toBe(Math.floor(33 / plugin.PAGE_SIZE) + 1);
  expect(a.snippet).toContain("WELL behind the mill");
  // every word must be there, in the same post or in the title
  expect(route(h, "GET", "/forum/search", undefined, { q: "well mill" }).json.topics.map((t: any) => t.id)).toEqual(["a"]);
  expect(route(h, "GET", "/forum/search", undefined, { q: "well zebra" }).json.topics).toEqual([]);
});

test("search ignores case in Cyrillic, is safe with odd input and refuses a single character", () => {
  const h = makeHost();
  seedBoards(h);
  seedTopic(h, "a", "b1", 1000, [{ id: "p1", by: "m1", name: "Мавка", hue: 1, at: 1000, text: "Ліс ШУМИТЬ уночі <b>дуже</b>" }]);
  expect(route(h, "GET", "/forum/search", undefined, { q: "шумить" }).json.topics).toHaveLength(1);
  expect(route(h, "GET", "/forum/search", undefined, { q: "ЛІС" }).json.topics).toHaveLength(1);
  expect(route(h, "GET", "/forum/search", undefined, { q: "ш" }).json).toMatchObject({ tooShort: true, topics: [] });
  expect(route(h, "GET", "/forum/search", undefined, {}).json.tooShort).toBe(true);
  expect(route(h, "GET", "/forum/search", undefined, { q: "(a|b)[" }).json.topics).toEqual([]); // not a pattern
  expect(route(h, "GET", "/forum/search", undefined, { q: ["x", "y"] as any }).json.tooShort).toBe(true);
  expect(plugin.searchWords("  A  b\tc d e f g h ")).toEqual(["a", "b", "c", "d", "e", "f"]);
});

test("search keeps to the cap and says it was cut", () => {
  const h = makeHost();
  seedBoards(h);
  for (let i = 0; i < 60; i++) seedTopic(h, "t" + i, "b1", 1000 + i, [{ id: "p" + i, by: "m1", name: "Мавка", hue: 1, at: 1000 + i, text: "needle " + i }]);
  const r = route(h, "GET", "/forum/search", undefined, { q: "needle" }).json;
  expect(r.topics).toHaveLength(50);
  expect(r.truncated).toBe(true);
  expect(r.topics[0].id).toBe("t59"); // newest first among the same kind of hit
});

// ---------- removing posts and topics (the user is the only moderator) ----------

const secret = "SECRET-TEXT-9f3";
function moderated() {
  const h = makeHost();
  seedBoards(h);
  seedProfile(h, "m1", "Мавка");
  const posts = [
    { id: "p1", by: "m1", name: "Мавка", hue: 150, at: 1000, text: "Opening post" },
    { id: "p2", by: "me", name: "", hue: 200, at: 2000, text: secret },
    { id: "p3", by: "m1", name: "Мавка", hue: 150, at: 3000, text: "Answer to it", quote: { by: "me", name: "", text: secret } },
    { id: "p4", by: "m1", name: "Мавка", hue: 150, at: 4000, text: "Another", quote: { by: "me", name: "", text: "something else" } },
  ];
  seedTopic(h, "t1", "b1", 4000, posts, { owe: 2 });
  return h;
}

test("removing a post erases its text and keeps its place; quotes of it go; the others stay", () => {
  const h = moderated();
  const r = route(h, "POST", "/forum/remove-post", { topic: "t1", post: "p2" });
  expect(r.status).toBe(200);
  const file = h.files.get("forum/topics/t1.json")!;
  expect(file).not.toContain(secret); // nothing of it is left on disk, quotes included
  const t = route(h, "GET", "/forum/topic", undefined, { id: "t1" }).json;
  expect(t.topic.posts.map((p: any) => p.id)).toEqual(["p1", "p2", "p3", "p4"]); // numbers and pages stay put
  expect(t.topic.posts[1]).toMatchObject({ id: "p2", by: "me", removed: true, text: "" });
  expect(t.topic.posts[2].quote).toBeUndefined();
  expect(t.topic.posts[3].quote.text).toBe("something else");
  expect(get(h, "forum/topics/t1.json").owe).toBe(0); // no live post of the user is left to answer
  // twice is fine; unknown ids and the opening post are refused
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1" }).json.paging).toMatchObject({ total: 4, live: 3 });
  expect(route(h, "POST", "/forum/remove-post", { topic: "t1", post: "p2" }).json).toMatchObject({ ok: true });
  expect(route(h, "POST", "/forum/remove-post", { topic: "t1", post: "nope" }).status).toBe(404);
  expect(route(h, "POST", "/forum/remove-post", { topic: "nope", post: "p2" }).status).toBe(404);
  expect(route(h, "POST", "/forum/remove-post", { topic: "t1", post: "p1" }).status).toBe(409);
  expect(route(h, "POST", "/forum/remove-post", { topic: "../x", post: "p2" }).status).toBe(404);
});

test("a removed post is not counted, not shown on the board, not read by a character and not found by search", () => {
  const h = moderated();
  put(h, "profiles/m1.json", { ...get(h, "profiles/m1.json") });
  route(h, "POST", "/forum/remove-post", { topic: "t1", post: "p2" });
  const home = route(h, "GET", "/forum/home").json;
  expect(home.categories[0].boards[0].posts).toBe(3);
  expect(home.stats.posts).toBe(3);
  expect(route(h, "GET", "/forum/board", undefined, { id: "b1" }).json.topics[0].replies).toBe(2);
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1" }).json.authors.me.count).toBe(0);
  expect(route(h, "GET", "/forum/search", undefined, { q: "secret" }).json.topics).toEqual([]);
  const topic = plugin.readTopic(h.host.fs, "t1");
  const ctx = plugin.replyContext({ name: "Guest", desc: "" }, topic, null);
  expect(ctx).not.toContain("User:");
  expect(ctx).toContain("Opening post");
  // the user's removed post is no longer something a character owes an answer to
  const prof = plugin.loadProfiles(h.host.fs)[0];
  const t2 = { ...topic, owe: 2, posts: topic.posts.slice(0, 2).concat([]) };
  expect(plugin.targetsFor({ ...prof, id: "other" }, [t2], Date.now(), null).owed).toEqual([]);
});

test("a removed post cannot be quoted, and removing works in a closed topic", () => {
  const h = moderated();
  route(h, "POST", "/forum/remove-post", { topic: "t1", post: "p2" });
  route(h, "POST", "/forum/lock", { topic: "t1", locked: true });
  expect(route(h, "POST", "/forum/remove-post", { topic: "t1", post: "p3" }).status).toBe(200);
  route(h, "POST", "/forum/lock", { topic: "t1", locked: false });
  route(h, "POST", "/forum/reply", { topic: "t1", text: "Late answer", quoteOf: "p2" });
  const last = get(h, "forum/topics/t1.json").posts.at(-1);
  expect(last.text).toBe("Late answer");
  expect(last.quote).toBeUndefined();
});

test("the user deletes a topic for good", () => {
  const h = moderated();
  seedTopic(h, "t2", "b1", 5000);
  expect(route(h, "POST", "/forum/delete-topic", { topic: "t1" }).json).toMatchObject({ ok: true, deleted: "t1", board: "b1" });
  expect(h.files.has("forum/topics/t1.json")).toBe(false);
  expect(route(h, "GET", "/forum/topic", undefined, { id: "t1" }).status).toBe(404);
  expect(route(h, "GET", "/forum/board", undefined, { id: "b1" }).json.topics.map((t: any) => t.id)).toEqual(["t2"]);
  expect(route(h, "POST", "/forum/delete-topic", { topic: "t1" }).status).toBe(404);
  expect(route(h, "POST", "/forum/delete-topic", { topic: "../profiles/m1" }).status).toBe(404);
  expect(h.files.has("profiles/m1.json")).toBe(true);
});
