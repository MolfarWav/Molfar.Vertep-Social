// The community's own life (#367): jealousy and gossip by rules, the tone between characters (none, warm, flirty) and the check that keeps
// anything explicit out of what characters write to each other (#366). No model is called: a model only words the post it is asked for.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const chatter = await import(path.join(root, "plugins/chatter/plugin.js"));
const profilesPlugin = await import(path.join(root, "plugins/profiles/plugin.js"));

const DAY = 86400000;
const NOW = 40 * DAY + 12 * 3600 * 1000;
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));

function makeHost(files: Map<string, string> = new Map()) {
  return {
    files,
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
  };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);

const NAMES: Record<string, string> = { anna: "Anna", boris: "Boris", clara: "Clara", dmytro: "Dmytro" };
const person = (id: string, extra: object = {}) => ({ key: "c:" + id, name: NAMES[id], seen: 3, toMe: 1, fromMe: 1, said: [], note: "", feel: 0, ...extra });

/** A world of four adult characters. `lists` is what each one's list of people says. */
function world(lists: Record<string, object[]>, opts: { tone?: string; adult?: boolean } = {}) {
  const h = makeHost();
  for (const id of Object.keys(NAMES)) {
    put(h, `profiles/${id}.json`, { id, name: NAMES[id], hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, ...(opts.adult === false ? {} : { adult: true }), forum: { frequency: 50 }, life: { on: true, world: true } });
    put(h, `life/people/${id}.json`, { scanned: 0, noteDay: "", failedAt: 0, people: lists[id] || [] });
  }
  put(h, "settings.json", { tzOffset: 0, community: { tone: opts.tone || "warm" } });
  return h;
}
const post = (id: string, by: string, at: number, text = "hello", extra: object = {}) => ({ id, by, name: NAMES[by] || "Serhii", hue: 100, at, text, ...extra });
const topic = (id: string, posts: any[], extra: object = {}) => ({ id, board: "b1", title: "T " + id, by: posts[0].by, name: posts[0].name, hue: 100, createdAt: posts[0].at, lastAt: posts[posts.length - 1].at, locked: false, unread: false, owe: 0, posts, ...extra });
const boards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "General", desc: "" }] }] };
const settings = { gossip: true, gossipPerDay: 2, jealousy: true, tzOffset: 0 };
const relOf = (h: H, topics: any[] = [], s: object = settings) => forum.relationsOf(h.fs, forum.loadProfiles(h.fs), topics, NOW, s);
const lcg = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// ---------- the tone between characters ----------

test("the level: none tells no romance between characters, warm is the default and gentle, flirty allows hints; toward the user nothing changes", () => {
  const lists = { anna: [person("boris", { lvl: "friend", ties: [{ type: "crush" }] }), { key: "u:me1", name: "Serhii", lvl: "friend", ties: [{ type: "partner" }] }] };
  const line = (tone: string, key = "c:boris") => {
    const h = world(lists, { tone });
    return messenger.metLine(h.fs, { id: "anna" }, key);
  };
  expect(line("none")).not.toContain("crush");
  expect(line("none")).toContain("You are friends.");
  expect(line("warm")).toContain("You have a crush on Boris.");
  expect(line("warm")).toContain("no flirting and no innuendo");
  expect(line("warm")).toContain("never anything explicit");
  expect(line("flirty")).toContain("hints and teasing are fine");
  for (const tone of ["none", "warm", "flirty"]) expect(line(tone, "u:me1")).toContain("Serhii is your partner.");
  // no value, or a bad one: warm
  const h = world(lists);
  put(h, "settings.json", { community: { tone: "wild" } });
  expect(forum.communityLevel(h.fs)).toBe("warm");
  h.files.delete("settings.json");
  expect(forum.communityLevel(h.fs)).toBe("warm");
  expect(chatter.communityLevel(h.fs)).toBe("warm");
});

