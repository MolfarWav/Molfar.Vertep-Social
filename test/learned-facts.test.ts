// Issue #446, M4: the forum and the clubs learn public facts about the user from what they said openly, into their own files (one per character
// and persona); the shared reader joins them with the chat's public facts; the messenger shows them (and the user deletes them); Start over and
// deleting a character remove them; Settings has the switch.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const clubs = await import(path.join(root, "plugins/clubs/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));

function makeHost() {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
  const host: any = {
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => {
        for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k);
      },
      list: (d: string) => {
        const o = [...new Set([...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1).split("/")[0]!))];
        if (!o.length) throw new Error("ENOENT");
        return o.sort();
      },
    },
    llm: { results: {} as Record<string, unknown>, request: (key: string, req: any) => void requests.push({ key, req }) },
  };
  return { host, fsx: host.fs, files, requests };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p) ?? "null");
const YOU = { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "Plays bass." }, { id: "u2", name: "Oksana", about: "" }] };

function seed(h: H, settings: object = {}) {
  put(h, "you.json", YOU);
  put(h, "settings.json", { tzOffset: 0, models: { forum: "prov/forum", messenger: "prov/chat" }, community: { clubs: true }, ...settings });
  for (const [id, name] of [["mavka", "Mavka"], ["lisovyk", "Lisovyk"], ["rusalka", "Rusalka"]]) put(h, `profiles/${id}.json`, { id, name, hue: 100, about: "A character.", schedule: always });
}
const post = (id: string, by: string, name: string, text: string, at: number, persona?: string) => ({ id, by, name, hue: 100, at, text, ...(persona ? { persona } : {}) });
function topic(h: H, id: string, posts: any[], extra: object = {}) {
  put(h, `forum/topics/${id}.json`, { id, board: "b1", title: "Topic " + id, by: posts[0].by, name: posts[0].name, hue: 100, createdAt: posts[0].at, lastAt: posts.at(-1).at, locked: false, unread: false, owe: 0, posts, ...extra });
}
const SAID = "I play bass in a folk band and I am moving to Kyiv in March.";
const answer = (...facts: any[]) => ({ text: JSON.stringify({ facts }) });

test("the shared block is the same in the forum, the clubs and the messenger", () => {
  const block = (f: string) => /\/\/ <public-facts-shared>[\s\S]*?\/\/ <\/public-facts-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n"))?.[0];
  expect(block("plugins/forum/plugin.js")).toBeTruthy();
  expect(block("plugins/clubs/plugin.js")).toBe(block("plugins/forum/plugin.js"));
  expect(block("plugins/messenger/plugin.js")).toBe(block("plugins/forum/plugin.js"));
  for (const name of ["publicFacts", "readLearned", "mergeLearned", "writeLearned", "parseLearned", "learnedPath"]) {
    expect(String(clubs[name]), "clubs " + name).toBe(String(forum[name]));
    expect(String(messenger[name]), "messenger " + name).toBe(String(forum[name]));
  }
});

test("the answer of a model: an object, a bare list, text around, junk", () => {
  expect(forum.parseLearned('{"facts":[{"text":"A"},"B"]}')).toEqual([{ text: "A" }, "B"]);
  expect(forum.parseLearned('Sure! [{"text":"A"}] done')).toEqual([{ text: "A" }]);
  expect(forum.parseLearned("<think>x { y }</think>{\"facts\":[]}")).toEqual([]);
  expect(forum.parseLearned("nothing here")).toEqual([]);
  expect(forum.parseLearned("{broken")).toEqual([]);
});

test("merge: same words refresh, a deleted text never comes back, the ceiling drops the oldest and counts them, tags are stripped", () => {
  const file = { facts: [] as any[], forgot: [] as string[], dropped: 0 };
  expect(forum.mergeLearned(file, [{ text: "Serhii has a dog." }, { text: "  serhii HAS a dog!! " }, "<b>Likes tea</b> a lot", { text: "" }, 7], 100, "t:x")).toBe(2);
  expect(file.facts.map((f) => f.text)).toEqual(["Serhii has a dog.", "Likes tea a lot"]);
  expect(file.facts[0].at).toBe(100);
  file.forgot = ["likes tea a lot"];
  expect(forum.mergeLearned(file, ["Likes tea a lot"], 200, "t:y")).toBe(0);
  const big = { facts: [] as any[], forgot: [], dropped: 0 };
  for (let i = 0; i < 70; i++) forum.mergeLearned(big, ["Fact number " + i + " about words"], 1000 + i, "t:z");
  expect(big.facts.length).toBe(60);
  expect(big.dropped).toBe(10);
  expect(big.facts.some((f) => f.text.includes("number 0 "))).toBe(false);
  expect(big.facts.some((f) => f.text.includes("number 69 "))).toBe(true);
});

