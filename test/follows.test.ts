// Follows (#368, item 4): a one-way "A follows X" mark. It changes only whose posts a character notices first (the forum's draw), never a
// prompt. The Life plugin derives `fol` in `settle`; the forum reads it; the map draws an arrowhead; "Replies" tells who followed a persona.
import { expect, test } from "bun:test";
import path from "node:path";
import { arrowPath, edgesOf, followersOf, followsOf, type GLink, type GNode } from "@/screens/profiles/map-model";
import { followByRule } from "@/screens/profiles/people-api";
import { dictionary } from "@/i18n/index";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const NAMES: Record<string, string> = { anna: "Anna", boris: "Boris", clara: "Clara" };

function makeHost() {
  const files = new Map<string, string>();
  const host: any = {
    files,
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => void files.delete(p),
      list: (d: string) => {
        const o = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
        if (!o.length) throw new Error("ENOENT");
        return o.sort();
      },
    },
    llm: { results: {}, request: () => {} },
    net: { results: {}, request: () => {} },
  };
  return host;
}
const put = (h: any, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: any, p: string) => JSON.parse(h.files.get(p)!);
const prof = (id: string, extra: object = {}) => ({ id, name: NAMES[id], hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true }, ...extra });
const entry = (key: string, extra: object = {}) => ({ key, name: key.slice(2), seen: 3, toMe: 1, fromMe: 1, said: [], note: "", feel: 0, ...extra });
// the plugin stores `fol` next to the level it settled; a hand-made entry gets what `settle` would have stored
const list = (h: any, id: string, people: any[]) => put(h, `life/people/${id}.json`, { scanned: 0, noteDay: "", failedAt: 0, people: people.map((p) => ({ fol: p.fol ?? life.followNow({ follow: "", ...p }), ...p })) });
const boards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "General", desc: "" }] }] };
const lcg = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function world() {
  const h = makeHost();
  for (const id of Object.keys(NAMES)) put(h, `profiles/${id}.json`, prof(id, { adult: true }));
  put(h, "forum/boards.json", { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "General", desc: "" }] }] });
  put(h, "settings.json", { tzOffset: 0 });
  put(h, "you.json", { active: "p1", personas: [{ id: "p1", name: "Yaroslav", about: "", hue: 10 }, { id: "p2", name: "Olha", about: "", hue: 20 }] });
  return h;
}
const call = (h: any, method: string, path: string, body?: object) => life.handleRoute({ method, path, body }, h);

// ---------- the rule: `settle` derives `fol` ----------

/** A person as the plugin reads it (a legacy list with the level already settled), so a later `settle` can see a change. */
const personOf = (extra: object) => {
  const files = new Map([["life/people/anna.json", JSON.stringify({ people: [entry("c:boris", { lvl: "acquaintance", auto: 2, ...extra })] })]]);
  return life.readPeople({ read: (p: string) => files.get(p)!, write: () => {}, remove: () => {}, list: () => [] } as any, "anna").people[0];
};

test("settle: follows from pen friend up, not below, and not while the feeling is cold", () => {
  const at = (toMe: number, fromMe: number, feel: number, extra: object = {}) => {
    const p = personOf({ toMe, fromMe, feel, ...extra });
    life.settle(p, NOW);
    return p;
  };
  expect(at(2, 0, 5, { auto: 1, lvl: "slight" }).lvl).toBe("slight"); // too few meetings: not even acquaintance
  expect(at(3, 0, 5)).toMatchObject({ lvl: "acquaintance", fol: false });
  expect(at(4, 4, 3)).toMatchObject({ lvl: "penfriend", fol: true }); // 8 talks and warm
  expect(at(4, 4, 2.9)).toMatchObject({ lvl: "acquaintance", fol: false });
  expect(at(10, 10, 5)).toMatchObject({ lvl: "friend", fol: true });
  // a cold feeling drops a level that was reached (a quarrel caps it at acquaintance): the automatic follow goes with it
  const quarrel = at(10, 10, -4, { auto: 4, lvl: "friend", fol: true });
  expect(quarrel).toMatchObject({ lvl: "acquaintance", fol: false });
  // a level set by hand and pinned stays friend, but a cold feeling alone still ends the automatic follow
  expect(at(0, 0, -3, { tier: "friend", pinned: true })).toMatchObject({ lvl: "friend", fol: false });
  expect(at(0, 0, -2.9, { tier: "friend", pinned: true })).toMatchObject({ lvl: "friend", fol: true });
  expect(followByRule("friend", -3)).toBe(false);
  expect(followByRule("penfriend", 0)).toBe(true);
  expect(followByRule("acquaintance", 9)).toBe(false);
});