test("settings carry the level, gossip and jealousy, bad values fall back", () => {
  const d = profilesPlugin.DEFAULT_SETTINGS.community;
  expect([d.tone, d.gossip, d.gossipPerDay, d.jealousy]).toEqual(["warm", true, 2, true]);
  const m = profilesPlugin.mergeSettings(profilesPlugin.DEFAULT_SETTINGS, { community: { tone: "flirty", gossip: false, gossipPerDay: 500, jealousy: false } });
  expect([m.community.tone, m.community.gossip, m.community.gossipPerDay, m.community.jealousy]).toEqual(["flirty", false, 20, false]);
  const bad = profilesPlugin.mergeSettings(m, { community: { tone: "explicit", gossip: "yes" } });
  expect([bad.community.tone, bad.community.gossip]).toEqual(["flirty", false]);
  const h = world({}, { tone: "none" });
  put(h, "settings.json", { community: { gossip: false, gossipPerDay: 5, jealousy: false } });
  const s = forum.readSettings(h.fs);
  expect([s.gossip, s.gossipPerDay, s.jealousy]).toEqual([false, 5, false]);
  expect(forum.readSettings(makeHost().fs)).toMatchObject({ gossip: true, gossipPerDay: 2, jealousy: true });
});

// ---------- the ceiling ----------

test("overCeiling stops plainly explicit text in both languages and leaves ordinary words alone", () => {
  for (const bad of ["They had sex all night.", "she moaned during the blowjob", "He was masturbating again", "a сцена, де вони займаються сексом", "після цього мінет", "відвертий статевий акт", "я тебе трахну"])
    expect(forum.overCeiling(bad)).toBe(true);
  for (const fine of ["She finished the report.", "Sussex is lovely this time of year.", "He tried to penetrate the defences of the fort.", "A sword in its scabbard.", "Вона закінчила роботу.", "піхва меча", "Я тебе кохаю, але це складно.", "You blush when I tease you, admit it.", "Cumulus clouds over the lake."])
    expect(forum.overCeiling(fine)).toBe(false);
  expect(chatter.overCeiling("blowjob")).toBe(true);
});

test("the ceiling blocks are the same in the forum, the characters' chats and the clubs", () => {
  const block = (f: string) => /\/\/ <ceiling-shared>[\s\S]*?\/\/ <\/ceiling-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n"))?.[0];
  expect(block("plugins/forum/plugin.js")).toBeTruthy();
  expect(block("plugins/chatter/plugin.js")).toBe(block("plugins/forum/plugin.js"));
  expect(block("plugins/clubs/plugin.js")).toBe(block("plugins/forum/plugin.js"));
});

test("a post between characters that goes past the ceiling is not filed, an answer to the user is the character's own matter", () => {
  const h = world({});
  put(h, "forum/boards.json", boards);
  const explicit = "They had sex and she did not stop.";
  const t1 = topic("t1", [post("p1", "boris", NOW - 5000, "Hello")]);
  put(h, "forum/topics/t1.json", t1);
  const toBoris = forum.fileResult(h.fs, { kind: "reply", author: "anna", topic: "t1", quote: "p1" }, { text: explicit }, NOW, boards);
  expect(toBoris.error).toContain("ceiling");
  expect(get(h, "forum/topics/t1.json").posts.length).toBe(1);
  const t2 = topic("t2", [post("u1", "me", NOW - 5000, "Hi Anna", { persona: "me1" })]);
  put(h, "forum/topics/t2.json", t2);
  const toUser = forum.fileResult(h.fs, { kind: "reply", author: "anna", topic: "t2", quote: "u1" }, { text: explicit }, NOW, boards);
  expect(toUser.post).toBeTruthy();
  // a new topic
  const opened = forum.fileResult(h.fs, { kind: "topic", author: "anna", board: "b1", ref: "" }, { text: JSON.stringify({ title: "Night", text: explicit }) }, NOW, boards);
  expect(opened.error).toContain("ceiling");
  const fine = forum.fileResult(h.fs, { kind: "topic", author: "anna", board: "b1", ref: "" }, { text: JSON.stringify({ title: "Night", text: "A quiet night on the reeds." }) }, NOW, boards);
  expect(fine.post).toBeTruthy();
});

test("a message in the characters' own chat that goes past the ceiling is not filed", () => {
  const h = world({});
  put(h, "chatter/anna__boris.json", { a: "anna", b: "boris", on: true, messages: [], today: 0, day: "", failedAt: 0, pending: NOW - 1000 });
  const key = "ch:anna__boris:anna";
  const r = chatter.fileChatResult(h.fs, key, { text: "she had sex with him" }, NOW, 0);
  expect(r.error).toContain("ceiling");
  const ok = chatter.fileChatResult(h.fs, key, { text: "See you on the forum." }, NOW, 0);
  expect(ok.message).toBeTruthy();
});