test("the reader joins the chat's public facts with what the forum and the clubs learned; the switches and a stranger cut it", () => {
  const h = makeHost();
  seed(h);
  put(h, "chats/mavka.u1.json", { id: "mavka", persona: "u1", messages: [], facts: [{ id: "f1", text: "Serhii has a dog.", kind: "about_you", at: 1, from: 1, private: false, pinned: false, by: "model" }, { id: "f2", text: "A secret.", kind: "about_you", at: 2, from: 2, private: true, pinned: false, by: "model" }] });
  put(h, "forum/facts/mavka.u1.json", { facts: [{ id: "l1", text: "Serhii is building a guitar pedal.", kind: "about_you", at: 50, from: "t:a" }, { id: "l2", text: "serhii has a DOG", kind: "about_you", at: 60, from: "t:a" }] });
  put(h, "clubs/facts/mavka.u1.json", { facts: [{ id: "l1", text: "Serhii brings his bass on Saturday.", kind: "plan", at: 70, from: "c:cl" }] });
  put(h, "forum/facts/mavka.u2.json", { facts: [{ id: "l1", text: "Oksana paints.", kind: "about_you", at: 80, from: "t:a" }] });
  const p = { id: "mavka", name: "Mavka" };
  for (const plugin of [forum, clubs]) expect(plugin.publicFacts(h.fsx, p, "u1")).toEqual(["Serhii brings his bass on Saturday.", "serhii has a DOG", "Serhii is building a guitar pedal."]);
  // the messenger already sends its chat's facts: only the learned ones
  expect(messenger.publicFacts(h.fsx, p, "u1", true)).toEqual(["Serhii brings his bass on Saturday.", "serhii has a DOG", "Serhii is building a guitar pedal."]);
  expect(forum.publicFacts(h.fsx, p, "u2")).toEqual(["Oksana paints."]);
  for (const settings of [{ factsShare: false }, { messengerSummary: false }, { messengerKnows: "stranger" }]) {
    const off = makeHost();
    seed(off, settings);
    put(off, "forum/facts/mavka.u1.json", { facts: [{ id: "l1", text: "Serhii is building a guitar pedal.", kind: "about_you", at: 50, from: "t:a" }] });
    expect(forum.publicFacts(off.fsx, p, "u1"), JSON.stringify(settings)).toEqual([]);
  }
});

test("forum: a quiet topic with the user's words is read once, by the forum's model, and the facts go to the characters who took part", () => {
  const h = makeHost();
  seed(h);
  topic(h, "t1", [post("a", "mavka", "Mavka", "Welcome all", NOW - 20 * HOUR), post("b", "me", "Serhii", SAID, NOW - 19 * HOUR, "u1"), post("c", "lisovyk", "Lisovyk", "Nice!", NOW - 18 * HOUR)]);
  const s = forum.readSettings(h.fsx);
  expect(forum.learnTick(h.host, s, forum.loadTopics(h.fsx), NOW, 0)).toBe(true);
  expect(h.requests).toHaveLength(1);
  const { key, req } = h.requests[0]!;
  expect(key).toBe("lf:t1:" + (NOW - 19 * HOUR));
  expect(req.model).toBe("prov/forum");
  expect(req.messages[0].content).toContain("[Serhii (the user)] " + SAID);
  // a second tick while the call is out does nothing
  expect(forum.learnTick(h.host, s, forum.loadTopics(h.fsx), NOW + 1000, 0)).toBe(false);
  expect(forum.fileLearn(h.fsx, key.slice(3), answer({ text: "Serhii plays bass in a folk band.", kind: "about_you" }, { text: "Serhii moves to Kyiv in March.", kind: "plan" }), NOW + 2000, 0)).toBe(4);
  for (const who of ["mavka", "lisovyk"]) expect(get(h, `forum/facts/${who}.u1.json`).facts.map((f: any) => f.text)).toEqual(["Serhii plays bass in a folk band.", "Serhii moves to Kyiv in March."]);
  expect(get(h, "forum/facts/rusalka.u1.json")).toBeNull();
  // read: nothing more to ask until the user writes again
  expect(forum.learnTick(h.host, s, forum.loadTopics(h.fsx), NOW + 3000, 0)).toBe(false);
  expect(h.requests).toHaveLength(1);
});

