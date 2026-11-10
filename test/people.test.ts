// Known people (the Life plugin's list of who a character has met), the forum answering whoever the user addressed first, the persona a
// post was written as, and the board names the profile editor offers.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));

function makeHost(files: Map<string, string> = new Map()) {
  const requests: { key: string; req: any }[] = [];
  const base = {
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        files.delete(p);
      },
      list: (d: string) => {
        const out = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
        if (!out.length) throw new Error("ENOENT");
        return out.sort();
      },
    },
  };
  const hostWith = (llm: Record<string, unknown> = {}) => ({ ...base, llm: { results: llm, request: (key: string, req: any) => void requests.push({ key, req }) }, net: { results: {}, request: () => {} } });
  return { files, requests, host: hostWith(), hostWith };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));

const post = (id: string, by: string, name: string, text: string, at: number, extra: object = {}) => ({ id, by, name, hue: 100, at, text, ...extra });
const mavka = (extra: object = {}) => ({ id: "mavka", name: "Mavka", hue: 150, about: "Lives by the lake.", interests: ["reeds"], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, favourites: [] }, ...extra });
const yaryna = () => ({ ...mavka(), id: "yaryna", name: "Yaryna", about: "A weaver." });

// ---------- topicEvents ----------

test("topicEvents: posts of others in a topic the character wrote in are seen, a quote of her is spoken to her", () => {
  const t = {
    posts: [
      post("1", "yaryna", "Yaryna", "First.", 10),
      post("2", "mavka", "Mavka", "Hello.", 20),
      post("3", "yaryna", "Yaryna", "Hi Mavka.", 30, { quote: { by: "mavka", name: "Mavka", text: "Hello." } }),
      post("4", "me", "Serhii", "Welcome back.", 40, { persona: "u1" }),
    ],
  };
  const ev = life.topicEvents("mavka", t, 0);
  // the post before her first one is in her window; her own post is no event; two later posts are seen
  expect(ev.map((e: any) => [e.key, e.at, e.seen, e.toMe, e.fromMe])).toEqual([
    ["c:yaryna", 10, 1, 0, 0],
    ["c:yaryna", 30, 1, 1, 0],
    ["u:u1", 40, 1, 0, 0],
  ]);
  expect(ev[1].said).toBe("Hi Mavka.");
  expect(ev[1].where).toBe("forum");
});

test("topicEvents: the character's reply to a quoted post, or to the user's post just above, is 'fromMe'; nothing before the cursor counts", () => {
  const t = {
    posts: [
      post("1", "me", "Serhii", "Anyone?", 10, { persona: "u1" }),
      post("2", "mavka", "Mavka", "I am.", 20),
      post("3", "yaryna", "Yaryna", "Me too.", 30),
      post("4", "mavka", "Mavka", "Good.", 40, { quote: { by: "yaryna", name: "Yaryna", text: "Me too." } }),
    ],
  };
  const ev = life.topicEvents("mavka", t, 0);
  const from = ev.filter((e: any) => e.fromMe);
  expect(from.map((e: any) => [e.key, e.said])).toEqual([["u:u1", "Anyone?"], ["c:yaryna", "Me too."]]);
  expect(life.topicEvents("mavka", t, 40)).toEqual([]);
  // a topic she never wrote in is nobody's business
  expect(life.topicEvents("mavka", { posts: [post("1", "yaryna", "Yaryna", "x", 5)] }, 0)).toEqual([]);
});

test("topicEvents: removed posts and old posts without a persona key by name", () => {
  const t = { posts: [post("1", "mavka", "Mavka", "a", 1), { ...post("2", "yaryna", "Yaryna", "", 2), removed: true }, post("3", "me", "Serhii K", "b", 3)] };
  const ev = life.topicEvents("mavka", t, 0);
  expect(ev.map((e: any) => e.key)).toEqual(["n:serhii_k"]);
});

// ---------- the messenger and the merge ----------

test("chatEvents: the user's messages are spoken to her, hers are answers; mergeEvents counts and keeps the last three said", () => {
  const chat = { messages: [{ who: "me", text: "one", at: 5 }, { who: "them", text: "r", at: 6 }, { who: "me", text: "two", at: 7 }, { who: "me", text: "three", at: 8 }, { who: "me", text: "four", at: 9 }] };
  const ev = life.chatEvents(chat, { key: "u:u1", name: "Serhii" }, 0);
  expect(ev).toHaveLength(5);
  expect(life.chatEvents(chat, null, 0)).toEqual([]);
  const pf = life.emptyPeople();
  life.mergeEvents(pf, ev);
  const p = pf.people[0];
  expect([p.seen, p.toMe, p.fromMe, p.first, p.last, p.fresh]).toEqual([4, 4, 1, 5, 9, 5]);
  expect(p.said.map((s: any) => s.text)).toEqual(["two", "three", "four"]);
  expect(p.said[0].where).toBe("messenger");
});