// ---------- jealousy ----------

test("jealousOf: a rival tie, and love: a crush whose object is getting close to someone else; the level and adulthood switch romance off", () => {
  const lists = {
    anna: [person("boris", { lvl: "friend", ties: [{ type: "crush" }] }), person("clara", { ties: [{ type: "rival" }] }), person("dmytro")],
    clara: [person("boris", { ties: [{ type: "dating" }] })],
    dmytro: [person("boris", { feel: 6 })],
  };
  const rel = relOf(world(lists));
  expect(forum.jealousOf(rel, "anna", "clara")).toEqual({ kind: "rival" });
  // Clara is dating Boris, whom Anna has a crush on
  expect(forum.jealousOf(rel, "anna", "boris")).toBeNull();
  // Anna to Clara is a rival tie; make a pure love case with Dmytro: he answers Boris twice and likes him
  const t = topic("t1", [post("p1", "boris", NOW - 9000, "x"), post("p2", "dmytro", NOW - 8000, "y", { quote: { by: "boris", name: "Boris", text: "x" } }), post("p3", "dmytro", NOW - 7000, "z", { quote: { by: "boris", name: "Boris", text: "x" } })]);
  const rel2 = relOf(world({ anna: [person("boris", { ties: [{ type: "crush" }] }), person("dmytro")], dmytro: [person("boris", { feel: 6 })] }), [t]);
  expect(forum.jealousOf(rel2, "anna", "dmytro")).toEqual({ kind: "love", over: "boris" });
  // somebody with no closeness to Boris is not a rival
  expect(forum.jealousOf(rel2, "anna", "clara")).toBeNull();
  // tone none: no jealousy over love
  const none = relOf(world({ anna: [person("boris", { ties: [{ type: "crush" }] }), person("dmytro")], dmytro: [person("boris", { feel: 6 })] }, { tone: "none" }), [t]);
  expect(forum.jealousOf(none, "anna", "dmytro")).toBeNull();
  // not adult: no romance, so no love jealousy
  const kids = relOf(world({ anna: [person("boris", { ties: [{ type: "crush" }] }), person("dmytro")], dmytro: [person("boris", { feel: 6 })] }, { adult: false }), [t]);
  expect(forum.jealousOf(kids, "anna", "dmytro")).toBeNull();
  // a rival tie needs no romance
  expect(forum.jealousOf(relOf(world(lists, { adult: false, tone: "none" })), "anna", "clara")).toEqual({ kind: "rival" });
  expect(forum.jealousOf(rel, "anna", "anna")).toBeNull();
});

test("hurtBy: a friend who has lately been warm with someone the character is set against", () => {
  const lists = { anna: [person("boris", { lvl: "friend" }), person("clara", { ties: [{ type: "rival" }] })], boris: [person("clara", { feel: 5 })] };
  const t = topic("t1", [post("p1", "clara", NOW - 5000, "x"), post("p2", "boris", NOW - 4000, "y", { quote: { by: "clara", name: "Clara", text: "x" } })]);
  const rel = relOf(world(lists), [t]);
  expect(forum.hurtBy(rel, "anna", "boris")).toEqual({ with: "clara" });
  // no friendship with Boris: nothing
  expect(forum.hurtBy(relOf(world({ ...lists, anna: [person("clara", { ties: [{ type: "rival" }] })] }), [t]), "anna", "boris")).toBeNull();
  // an old exchange does not count
  const old = topic("t2", [post("p1", "clara", NOW - 9 * DAY, "x"), post("p2", "boris", NOW - 9 * DAY + 1000, "y", { quote: { by: "clara", name: "Clara", text: "x" } })], { lastAt: NOW - 9 * DAY });
  expect(forum.hurtBy(relOf(world(lists), [old]), "anna", "boris")).toBeNull();
});