test("forum: not quiet yet, too short, nobody to tell, switches off, the day's cap, and a stranger gets nothing", () => {
  const run = (setup: (h: H) => void, settings: object = {}) => {
    const h = makeHost();
    seed(h, settings);
    setup(h);
    forum.learnTick(h.host, forum.readSettings(h.fsx), forum.loadTopics(h.fsx), NOW, 0);
    return h;
  };
  const posts = (text: string, at: number) => [post("a", "mavka", "Mavka", "Welcome", at - HOUR), post("b", "me", "Serhii", text, at, "u1")];
  expect(run((h) => topic(h, "t1", posts(SAID, NOW - HOUR))).requests).toHaveLength(0); // still talking
  const short = run((h) => topic(h, "t1", posts("ok", NOW - 10 * HOUR)));
  expect(short.requests).toHaveLength(0);
  expect(get(short, "forum/learn.json").topics.t1.upto).toBe(NOW - 10 * HOUR); // marked read, no call
  expect(run((h) => topic(h, "t1", [post("a", "me", "Serhii", SAID, NOW - 10 * HOUR, "u1")])).requests).toHaveLength(0); // nobody else was there
  for (const settings of [{ factsLearn: false }, { factsShare: false }, { messengerSummary: false }]) expect(run((h) => topic(h, "t1", posts(SAID, NOW - 10 * HOUR)), settings).requests, JSON.stringify(settings)).toHaveLength(0);
  const stranger = run((h) => {
    put(h, "profiles/mavka.json", { id: "mavka", name: "Mavka", hue: 100, about: "x", schedule: always, knows: "stranger" });
    topic(h, "t1", posts(SAID, NOW - 10 * HOUR));
  });
  expect(stranger.requests).toHaveLength(0);
  const capped = run((h) => {
    topic(h, "t1", posts(SAID, NOW - 10 * HOUR));
    put(h, "forum/learn.json", { day: "2026-11-19", calls: forum.LEARN_DAY_MAX, failAt: 0, pending: 0, topics: {} });
  });
  expect(capped.requests).toHaveLength(0);
});

test("forum: a failed call waits half an hour and is given up after three; a fact the user deleted is not learned again; only the persona who wrote is read", () => {
  const h = makeHost();
  seed(h);
  topic(h, "t1", [post("a", "mavka", "Mavka", "Welcome", NOW - 30 * HOUR), post("b", "me", "Serhii", SAID, NOW - 20 * HOUR, "u1"), post("c", "me", "Oksana", "I paint small landscapes in oil, mostly lakes.", NOW - 19 * HOUR, "u2")]);
  const s = forum.readSettings(h.fsx);
  const key = "t1:" + (NOW - 19 * HOUR);
  forum.fileLearn(h.fsx, key, { error: "boom" }, NOW, 0);
  expect(forum.learnTick(h.host, s, forum.loadTopics(h.fsx), NOW + 10 * 60000, 0)).toBe(false); // waiting
  expect(forum.learnTick(h.host, s, forum.loadTopics(h.fsx), NOW + 31 * 60000, 0)).toBe(true);
  forum.fileLearn(h.fsx, key, { error: "boom" }, NOW + 32 * 60000, 0);
  forum.fileLearn(h.fsx, key, { text: "" }, NOW + 70 * 60000, 0);
  expect(get(h, "forum/learn.json").topics.t1.upto).toBe(NOW - 19 * HOUR); // given up: not asked again
  expect(forum.learnTick(h.host, s, forum.loadTopics(h.fsx), NOW + 3 * HOUR, 0)).toBe(false);
  // the persona of the user's last post is the one learned about
  const h2 = makeHost();
  seed(h2);
  topic(h2, "t1", [post("a", "mavka", "Mavka", "Welcome", NOW - 30 * HOUR), post("b", "me", "Serhii", SAID, NOW - 20 * HOUR, "u1"), post("c", "me", "Oksana", "I paint small landscapes in oil, mostly lakes.", NOW - 19 * HOUR, "u2")]);
  put(h2, "forum/facts/mavka.u2.json", { facts: [], forgot: ["oksana paints landscapes"], dropped: 0 });
  forum.fileLearn(h2.fsx, "t1:" + (NOW - 19 * HOUR), answer("Oksana paints landscapes."), NOW, 0);
  expect(get(h2, "forum/facts/mavka.u2.json").facts).toEqual([]);
  forum.fileLearn(h2.fsx, "t1:" + (NOW - 19 * HOUR), answer("Oksana paints lakes."), NOW, 0);
  expect(get(h2, "forum/facts/mavka.u1.json")).toBeNull();
});