test("settle: the user's yes or no wins over the rule", () => {
  const yes = personOf({ follow: "yes", toMe: 0, fromMe: 0, feel: -9 });
  life.settle(yes, NOW);
  expect(yes.fol).toBe(true);
  const no = personOf({ follow: "no", toMe: 10, fromMe: 10, feel: 6 });
  life.settle(no, NOW);
  expect(no).toMatchObject({ lvl: "friend", fol: false });
  // anything else in the file reads as "the rule decides"
  expect(personOf({ follow: "maybe" }).follow).toBe("");
});

test("a follow that starts by the rule leaves a milestone; one set by hand, one that was already there, and a first reading leave none", () => {
  const p = personOf({ toMe: 4, fromMe: 3, feel: 4 });
  expect(p.fol).toBe(false);
  life.settle(p, NOW); // 7 talks: still acquaintance
  expect(p.marks.some((m: any) => m.k === "follow")).toBe(false);
  p.fromMe = 4;
  life.settle(p, NOW + 1000);
  expect(p).toMatchObject({ lvl: "penfriend", fol: true });
  expect(p.marks.find((m: any) => m.k === "follow")).toMatchObject({ at: NOW + 1000, v: "follows" });
  // settled again: no second mark
  life.settle(p, NOW + 2000);
  expect(p.marks.filter((m: any) => m.k === "follow").length).toBe(1);
  // by hand: no mark
  const h = personOf({ toMe: 1, fromMe: 0, feel: 4 });
  h.follow = "yes";
  life.settle(h, NOW);
  expect(h.fol).toBe(true);
  expect(h.marks.some((m: any) => m.k === "follow")).toBe(false);
  // a person with no `lvl` yet (a list from before levels): worked out once, no mark
  const files = new Map([["life/people/anna.json", JSON.stringify({ people: [entry("c:boris", { toMe: 9, fromMe: 9, feel: 5 })] })]]);
  const old = life.readPeople({ read: (f: string) => files.get(f)!, write: () => {}, remove: () => {}, list: () => [] } as any, "anna").people[0];
  expect(old).toMatchObject({ lvl: "friend", fol: true, marks: [] });
});

test("a list written before follows existed gets `fol` from its level, with no milestone", () => {
  const files = new Map([["life/people/anna.json", JSON.stringify({ people: [entry("c:boris", { lvl: "friend", auto: 4 }), entry("c:clara", { lvl: "acquaintance", auto: 2 })] })]]);
  const pf = life.readPeople({ read: (f: string) => files.get(f)!, write: () => {}, remove: () => {}, list: () => [] } as any, "anna");
  expect(pf.people.map((p: any) => [p.fol, p.follow, p.marks.length])).toEqual([[true, "", 0], [false, "", 0]]);
});

// ---------- setting it by hand ----------