test("jealousLine words the rival, the jealous and the hurt case, and keeps romance to the ceiling", () => {
  const t = topic("t1", [post("p1", "boris", NOW - 9000, "x"), post("p2", "dmytro", NOW - 8000, "y", { quote: { by: "boris", name: "Boris", text: "x" } }), post("p3", "dmytro", NOW - 7000, "z", { quote: { by: "boris", name: "Boris", text: "x" } })]);
  const lists = { anna: [person("boris", { ties: [{ type: "crush" }] }), person("dmytro"), person("clara", { ties: [{ type: "rival" }] })], dmytro: [person("boris", { feel: 6 })] };
  const rel = relOf(world(lists), [t]);
  expect(forum.jealousLine(rel, "anna", "clara")).toContain("Clara is your rival");
  const love = forum.jealousLine(rel, "anna", "dmytro");
  expect(love).toContain("You are jealous of Dmytro");
  expect(love).toContain("Boris");
  expect(love).toContain("never cruel");
  expect(love).toContain("no flirting");
  expect(forum.jealousLine(relOf(world(lists, { tone: "flirty" }), [t]), "anna", "dmytro")).toContain("hints and teasing");
  expect(forum.jealousLine(rel, "anna", "boris")).toBe("");
  expect(forum.jealousLine(rel, "dmytro", "anna")).toBe("");
});

function base() {
  const lists = { anna: [person("clara", { ties: [{ type: "rival" }], feel: -9 }), person("boris", { feel: 0 })] };
  const rel = relOf(world(lists));
  const anna = forum.loadProfiles(makeHost(world(lists).files).fs).find((p: any) => p.id === "anna");
  const log = { day: "", byAuthor: {}, lastAuthor: "", total: 0, reacts: {} };
  return { rel, anna, log, lists };
}

test("planAction: a rival's post draws an answer to argue, where a plain dislike draws almost none; a rival's mention is not let go", () => {
  const { rel, anna, log } = base();
  const topics = [topic("tC", [post("pc", "clara", NOW - 1000, "my take")]), topic("tB", [post("pb", "boris", NOW - 1000, "my take")])];
  const c = { profiles: [anna], topics, boards, settings: { writers: "equal", postsPerAuthor: 99, newTopicShare: 0 }, log, now: NOW, tz: 0, mode: "force", feels: { anna: { "c:clara": -9 } } };
  const run = (rl: object | null) => {
    const rand = lcg(11);
    const hits: Record<string, number> = { tC: 0, tB: 0 };
    for (let i = 0; i < 400; i++) {
      const plan = forum.planAction({ ...c, rel: rl }, rand);
      if (plan && plan.kind === "reply") hits[plan.topic.id]++;
    }
    return hits;
  };
  const without = run(null);
  const withRel = run(rel);
  expect(without.tC).toBeLessThan(without.tB / 3); // cold: she lets Clara be
  expect(withRel.tC).toBeGreaterThan(withRel.tB); // rival: she answers to argue
  // jealousy switched off: the old behaviour
  expect(run({ ...rel, jealousy: false }).tC).toBeLessThan(without.tB / 3);
  // a mention by a rival is never let go
  const mention = [topic("tM", [post("pm", "clara", NOW - 1000, "Anna, what do you think?")])];
  let n = 0;
  for (let i = 0; i < 100; i++) {
    const plan = forum.planAction({ ...c, topics: mention, rel }, () => (i % 10) / 10);
    if (plan && plan.kind === "reply" && plan.target) n++;
  }
  expect(n).toBe(100);
});

test("an answer with no target to the topic still carries the rival line, from whoever wrote last", () => {
  const lists = { anna: [person("clara", { ties: [{ type: "rival" }], feel: -5 })] };
  const h = world(lists);
  put(h, "forum/boards.json", boards);
  put(h, "forum/topics/tR.json", topic("tR", [post("r1", "clara", Date.now() - 5000, "Print is dead.")]));
  for (const id of ["boris", "dmytro"]) h.files.delete("profiles/" + id + ".json");
  const requests: any[] = [];
  const host = { fs: h.fs, llm: { results: {}, request: (key: string, req: any) => void requests.push({ key, req }) } };
  const out = forum.handleRoute({ method: "POST", path: "/forum/force", body: { count: 1, topic: "tR" } }, host);
  expect(out.__llmPending).toBe(true);
  expect(requests[0].req.systemPrompt).toContain("Clara is your rival");
  // jealousy off: the line is gone
  put(h, "settings.json", { tzOffset: 0, community: { jealousy: false } });
  requests.length = 0;
  forum.handleRoute({ method: "POST", path: "/forum/force", body: { count: 1, topic: "tR" } }, host);
  expect(requests[0].req.systemPrompt).not.toContain("rival");
});