// ---------- the scan, the routes and the impression ----------

function seedWorld(h: H) {
  put(h, "profiles/mavka.json", mavka());
  put(h, "profiles/yaryna.json", yaryna());
  put(h, "settings.json", { tzOffset: 0, models: { messenger: "" }, life: { world: false } });
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "Plays bass." }] });
  put(h, "forum/topics/t1.json", {
    id: "t1", board: "b1", title: "T", by: "yaryna", name: "Yaryna", hue: 1, createdAt: 10, lastAt: 50, locked: false, unread: false, owe: 0,
    posts: [post("1", "yaryna", "Yaryna", "First.", 10), post("2", "mavka", "Mavka", "Hello.", 20), post("3", "me", "Serhii", "Welcome.", 30, { persona: "u1", quote: { by: "mavka", name: "Mavka", text: "Hello." } }), post("4", "yaryna", "Yaryna", "Hi.", 50)],
  });
  put(h, "chats/mavka.json", { id: "mavka", messages: [{ id: "a", who: "me", at: 60, text: "Are you there?" }, { id: "b", who: "them", at: 61, text: "Yes." }] });
}

test("a tick scans the forum and the chats once, then waits; the people route lists them and forgets", () => {
  const h = makeHost();
  seedWorld(h);
  life.onTick({}, h.host);
  const pf = get(h, "life/people/mavka.json");
  const names = pf.people.map((p: any) => p.name).sort();
  expect(names).toEqual(["Serhii", "Yaryna"]);
  const serhii = pf.people.find((p: any) => p.key === "u:u1");
  expect(serhii.toMe).toBe(2); // his quote of her on the forum and his chat message
  expect(serhii.seen).toBe(2);
  expect(serhii.said.map((s: any) => s.where)).toEqual(["forum", "messenger"]);
  // the second tick is inside the five minutes: nothing is counted twice
  life.onTick({}, h.host);
  expect(get(h, "life/people/mavka.json").people.find((p: any) => p.key === "u:u1").seen).toBe(2);

  const r = life.handleRoute({ method: "GET", path: "/life/people/mavka" }, h.host);
  expect(r.json.people.map((p: any) => p.key).sort()).toEqual(["c:yaryna", "u:u1"]);
  expect(r.json.people[0]).not.toHaveProperty("fresh");
  const one = life.handleRoute({ method: "DELETE", path: "/life/people/mavka/" + encodeURIComponent("c:yaryna") }, h.host);
  expect(one.json.people.map((p: any) => p.key)).toEqual(["u:u1"]);
  const none = life.handleRoute({ method: "DELETE", path: "/life/people/mavka" }, h.host);
  expect(none.json.people).toEqual([]);
  expect(life.handleRoute({ method: "GET", path: "/life/people/ghost" }, h.host).status).toBe(404);
});

test("a character whose diary is off, or the Life switch off, keeps no list", () => {
  const h = makeHost();
  seedWorld(h);
  put(h, "profiles/mavka.json", mavka({ life: { on: false } }));
  life.onTick({}, h.host);
  expect(h.files.has("life/people/mavka.json")).toBe(false);
  expect(h.files.has("life/people/yaryna.json")).toBe(true);
});

test("the impression: asked once a day when enough is new, filed by name, a failure waits", () => {
  const h = makeHost();
  seedWorld(h);
  life.onTick({}, h.host); // scan
  life.onTick({}, h.host); // asks: the diaries first (two profiles)
  life.onTick({}, h.host);
  const asked = () => h.requests.filter((r) => r.key.startsWith("pn:"));
  // diary calls are answered by nobody here; the people request comes when no diary is due
  for (const id of ["mavka", "yaryna"]) {
    const d = { entries: [], mood: "", plan: "", lastDay: life.localDay(Date.now(), 0), failedAt: 0 };
    put(h, `life/diary/${id}.json`, d);
  }
  life.onTick({}, h.host);
  const req = asked()[0];
  expect(req).toBeDefined();
  expect(req.req.messages[0].content).toContain("Serhii (the human user)");
  expect(req.req.messages[0].content).toContain("Answer with JSON only");
  expect(life.noteSystem(life.readPeople(h.host.fs, "mavka") && { name: "Mavka", about: "x", voice: {} })).toContain("You are Mavka");

  const answered = h.hostWith({ [req.key]: { text: '```json\n{"notes":[{"name":"serhii","note":"Quiet and kind."}]}\n```' } });
  life.onTick({}, answered);
  const pf = get(h, "life/people/" + req.key.slice(3) + ".json");
  const s = pf.people.find((p: any) => p.name === "Serhii");
  expect(s.note).toBe("Quiet and kind.");
  expect(s.fresh).toBe(0);
  expect(pf.noteDay).toBe(life.localDay(Date.now(), 0));

  // a bad answer: nothing filed, the failure is remembered
  const h2 = makeHost();
  seedWorld(h2);
  life.onTick({}, h2.host);
  const pf2 = life.readPeople(h2.host.fs, "mavka");
  expect(life.fileNotes(pf2, "no json here", 1, 0)).toEqual({ error: "the model's answer held no impression" });
});