test("PUT with only a follow is valid; a bad value is 'nothing to set'; the other side is not touched", () => {
  const h = world();
  list(h, "anna", [entry("c:boris", { lvl: "acquaintance", auto: 2 })]);
  list(h, "boris", [entry("c:anna", { lvl: "friend", auto: 4 })]);
  let r = call(h, "PUT", "/life/people/anna/c:boris", { follow: "yes" });
  expect(r.status).toBe(200);
  const boris = r.json.people.find((p: any) => p.key === "c:boris");
  expect(boris).toMatchObject({ follow: "yes", fol: true });
  expect(boris.level.id).toBe("acquaintance"); // a follow does not move the level
  expect(boris.marks.some((m: any) => m.k === "follow")).toBe(false);
  // not mirrored: Boris's own list is as it was
  expect(get(h, "life/people/boris.json").people[0].follow ?? "").toBe("");
  r = call(h, "PUT", "/life/people/anna/c:boris", { follow: "no" });
  expect(r.json.people.find((p: any) => p.key === "c:boris")).toMatchObject({ follow: "no", fol: false });
  r = call(h, "PUT", "/life/people/anna/c:boris", { follow: "" });
  expect(r.json.people.find((p: any) => p.key === "c:boris")).toMatchObject({ follow: "", fol: false });
  // setRelation itself: a body with nothing valid in it
  expect(life.setRelation(h.fs, "anna", "c:boris", { follow: "maybe" }, NOW)).toMatchObject({ status: 400, error: "nothing to set" });
  expect(life.setRelation(h.fs, "anna", "c:boris", { follow: "yes" }, NOW)).toEqual({ ok: true });
});

test("a level set by hand that makes a follow by the rule leaves no milestone (the user did it)", () => {
  const h = world();
  list(h, "anna", [entry("c:boris", { lvl: "acquaintance", auto: 2 })]);
  const r = call(h, "PUT", "/life/people/anna/c:boris", { level: "friend" });
  const boris = r.json.people.find((p: any) => p.key === "c:boris");
  expect(boris).toMatchObject({ fol: true, follow: "" });
  expect(boris.marks.some((m: any) => m.k === "follow")).toBe(false);
});

test("a follow set for someone not yet in the list adds them; 'back to automatic' removes them again; forgetting keeps a hand follow", () => {
  const h = world();
  list(h, "anna", []);
  let r = call(h, "PUT", "/life/people/anna/u:p1", { follow: "yes" });
  expect(r.json.people.map((p: any) => [p.key, p.follow, p.fol])).toEqual([["u:p1", "yes", true]]);
  // forgetting everyone keeps what the user set by hand (like a level)
  r = call(h, "DELETE", "/life/people/anna", undefined);
  expect(r.json.people.map((p: any) => [p.key, p.follow, p.fol])).toEqual([["u:p1", "yes", true]]);
  r = call(h, "PUT", "/life/people/anna/u:p1", { follow: "" });
  expect(r.json.people).toEqual([]);
});

// ---------- the map's data ----------

test("graph: a link says whether the character follows, nothing else about it is new", () => {
  const h = world();
  list(h, "anna", [entry("c:boris", { lvl: "friend", auto: 4, feel: 4 }), entry("u:p1", { lvl: "slight", auto: 1 }), entry("c:clara", { lvl: "friend", auto: 4, follow: "no" })]);
  const g = call(h, "GET", "/life/graph").json;
  const flag = (to: string) => g.links.find((l: any) => l.from === "c:anna" && l.to === to).follow;
  expect(flag("c:boris")).toBe(true);
  expect(flag("u:p1")).toBe(false);
  expect(flag("c:clara")).toBe(false);
  // a follow of a persona that was set by hand and has no meetings is still a link
  list(h, "boris", [entry("u:p2", { seen: 0, toMe: 0, fromMe: 0, follow: "yes" })]);
  expect(call(h, "GET", "/life/graph").json.links.find((l: any) => l.from === "c:boris" && l.to === "u:p2").follow).toBe(true);
});

test("the people list carries both the setting and the result, and no stored bookkeeping", () => {
  const h = world();
  list(h, "anna", [entry("c:boris", { lvl: "friend", auto: 4, follow: "no" })]);
  const v = call(h, "GET", "/life/people/anna").json;
  expect(v.people[0]).toMatchObject({ follow: "no", fol: false });
});

// ---------- the forum: whose posts are noticed first ----------

const post = (id: string, by: string, at: number, text = "my take on tea") => ({ id, by, name: NAMES[by] || "Yaroslav", hue: 100, at, text });
const topicOf = (id: string, posts: any[]) => ({ id, board: "b1", title: id + " title", by: posts[0].by, name: "X", hue: 1, createdAt: posts[0].at, lastAt: posts[posts.length - 1].at, locked: false, unread: false, owe: 0, posts });