test("pickReaction: no reaction for a rival while jealousy is on", () => {
  const { rel, anna, log } = base();
  const boris = forum.loadProfiles(makeHost(world({}).files).fs).find((p: any) => p.id === "boris");
  const topics = [topic("tC", [post("pc", "clara", NOW - 1000, "my take")])];
  const c = { profiles: [anna], topics, settings: { reactions: true, reactionsPerDay: 8 }, log, now: NOW, tz: 0, feels: {} };
  expect(forum.pickReaction({ ...c, rel }, () => 0.1)).toBeNull();
  expect(forum.pickReaction({ ...c, rel: null }, () => 0.1)?.post.id).toBe("pc");
  expect(boris).toBeTruthy();
});

// ---------- gossip ----------

test("gossipCandidates: a quarrel, a new closeness and a crush the character has met the people of; never the user, never itself", () => {
  const lists = {
    anna: [person("boris"), person("clara"), person("dmytro")],
    boris: [person("clara", { feel: -6, toMe: 2, fromMe: 1 })],
    clara: [person("dmytro", { feel: 9, toMe: 3, fromMe: 2, ties: [{ type: "dating" }] })],
  };
  const t = topic("t1", [post("p1", "dmytro", NOW - 5000, "x"), post("p2", "clara", NOW - 4000, "y", { quote: { by: "dmytro", name: "Dmytro", text: "x" } })]);
  const rel = relOf(world(lists), [t]);
  const kinds = forum.gossipCandidates(rel, "anna", NOW).map((c: any) => c.kind + ":" + c.about.join("+"));
  expect(kinds).toContain("rift:boris+clara");
  expect(kinds).toContain("sweet:clara+dmytro");
  // closeness needs three exchanges and a warm side; here clara and dmytro are warm
  expect(kinds).toContain("close:clara+dmytro");
  for (const c of forum.gossipCandidates(rel, "anna", NOW)) expect(c.about).not.toContain("anna");
  // Anna has met nobody: nothing to tell
  expect(forum.gossipCandidates(relOf(world({ ...lists, anna: [] }), [t]), "anna", NOW)).toEqual([]);
  // the romance kind goes with the level
  const none = relOf(world(lists, { tone: "none" }), [t]);
  expect(forum.gossipCandidates(none, "anna", NOW).some((c: any) => c.kind === "sweet")).toBe(false);
  // a character is told on by someone it dislikes: sharper
  const mean = relOf(world({ ...lists, anna: [person("boris", { feel: -8 }), person("clara", { feel: -8 }), person("dmytro")] }), [t]);
  expect(forum.gossipCandidates(mean, "anna", NOW).find((c: any) => c.kind === "rift").tone).toBe("sharp");
  const kind = relOf(world({ ...lists, anna: [person("boris", { feel: 8 }), person("clara", { feel: 8 }), person("dmytro")] }), [t]);
  expect(forum.gossipCandidates(kind, "anna", NOW).find((c: any) => c.kind === "rift").tone).toBe("kind");
});

function seeded() {
  const lists = { anna: [person("boris"), person("clara")], boris: [person("clara", { feel: -6, toMe: 2, fromMe: 1 })] };
  const h = world(lists);
  put(h, "forum/boards.json", boards);
  put(h, "forum/topics/t0.json", topic("t0", [post("p0", "dmytro", NOW - 3 * 3600 * 1000, "hello")]));
  return h;
}

test("a new topic may carry gossip: kept as a draft, filed as a told rumour with the topic, and never told twice by the same character", () => {
  const h = seeded();
  const topics = forum.loadTopics(h.fs);
  const rel = forum.relationsOf(h.fs, forum.loadProfiles(h.fs), topics, NOW, settings);
  const anna = forum.loadProfiles(h.fs).find((p: any) => p.id === "anna");
  const plan: any = { kind: "topic", author: anna, board: boards.categories[0].boards[0] };
  // the share is a draw: 0 always takes it, 0.99 never
  const sub = forum.pickSubject(anna, { board: plan.board, titles: [], fsx: h.fs, now: NOW, rel }, () => 0);
  expect(sub.gossip.kind).toBe("rift");
  expect(sub.text).toContain("Boris and Clara have been at odds lately");
  expect(sub.text).toContain("never reveal anything from anyone's private chats");
  expect(forum.pickSubject(anna, { board: plan.board, titles: [], fsx: h.fs, now: NOW, rel }, () => 0.99).gossip).toBeUndefined();
  // rel off: no gossip at all
  expect(forum.pickSubject(anna, { board: plan.board, titles: [], fsx: h.fs, now: NOW, rel: null }, () => 0).gossip).toBeUndefined();
  expect(forum.pickSubject(anna, { board: plan.board, titles: [], fsx: h.fs, now: NOW, rel: { ...rel, gossip: false } }, () => 0).gossip).toBeUndefined();
});