function club(h: H, messages: any[], members = ["mavka", "lisovyk", "rusalka"]) {
  put(h, "clubs/cl-1.json", { id: "cl-1", name: "Bass club", interest: "music", by: "user", members, on: true, created: 1, day: "2026-11-19", today: 0, answered: 0, messages, pending: 0, failedAt: 0 });
}
const msg = (id: string, by: string, text: string, at: number, persona?: string) => ({ id, by, at, text, ...(persona ? { persona } : {}) });

test("clubs: a session that went quiet is read once and the facts go to its members", () => {
  const h = makeHost();
  seed(h);
  club(h, [msg("m1", "mavka", "Hello everyone", NOW - 3 * HOUR), msg("m2", "me", SAID, NOW - 2 * HOUR, "u1"), msg("m3", "lisovyk", "Lovely", NOW - 2 * HOUR + 1000)]);
  const s = clubs.readSettings(h.fsx);
  const list = () => ["cl-1"].map((id) => clubs.readClub(h.fsx, id, NOW, 0));
  expect(clubs.learnTick(h.host, s, list(), NOW, 0)).toBe(true);
  const { key, req } = h.requests[0]!;
  expect(key).toBe("cf:cl-1:" + (NOW - 2 * HOUR));
  expect(req.model).toBe("prov/chat");
  expect(req.messages[0].content).toContain("[Serhii (the user)]: " + SAID);
  expect(clubs.fileLearn(h.fsx, key.slice(3), answer({ text: "Serhii plays bass in a folk band." }), NOW + 1000, 0)).toBe(3);
  for (const who of ["mavka", "lisovyk", "rusalka"]) expect(get(h, `clubs/facts/${who}.u1.json`).facts[0].text).toBe("Serhii plays bass in a folk band.");
  expect(clubs.learnTick(h.host, s, list(), NOW + 2000, 0)).toBe(false);
  // not quiet (30 minutes), switch off
  const live = makeHost();
  seed(live);
  club(live, [msg("m1", "me", SAID, NOW - 10 * 60000, "u1")]);
  expect(clubs.learnTick(live.host, s, [clubs.readClub(live.fsx, "cl-1", NOW, 0)], NOW, 0)).toBe(false);
  const off = makeHost();
  seed(off, { factsLearn: false });
  club(off, [msg("m1", "me", SAID, NOW - 5 * HOUR, "u1")]);
  expect(clubs.learnTick(off.host, s, [clubs.readClub(off.fsx, "cl-1", NOW, 0)], NOW, 0)).toBe(false);
});

test("the clubs tick files the answer of the learning call and does not mistake it for a club reply", () => {
  const h = makeHost();
  seed(h);
  club(h, [msg("m1", "me", SAID, NOW - 5 * HOUR, "u1")]);
  h.host.llm.results = { ["cf:cl-1:" + (NOW - 5 * HOUR)]: answer({ text: "Serhii plays bass." }) };
  clubs.onTick({}, h.host);
  expect(get(h, "clubs/facts/mavka.u1.json").facts[0].text).toBe("Serhii plays bass.");
  expect(get(h, "clubs/cl-1.json").messages).toHaveLength(1);
});