function followWorld(follow: Record<string, boolean>) {
  const h = world();
  list(h, "anna", [entry("c:boris", { lvl: "friend", auto: 4, follow: follow.boris ? "yes" : "no" }), entry("c:clara", { lvl: "friend", auto: 4, follow: follow.clara ? "yes" : "no" })]);
  const profiles = forum.loadProfiles(h.fs);
  const rel = forum.relationsOf(h.fs, profiles, [], NOW, { jealousy: false, gossip: false, tzOffset: 0 });
  return { h, profiles, rel, anna: profiles.find((p: any) => p.id === "anna") };
}

test("relationsOf reads who a character follows from `fol`, for characters only", () => {
  const { rel } = followWorld({ boris: true });
  expect(rel.follows).toEqual({ anna: { boris: true } });
  const h = world();
  list(h, "anna", [entry("u:p1", { lvl: "friend", auto: 4 })]);
  expect(forum.relationsOf(h.fs, forum.loadProfiles(h.fs), [], NOW, {}).follows).toEqual({});
});

test("planAction: a followed author's topic is picked clearly more often; unfollowed, equal; the Moderator never counts", () => {
  const { rel, anna } = followWorld({ boris: true });
  const topics = [topicOf("tB", [post("pb", "boris", NOW - 1000)]), topicOf("tC", [post("pc", "clara", NOW - 1000)])];
  const c = { profiles: [anna], topics, boards, settings: { writers: "equal", postsPerAuthor: 99, newTopicShare: 0 }, log: { day: "", byAuthor: {}, lastAuthor: "", total: 0, reacts: {} }, now: NOW, tz: 0, mode: "force", feels: {} };
  const run = (rl: object | null, ts = topics) => {
    const rand = lcg(7);
    const hits: Record<string, number> = {};
    for (let i = 0; i < 800; i++) {
      const plan = forum.planAction({ ...c, topics: ts, rel: rl }, rand);
      if (plan && plan.kind === "reply") hits[plan.topic.id] = (hits[plan.topic.id] || 0) + 1;
    }
    return hits;
  };
  const withFollow = run(rel);
  expect(withFollow.tB / withFollow.tC).toBeGreaterThan(1.35); // expected 1.6
  expect(withFollow.tB / withFollow.tC).toBeLessThan(1.9);
  const plain = run({ ...rel, follows: {} });
  expect(plain.tB / plain.tC).toBeGreaterThan(0.8);
  expect(plain.tB / plain.tC).toBeLessThan(1.25);
  // no rel at all: the old behaviour
  const none = run(null);
  expect(none.tB / none.tC).toBeGreaterThan(0.8);
  expect(none.tB / none.tC).toBeLessThan(1.25);
  // the Moderator's post is never favoured, even if a list said so
  const mod = [topicOf("tM", [{ ...post("pm", "_mod", NOW - 1000), name: "Moderator" }]), topics[1]];
  const m = run({ ...rel, follows: { anna: { _mod: true } } }, mod);
  expect(m.tM / m.tC).toBeGreaterThan(0.8);
  expect(m.tM / m.tC).toBeLessThan(1.25);
});

test("planAction: the follow is not lost under the gossip cap, and a liked author who is also followed weighs the most", () => {
  const { rel, anna } = followWorld({ boris: true });
  const topics = [topicOf("tB", [post("pb", "boris", NOW - 1000)]), topicOf("tC", [post("pc", "clara", NOW - 1000)])];
  const c = { profiles: [anna], topics, boards, settings: { writers: "equal", postsPerAuthor: 99, newTopicShare: 0 }, log: { day: "", byAuthor: {}, lastAuthor: "", total: 0, reacts: {} }, now: NOW, tz: 0, mode: "force" };
  const rand = lcg(3);
  let b = 0;
  let cc = 0;
  // Anna likes Clara a little (feeling 6: weight 1.5) and follows Boris (x1.6): Boris still draws more than Clara (1.6 against 1.5 is close, so compare with a feeling of 3)
  for (let i = 0; i < 800; i++) {
    const plan = forum.planAction({ ...c, feels: { anna: { "c:clara": 3 } }, rel }, rand);
    if (plan && plan.topic.id === "tB") b++;
    else if (plan && plan.topic.id === "tC") cc++;
  }
  expect(b / cc).toBeGreaterThan(1.1); // 1.6 against 1.25
});