test("withSubject keeps the draft, fileResult turns it into a told rumour, the cap counts it, and a third member passes it on with less truth", () => {
  const h = seeded();
  const rel = () => forum.relationsOf(h.fs, forum.loadProfiles(h.fs), forum.loadTopics(h.fs), NOW, settings);
  const author = (id: string) => forum.loadProfiles(h.fs).find((p: any) => p.id === id);
  const plan: any = { kind: "topic", author: author("anna"), board: boards.categories[0].boards[0] };
  forum.withSubject(h.fs, plan, forum.loadTopics(h.fs), NOW, () => 0, rel());
  expect(plan.subject.ref).toMatch(/^g-/);
  expect(get(h, "forum/gossip.json").drafts.length).toBe(1);
  const key = forum.tickKey(forum.filingOf(plan));
  expect(key).toMatch(/^an:anna:b1:g-/);
  const f = forum.parseTickKey(key);
  expect(f.ref).toBe(plan.subject.ref);
  const r = forum.fileResult(h.fs, f, { text: JSON.stringify({ title: "Have you noticed", text: "Boris and Clara seem tense lately." }) }, NOW + 1000, boards);
  expect(r.post).toBeTruthy();
  const after = get(h, "forum/gossip.json");
  expect(after.drafts).toEqual([]);
  expect(after.items.length).toBe(1);
  expect(after.items[0]).toMatchObject({ kind: "rift", about: ["boris", "clara"], by: "anna", topic: r.topicId, told: ["anna"] });
  // the life-used list is not touched by a rumour
  expect(h.files.has("forum/life-used.json")).toBe(false);
  expect(forum.gossipToday(forum.readGossip(h.fs).items, NOW + 2000, 0)).toBe(1);
  // Dmytro has met both of them: he may pass it on, with less truth in it; Anna, who told it, may not
  const later = NOW + 5000;
  const relAfter = forum.relationsOf(h.fs, forum.loadProfiles(h.fs), forum.loadTopics(h.fs), later, settings);
  expect(forum.gossipCandidates(relAfter, "anna", later).some((x: any) => x.spread)).toBe(false);
  put(h, "life/people/dmytro.json", { scanned: 0, noteDay: "", failedAt: 0, people: [person("boris"), person("clara")] });
  const again = forum.relationsOf(h.fs, forum.loadProfiles(h.fs), forum.loadTopics(h.fs), later, settings);
  const dm = forum.gossipCandidates(again, "dmytro", later).find((x: any) => x.spread);
  expect(dm).toMatchObject({ kind: "rift", about: ["boris", "clara"], from: "anna" });
  expect(dm.truth).toBeLessThan(1);
  // filing his retelling teaches the first item who told it
  const plan2: any = { kind: "topic", author: author("dmytro"), board: boards.categories[0].boards[0] };
  // the share draw first, then the last candidate: the retelling comes after what the character saw itself
  let calls = 0;
  forum.withSubject(h.fs, plan2, forum.loadTopics(h.fs), later, () => (calls++ === 0 ? 0 : 0.99), again);
  expect(forum.readGossip(h.fs).drafts[0].spread).toBe(after.items[0].id);
  forum.fileResult(h.fs, forum.parseTickKey(forum.tickKey(forum.filingOf(plan2))), { text: JSON.stringify({ title: "Heard something", text: "Apparently they fell out." }) }, later, boards);
  const items = forum.readGossip(h.fs).items;
  expect(items.length).toBe(2);
  expect(items[0].told).toEqual(["anna", "dmytro"]);
  expect(items[1]).toMatchObject({ by: "dmytro", from: "anna", spread: items[0].id });
  // two a day: both are told, so a third rumour waits for tomorrow
  expect(forum.pickGossip({ ...again, items }, "dmytro", later + 1000, () => 0.1)).toBeNull();
});