test("a deleted profile's list is swept with its diary", () => {
  const h = makeHost();
  seedWorld(h);
  put(h, "life/people/ghost.json", { scanned: 1, people: [] });
  put(h, "life/diary/ghost.json", { entries: [] });
  const t = new Date();
  // the sweep runs on the hour when nothing else is asked: diaries written today, nothing new to say about anyone
  const realNow = Date.now;
  Date.now = () => new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0).getTime();
  try {
    for (const id of ["mavka", "yaryna"]) {
      put(h, `life/diary/${id}.json`, { entries: [], mood: "", plan: "", lastDay: life.localDay(Date.now(), 0), failedAt: 0 });
      put(h, `life/people/${id}.json`, { scanned: Date.now() + 1e6, noteDay: life.localDay(Date.now(), 0), failedAt: 0, people: [] });
    }
    life.onTick({}, h.host);
  } finally {
    Date.now = realNow;
  }
  expect(h.files.has("life/people/ghost.json")).toBe(false);
  expect(h.files.has("life/diary/ghost.json")).toBe(false);
});

// ---------- what reaches a prompt ----------

test("metLine: the forum and the messenger agree, and it says who was met, what they said and the impression", () => {
  const h = makeHost();
  put(h, "profiles/mavka.json", mavka());
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }] });
  put(h, "life/people/mavka.json", { scanned: 1, people: [{ key: "u:u1", name: "Serhii", kind: "user", first: 1, last: 2, seen: 7, toMe: 3, fromMe: 2, said: [{ at: 2, where: "forum", text: "Is the fog gone?" }], note: "Quiet and kind.", noteAt: 3, fresh: 0 }] });
  const line = forum.metLine(h.host.fs, mavka(), "u:u1");
  expect(line).toBe('You have met Serhii before (you have seen them 7 times). They once told you: "Is the fog gone?". Your impression of them: Quiet and kind.');
  expect(messenger.metLine(h.host.fs, mavka(), "u:u1")).toBe(line);
  expect(forum.metLine(h.host.fs, mavka(), "c:nobody")).toBe("");
  put(h, "profiles/mavka.json", mavka({ life: { on: false } }));
  expect(forum.metLine(h.host.fs, mavka({ life: { on: false } }), "u:u1")).toBe("");
  expect(messenger.metUser(h.host.fs, mavka())).toBe(line);
  expect(messenger.metUser(h.host.fs, mavka({ knows: "stranger" }))).toBe("");
});

test("a messenger prompt carries what she remembers of the user", () => {
  const h = makeHost();
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }] });
  put(h, "life/people/mavka.json", { scanned: 1, people: [{ key: "u:u1", name: "Serhii", kind: "user", first: 1, last: 2, seen: 7, toMe: 3, fromMe: 2, said: [], note: "Quiet and kind.", noteAt: 3, fresh: 0 }] });
  const prompt = messenger.systemPromptFor(mavka(), { name: "Serhii", about: "" }, "", { met: messenger.metUser(h.host.fs, mavka()) });
  expect(prompt).toContain("Your impression of them: Quiet and kind.");
  expect(forum.systemPromptFor({ ...mavka(), interests: [], habits: [] }, "", { met: "You have met Yaryna before." })).toContain("You have met Yaryna before.");
});

// ---------- the forum: persona on a reply, answering whoever was addressed ----------

test("a reply to a post written as another persona is told that persona's name and About, not the active one's", () => {
  const h = makeHost();
  put(h, "settings.json", { tzOffset: 0 });
  put(h, "you.json", { active: "u2", personas: [{ id: "u1", name: "Serhii", about: "Plays bass." }, { id: "u2", name: "Olena", about: "A pilot." }] });
  const topic = { id: "t", posts: [post("1", "me", "Serhii", "Hello", 10, { persona: "u1" })] };
  const k = forum.userKnownTo(h.host.fs, mavka(), topic, topic.posts[0]);
  expect(k.name).toBe("Serhii");
  expect(k.about).toBe("Plays bass.");
  // a deleted persona keeps its name from the post and gets no About
  const gone = { id: "t", posts: [post("1", "me", "Taras", "Hello", 10, { persona: "u9" })] };
  const g = forum.userKnownTo(h.host.fs, mavka(), gone, gone.posts[0]);
  expect([g.name, g.about]).toEqual(["Taras", ""]);
  // an old post with no persona falls back to the active one
  const old = { id: "t", posts: [post("1", "me", "", "Hello", 10)] };
  expect(forum.userKnownTo(h.host.fs, mavka(), old, old.posts[0]).about).toBe("A pilot.");
});