test("pickReaction and pickRepost: a followed author's post weighs about twice as much", () => {
  const { rel, profiles, anna } = followWorld({ boris: true });
  void profiles;
  const topics = [topicOf("tB", [post("pb", "boris", NOW - 5 * HOUR, "A good point about tea."), post("f1", "clara", NOW - 4 * HOUR), post("f2", "clara", NOW - 3 * HOUR), post("f3", "clara", NOW - 2 * HOUR)]), topicOf("tC", [post("pc", "clara", NOW - 5 * HOUR, "A good point about tea."), post("g1", "boris", NOW - 4 * HOUR), post("g2", "boris", NOW - 3 * HOUR), post("g3", "boris", NOW - 2 * HOUR)])];
  // reactions look at the last 12 posts of a topic, so the fillers count too: count by the post's author instead
  const react = { profiles: [anna], topics, settings: { reactions: true, reactionsPerDay: 99 }, log: { reacts: {} }, now: NOW, tz: 0, feels: {} };
  const byAuthor = (pick: (r: object | null, rand: () => number) => any, rl: object | null) => {
    const rand = lcg(5);
    const n: Record<string, number> = {};
    for (let i = 0; i < 1500; i++) {
      const hit = pick(rl, rand);
      if (hit) n[hit.post.by] = (n[hit.post.by] || 0) + 1;
    }
    return n;
  };
  // reactions: Boris wrote 4 posts (pb, g1..g3), Clara wrote 4 (f1..f3, pc): equal in number, so any lean is the follow
  const r1 = byAuthor((rl, rand) => forum.pickReaction({ ...react, rel: rl }, rand), rel);
  expect(r1.boris / r1.clara).toBeGreaterThan(1.7);
  expect(r1.boris / r1.clara).toBeLessThan(2.3);
  const r0 = byAuthor((rl, rand) => forum.pickReaction({ ...react, rel: rl }, rand), { ...rel, follows: {} });
  expect(r0.boris / r0.clara).toBeGreaterThan(0.85);
  expect(r0.boris / r0.clara).toBeLessThan(1.18);
  // reposts: only the older posts qualify (not the last three of a topic), and the character must like them
  const likes = { ...rel, lvl: { anna: { boris: "friend", clara: "friend" } } };
  const repost = { profiles: [anna], topics, settings: { reposts: true, repostsPerDay: 99 }, now: NOW, tz: 0, feels: {} };
  const p1 = byAuthor((rl, rand) => forum.pickRepost({ ...repost, rel: rl }, rand), likes);
  expect(p1.boris / p1.clara).toBeGreaterThan(1.7);
  expect(p1.boris / p1.clara).toBeLessThan(2.3);
  const p0 = byAuthor((rl, rand) => forum.pickRepost({ ...repost, rel: rl }, rand), { ...likes, follows: {} });
  expect(p0.boris / p0.clara).toBeGreaterThan(0.85);
  expect(p0.boris / p0.clara).toBeLessThan(1.18);
});

// ---------- Replies: who followed a persona ----------

const followMark = (at: number) => ({ at, k: "follow", v: "follows", up: true });