test("gossip about the user's persona never exists: only characters are in the lists the rules read", () => {
  const lists = { anna: [person("boris"), { key: "u:me1", name: "Serhii", seen: 3, toMe: 5, fromMe: 5, feel: -8 }] };
  const rel = relOf(world(lists));
  expect(Object.keys(rel.names).sort()).toEqual(["anna", "boris", "clara", "dmytro"]);
  for (const c of forum.gossipCandidates(rel, "anna", NOW)) expect(c.about.every((x: string) => x in NAMES)).toBe(true);
});

test("pickGossip respects the switch, the daily cap and the zero cap", () => {
  const lists = { anna: [person("boris"), person("clara")], boris: [person("clara", { feel: -6, toMe: 2, fromMe: 1 })] };
  const rel = relOf(world(lists));
  expect(forum.pickGossip(rel, "anna", NOW, () => 0.1)?.kind).toBe("rift");
  expect(forum.pickGossip({ ...rel, gossip: false }, "anna", NOW, () => 0.1)).toBeNull();
  expect(forum.pickGossip({ ...rel, perDay: 0 }, "anna", NOW, () => 0.1)).toBeNull();
  const told = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "g" + i, kind: "close", about: ["x", "y"], tone: "plain", truth: 1, by: "dmytro", at: NOW - 1000, topic: "t", told: ["dmytro"] }));
  expect(forum.pickGossip({ ...rel, items: told(2) }, "anna", NOW, () => 0.1)).toBeNull();
  expect(forum.pickGossip({ ...rel, items: told(1) }, "anna", NOW, () => 0.1)).not.toBeNull();
});

test("someone talked about the character: its prompt says so and its answer is likelier", () => {
  const lists = { anna: [person("boris"), person("clara")], boris: [person("clara", { feel: -6, toMe: 2, fromMe: 1 })] };
  const h = world(lists);
  const said = topic("tG", [post("g1", "dmytro", NOW - 2000, "I think Anna and Boris have been at odds lately.")]);
  const rel = { ...relOf(h, [said]), items: [{ id: "g-1", kind: "rift", about: ["anna", "boris"], tone: "sharp", truth: 0.7, by: "dmytro", at: NOW - 2000, topic: "tG", told: ["dmytro"] }] };
  const line = forum.aboutMeLine(rel, "anna", said, NOW);
  expect(line).toContain("Dmytro said in this topic that you and Boris have been at odds lately");
  expect(line).toContain("worse than it is");
  expect(line).toContain("set it straight or take offence");
  // not about her, or she has answered since
  expect(forum.aboutMeLine(rel, "clara", said, NOW)).toBe("");
  const answered = topic("tG", [...said.posts, post("g2", "anna", NOW - 1000, "That is not true.")]);
  expect(forum.aboutMeLine(rel, "anna", answered, NOW)).toBe("");
  // sweet reads in the second person both ways
  const sweet = { ...rel, items: [{ ...rel.items[0], kind: "sweet", about: ["anna", "boris"] }] };
  expect(forum.aboutMeLine(sweet, "anna", said, NOW)).toContain("you are sweet on Boris");
  expect(forum.aboutMeLine(sweet, "boris", said, NOW)).toContain("Anna is sweet on you");
  // her answer to that topic weighs about twice as much
  const anna = forum.loadProfiles(h.fs).find((p: any) => p.id === "anna");
  const other = topic("tO", [post("o1", "clara", NOW - 1000, "something")]);
  const c = { profiles: [anna], topics: [said, other], boards, settings: { writers: "equal", postsPerAuthor: 99, newTopicShare: 0 }, log: { day: "", byAuthor: {}, lastAuthor: "", total: 0 }, now: NOW, tz: 0, mode: "force", feels: {} };
  const rand = lcg(3);
  const hits: Record<string, number> = { tG: 0, tO: 0 };
  for (let i = 0; i < 600; i++) {
    const plan = forum.planAction({ ...c, rel }, rand);
    if (plan && plan.kind === "reply") hits[plan.topic.id]++;
  }
  expect(hits.tG).toBeGreaterThan(hits.tO * 1.5);
});