const profilesOf = () => [{ id: "mavka", name: "Mavka", forum: { repliesYou: true, repliesOthers: true } }, { id: "yaryna", name: "Yaryna", forum: { repliesYou: true, repliesOthers: true } }];

test("addresseeOf: the author of the quoted post, else a named character, else nobody", () => {
  expect(forum.addresseeOf(profilesOf(), { by: "yaryna" }, "x")).toBe("yaryna");
  expect(forum.addresseeOf(profilesOf(), { by: "gone" }, "thanks")).toBe("");
  expect(forum.addresseeOf(profilesOf(), null, "I agree with mavka here")).toBe("mavka");
  expect(forum.addresseeOf(profilesOf(), { by: "me" }, "my own post")).toBe("");
});

test("the character the user answered is answered back first, even when the owed count has run out", () => {
  const h = makeHost();
  put(h, "profiles/mavka.json", mavka());
  put(h, "profiles/yaryna.json", yaryna());
  put(h, "settings.json", { autonomous: true, tzOffset: 0, postsPerDay: 30, postsPerAuthor: 6, newTopicShare: 0, quietFrom: "01:00", quietTo: "08:00", models: { forum: "" } });
  put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Guest", desc: "" }] }] });
  const now = Date.now();
  const topic = (addressed: string, owe: number) =>
    put(h, "forum/topics/t.json", { id: "t", board: "b1", title: "T", by: "mavka", name: "Mavka", hue: 1, createdAt: now - 9000, lastAt: now, locked: false, unread: false, owe, addressed, posts: [post("1", "mavka", "Mavka", "a", now - 9000), post("2", "yaryna", "Yaryna", "b", now - 5000), post("3", "me", "Serhii", "Yaryna, what do you think?", now, { quote: { by: "yaryna", name: "Yaryna", text: "b" } })] });
  const plan = () => {
    const s = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const fsx = h.host.fs;
    return forum.planAction({ profiles: forum.loadProfiles(fsx), topics: forum.loadTopics(fsx), boards: forum.readBoards(fsx), settings: forum.readSettings(fsx), log: forum.readLog(fsx, now, 0), now, tz: 0, mode: "force" }, s(7));
  };
  topic("yaryna", 0); // the owed count is spent, she is still the one
  for (let i = 0; i < 12; i++) expect(plan().author.id).toBe("yaryna");
  topic("mavka", 2); // the one addressed has not written since the user's post: first, although she wrote the topic
  for (let i = 0; i < 12; i++) expect(plan().author.id).toBe("mavka");
});

test("the user's reply remembers who was addressed; a plain reply clears it; a named character counts", () => {
  const h = makeHost();
  put(h, "profiles/mavka.json", mavka());
  put(h, "profiles/yaryna.json", yaryna());
  put(h, "settings.json", { tzOffset: 0 });
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }] });
  put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Guest", desc: "" }] }] });
  const now = Date.now();
  put(h, "forum/topics/t.json", { id: "t", board: "b1", title: "T", by: "yaryna", name: "Yaryna", hue: 1, createdAt: now - 99, lastAt: now - 9, locked: false, unread: false, owe: 0, posts: [post("p1", "yaryna", "Yaryna", "Hello", now - 9)] });
  const call = (body: object) => forum.handleRoute({ method: "POST", path: "/forum/reply", body: { topic: "t", ...body } }, h.host);
  call({ text: "Answering you", quoteOf: "p1" });
  expect(get(h, "forum/topics/t.json").addressed).toBe("yaryna");
  call({ text: "Just a thought" });
  expect(get(h, "forum/topics/t.json").addressed).toBe("");
  call({ text: "Mavka, you will like this" });
  expect(get(h, "forum/topics/t.json").addressed).toBe("mavka");
  // the persona rides on the post
  expect(get(h, "forum/topics/t.json").posts.at(-1).persona).toBe("u1");
});

test("GET /forum/boards lists the boards by name for the profile editor", () => {
  const h = makeHost();
  put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Guest", desc: "Hello" }, { id: "b2", name: "Tales", desc: "x" }] }] });
  const r = forum.handleRoute({ method: "GET", path: "/forum/boards" }, h.host);
  expect(r.json.categories[0].boards.map((b: any) => b.name)).toEqual(["Guest", "Tales"]);
  expect(r.json.categories[0].boards[0]).not.toHaveProperty("desc");
});