test("notices: a character that started following a persona by the rule is a row, newest first among the others, new until seen", () => {
  const h = world();
  const mine = { id: "u1", by: "me", name: "Yaroslav", hue: 10, at: NOW - 2 * HOUR, text: "Who likes tea?", persona: "p1" };
  put(h, "forum/topics/t1.json", { id: "t1", board: "b1", title: "Tea", by: "me", name: "Yaroslav", hue: 10, createdAt: NOW - 2 * HOUR, lastAt: NOW - 2 * HOUR, locked: false, unread: false, owe: 0, posts: [mine] });
  list(h, "anna", [entry("u:p1", { lvl: "penfriend", auto: 3, marks: [followMark(NOW - 90 * 60000)] })]);
  list(h, "boris", [entry("u:p2", { lvl: "friend", auto: 4, marks: [followMark(NOW - 3 * HOUR)] }), entry("c:anna", { lvl: "friend", auto: 4, marks: [followMark(NOW - HOUR)] })]);
  // a reply from Clara at NOW - 1 hour sits between the two follows
  forum.fileResult(h.fs, { kind: "reply", author: "clara", topic: "t1", quote: "u1" }, { text: "I do, with lemon." }, NOW - HOUR, forum.readBoards(h.fs));
  const real = Date.now;
  Date.now = () => NOW;
  try {
    const out = forum.handleRoute({ path: "/forum/notices", method: "GET" }, h).json;
    // the mark on a `c:` key is not a notice (it is a character following a character)
    expect(out.items.map((i: any) => [i.kind, i.name, i.persona ?? null])).toEqual([
      ["reply", "Clara", null],
      ["follow", "Anna", "Yaroslav"],
      ["follow", "Boris", "Olha"],
    ]);
    expect(out.items.every((i: any) => i.new)).toBe(true);
    expect(out.items[1]).toMatchObject({ topic: "", post: "", picture: "" });
    expect(out.unread).toBe(3);
    expect(forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json.notices).toBe(3);
    forum.handleRoute({ path: "/forum/notices-read", method: "POST" }, h);
    Date.now = () => NOW + 1000;
    const seen = forum.handleRoute({ path: "/forum/notices", method: "GET" }, h).json;
    expect(seen.unread).toBe(0);
    expect(seen.items.length).toBe(3);
    expect(forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json.notices).toBe(0);
    // a follow that came after the list was read is new again
    const l = get(h, "life/people/anna.json");
    l.people[0].marks.push(followMark(NOW + 5000));
    put(h, "life/people/anna.json", l);
    Date.now = () => NOW + 10000;
    expect(forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json.notices).toBe(1);
  } finally {
    Date.now = real;
  }
});

test("notices: no row when the character no longer follows, when the persona is gone, when the mark is old, or when nothing marked it; the list stays at 30", () => {
  const h = world();
  list(h, "anna", [entry("u:p1", { lvl: "acquaintance", auto: 2, fol: false, marks: [followMark(NOW - HOUR)] }), entry("u:p2", { lvl: "friend", auto: 4, marks: [followMark(NOW - 20 * DAY)] })]);
  list(h, "boris", [entry("u:gone", { lvl: "friend", auto: 4, marks: [followMark(NOW - HOUR)] }), entry("u:p1", { lvl: "friend", auto: 4, follow: "yes" })]);
  expect(forum.followNotices(h.fs, NOW)).toEqual([]);
  // thirty-odd rows: only the newest 30 are listed
  const many = world();
  const marks = Array.from({ length: 8 }, (_, i) => followMark(NOW - (i + 1) * 1000));
  for (const id of ["anna", "boris", "clara"]) list(many, id, [entry("u:p1", { lvl: "friend", auto: 4, marks }), entry("u:p2", { lvl: "friend", auto: 4, marks })]);
  const real = Date.now;
  Date.now = () => NOW;
  try {
    const out = forum.handleRoute({ path: "/forum/notices", method: "GET" }, many).json;
    expect(out.items.length).toBe(30);
    expect(out.items.map((i: any) => i.at)).toEqual([...out.items.map((i: any) => i.at)].sort((a, b) => b - a));
  } finally {
    Date.now = real;
  }
});

test("the chronicle ignores a follow milestone", () => {
  const h = world();
  list(h, "anna", [entry("c:boris", { lvl: "friend", auto: 4, marks: [followMark(NOW - HOUR)] })]);
  const f = forum.chronicleFacts(h.fs, forum.loadProfiles(h.fs), [], NOW, 0, NOW - DAY);
  expect(f.strong).toBe(0);
});