test("the Facts route lists what was learned and the user forgets one for good", () => {
  const h = makeHost();
  seed(h);
  put(h, "forum/facts/mavka.u1.json", { facts: [{ id: "l1", text: "Serhii is building a guitar pedal.", kind: "about_you", at: 50, from: "t:a" }], forgot: [], dropped: 0 });
  put(h, "clubs/facts/mavka.u1.json", { facts: [{ id: "l1", text: "Serhii brings his bass on Saturday.", kind: "plan", at: 70, from: "c:cl" }], forgot: [], dropped: 0 });
  const call = (method: string, body?: unknown) => messenger.handleRoute({ method, path: "/messenger/facts", ...(method === "GET" ? { query: { id: "mavka" } } : { body }) }, h.host);
  const got = call("GET").json.learned;
  expect(got.map((f: any) => [f.src, f.id])).toEqual([["clubs", "l1"], ["forum", "l1"]]);
  expect(call("POST", { id: "mavka", op: "forget", src: "forum", factId: "l9" }).status).toBe(404);
  expect(call("POST", { id: "mavka", op: "forget", src: "nope", factId: "l1" }).status).toBe(400);
  const after = call("POST", { id: "mavka", op: "forget", src: "forum", factId: "l1" }).json;
  expect(after.learned.map((f: any) => f.src)).toEqual(["clubs"]);
  expect(get(h, "forum/facts/mavka.u1.json").forgot).toEqual(["serhii is building a guitar pedal"]);
  expect(forum.mergeLearned(forum.readLearned(h.fsx, "forum", "mavka", "u1"), ["Serhii is building a guitar pedal!"], 1, "t:a")).toBe(0);
});

test("the messenger's prompt carries the learned facts, public only, and not for a stranger", () => {
  const h = makeHost();
  seed(h);
  put(h, "forum/facts/mavka.u1.json", { facts: [{ id: "l1", text: "Serhii is building a guitar pedal.", kind: "about_you", at: 50, from: "t:a" }] });
  const chat = { id: "mavka", persona: "u1", messages: [], facts: [] };
  expect(messenger.elsewhereFor(h.fsx, chat)).toBe("- Serhii is building a guitar pedal.");
  const prompt = messenger.systemPromptFor({ id: "mavka", name: "Mavka", about: "x", schedule: always }, { name: "Serhii", about: "" }, "", { elsewhere: messenger.elsewhereFor(h.fsx, chat) });
  expect(prompt).toContain("said openly on the forum and in the clubs");
  expect(prompt).toContain("- Serhii is building a guitar pedal.");
  seed(h, { messengerKnows: "stranger" });
  expect(messenger.elsewhereFor(h.fsx, chat)).toBe("");
});

test("Start over (chats) and deleting a character or a persona remove what was learned; the switch is in Settings", () => {
  const h = makeHost();
  seed(h);
  for (const f of ["forum/facts/mavka.u1.json", "forum/facts/lisovyk.u1.json", "clubs/facts/mavka.u2.json", "clubs/facts/lisovyk.u1.json"]) put(h, f, { facts: [{ id: "l1", text: "x y z", kind: "about_you", at: 1, from: "t:a" }] });
  profiles.removeChats(h.fsx, { profile: "mavka" });
  expect([...h.files.keys()].filter((k) => k.includes("/facts/")).sort()).toEqual(["clubs/facts/lisovyk.u1.json", "forum/facts/lisovyk.u1.json"]);
  profiles.removeChats(h.fsx, { persona: "u1" });
  expect([...h.files.keys()].filter((k) => k.includes("/facts/"))).toEqual([]);
  expect(profiles.RESET_PARTS.chats).toContain("forum/facts");
  expect(profiles.RESET_PARTS.forum).toContain("forum/learn.json");
  const call = (method: string, body?: unknown) => profiles.handleRoute({ method, path: "/settings", body }, h.host);
  expect(call("GET").json.settings.factsLearn).toBe(true);
  expect(call("PUT", { factsLearn: false }).json.settings.factsLearn).toBe(false);
  expect(call("PUT", { postsPerDay: 20 }).json.settings.factsLearn).toBe(false);
});