// ---------- the map ----------

const nodes: GNode[] = [
  { key: "c:a", name: "A", kind: "character" },
  { key: "c:b", name: "B", kind: "character" },
  { key: "u:p", name: "P", kind: "user" },
];
const link = (from: string, to: string, follow?: boolean): GLink => ({ from, to, level: "friend", band: "", talks: 3, ties: [], ...(follow === undefined ? {} : { follow }) });

test("map model: an edge says who follows whom; a mutual follow has both ends; counts come from the links", () => {
  const links = [link("c:a", "c:b", true), link("c:b", "c:a", true), link("c:a", "u:p", true), link("c:b", "u:p", false)];
  const edges = edgesOf({ nodes, links });
  const ab = edges.find((e) => e.a === "c:a" && e.b === "c:b")!;
  expect([ab.fa, ab.fb]).toEqual([true, true]);
  const ap = edges.find((e) => e.a === "c:a" && e.b === "u:p")!;
  expect([ap.fa, ap.fb]).toEqual([true, false]); // a follows the persona, the persona follows nobody
  const bp = edges.find((e) => e.a === "c:b" && e.b === "u:p")!;
  expect([bp.fa, bp.fb]).toEqual([false, false]);
  // a link with no `follow` at all (an older answer) is no follow
  expect(edgesOf({ nodes, links: [link("c:a", "c:b")] })[0]).toMatchObject({ fa: false, fb: false });
  expect(followersOf("u:p", links)).toBe(1);
  expect(followersOf("c:a", links)).toBe(1);
  expect(followsOf("c:a", links)).toEqual({ follows: ["c:b", "u:p"], followedBy: ["c:b"] });
});

test("map model: the arrowhead stands before the followed person and points at them", () => {
  const d = arrowPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 30, 9, 6);
  // the tip is 30 before the target, the base 9 further back, 6 to each side
  expect(d).toBe("M70 0L61 6L61 -6Z");
  expect(arrowPath({ x: 0, y: 0 }, { x: 0, y: 100 }, 30, 9, 6)).toBe("M0 70L-6 61L6 61Z");
  expect(arrowPath({ x: 0, y: 0 }, { x: 20, y: 0 }, 30)).toBe(""); // too close to draw
});

// ---------- strings ----------

test("the follow strings exist in both languages and no Ukrainian label starts with a lone 'З'", () => {
  const keys = Object.keys(dictionary.en).filter((k) => /follow/i.test(k));
  expect(keys.length).toBeGreaterThanOrEqual(14);
  for (const k of keys) {
    expect((dictionary.uk as Record<string, string>)[k]).toBeTruthy();
    expect(/^З(\s|$)/.test((dictionary.uk as Record<string, string>)[k])).toBe(false);
  }
});

test("mergeEvents: meetings that take a person to pen friend make the character follow, with a milestone dated at the meeting", () => {
  const pf = life.emptyPeople();
  const ev = (at: number) => ({ key: "u:p1", name: "Yaroslav", at, where: "messenger", seen: 1, toMe: 1, fromMe: 0, said: "", tone: 1 });
  life.mergeEvents(pf, [ev(NOW)]); // a new person: first reading, nothing marked
  expect(pf.people[0]).toMatchObject({ fol: false, marks: [] });
  life.mergeEvents(pf, Array.from({ length: 5 }, (_, i) => ev(NOW + (i + 1) * 1000))); // 6 talks: acquaintance
  expect(pf.people[0].fol).toBe(false);
  life.mergeEvents(pf, Array.from({ length: 3 }, (_, i) => ev(NOW + (i + 10) * 1000))); // 9 talks and a warm feeling: pen friend
  expect(pf.people[0]).toMatchObject({ lvl: "penfriend", fol: true });
  expect(pf.people[0].marks.filter((m: any) => m.k === "follow")).toEqual([{ at: NOW + 12000, k: "follow", v: "follows", up: true }]);
});
