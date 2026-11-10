// Polls and reposts (#367): the Moderator's or the user's poll that characters vote in by rules, and a character passing on a post it likes.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const NAMES: Record<string, string> = { anna: "Anna", boris: "Boris", clara: "Clara" };

function makeHost() {
  const files = new Map<string, string>();
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
        const o = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
        if (!o.length) throw new Error("ENOENT");
        return o.sort();
      },
    },
  } as any;
}
const put = (h: any, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: any, p: string) => JSON.parse(h.files.get(p)!);
const prof = (id: string, extra: object = {}) => ({ id, name: NAMES[id], hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true }, ...extra });
const boards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "Off-topic", desc: "" }] }] };
const post = (id: string, by: string, at: number, text = "hello there", extra: object = {}) => ({ id, by, name: NAMES[by] || "Yaroslav", hue: 100, at, text, ...extra });
const topicOf = (id: string, posts: any[], extra: object = {}) => ({ id, board: "b1", title: id + " title", by: posts[0].by, name: "X", hue: 1, createdAt: posts[0].at, lastAt: posts[posts.length - 1].at, locked: false, unread: false, owe: 0, posts, ...extra });
const opts = (...texts: string[]) => texts.map((text, i) => ({ id: "o" + (i + 1), text, votes: [] as string[] }));

function world() {
  const h = makeHost();
  for (const id of Object.keys(NAMES)) put(h, `profiles/${id}.json`, prof(id));
  put(h, "forum/boards.json", boards);
  put(h, "settings.json", { tzOffset: 0 });
  return h;
}
const route = (h: any, path: string, body: object, method = "POST") => forum.handleRoute({ path, method, body }, h);

// ---------- polls ----------

test("newPoll and cleanPoll: two to four distinct options, one vote per voter, nothing else", () => {
  expect(forum.newPoll(["Tea", "Coffee"]).options.map((o: any) => o.id)).toEqual(["o1", "o2"]);
  expect(forum.newPoll(["Tea", "tea!", "Tea"])).toBeNull();
  expect(forum.newPoll(["Tea"])).toBeNull();
  expect(forum.newPoll(["a", "b", "c", "d", "e"]).options.length).toBe(4);
  expect(forum.newPoll("nope")).toBeNull();
  const c = forum.cleanPoll({ options: [{ id: "o1", text: "Tea", votes: ["anna", "me", "anna"] }, { id: "o2", text: "Coffee", votes: ["anna", "boris", "bad id!"] }, { id: "x9", text: "bad" }, { id: "o3", text: "" }] });
  expect(c.options.length).toBe(2);
  expect(c.options[0].votes).toEqual(["anna", "me"]);
  expect(c.options[1].votes).toEqual(["boris"]);
  expect(forum.cleanPoll({ options: [{ id: "o1", text: "one" }] })).toBeNull();
});

test("pollVote: a vote is cast, moved to another option, withdrawn by the same one, and an unknown option is refused", () => {
  let p = forum.newPoll(["Tea", "Coffee"]);
  p = forum.pollVote(p, "me", "o1");
  expect(p.options[0].votes).toEqual(["me"]);
  p = forum.pollVote(p, "me", "o2");
  expect(p.options[0].votes).toEqual([]);
  expect(p.options[1].votes).toEqual(["me"]);
  p = forum.pollVote(p, "me", "o2");
  expect(forum.pollTotal(p)).toBe(0);
  expect(forum.pollVote(p, "me", "o7")).toBeNull();
});

test("the user votes through the route; a closed poll refuses; the topic carries the counts and names", () => {
  const h = world();
  put(h, "topics.tmp", 1);
  put(h, "forum/topics/pt.json", topicOf("pt", [post("p1", "anna", NOW - HOUR, "Which one?")], { poll: { options: [{ id: "o1", text: "Tea", votes: ["anna"] }, { id: "o2", text: "Coffee", votes: [] }] } }));
  const r = route(h, "/forum/vote", { topic: "pt", option: "o2" }).json;
  expect(r.ok).toBe(true);
  expect(r.poll.options[1]).toMatchObject({ n: 1, mine: true });
  expect(r.poll.options[0]).toMatchObject({ n: 1, mine: false, who: ["Anna"] });
  const view = forum.handleRoute({ path: "/forum/topic", method: "GET", query: { id: "pt" } }, h).json;
  expect(view.topic.poll.total).toBe(2);
  expect(view.topic.poll.closed).toBe(false);
  expect(route(h, "/forum/vote", { topic: "pt", option: "o9" }).status).toBe(400);
  expect(route(h, "/forum/vote", { topic: "nope", option: "o1" }).status).toBe(404);
  put(h, "forum/topics/pt.json", { ...get(h, "forum/topics/pt.json"), locked: true });
  expect(route(h, "/forum/vote", { topic: "pt", option: "o1" }).status).toBe(409);
  expect(forum.handleRoute({ path: "/forum/topic", method: "GET", query: { id: "pt" } }, h).json.topic.poll.closed).toBe(true);
});

test("the user opens a poll with a new topic; one option or a repeat is refused", () => {
  const h = world();
  const ok = route(h, "/forum/topic", { board: "b1", title: "Tea or coffee", text: "Pick one.", poll: ["Tea", "Coffee", ""] }).json;
  expect(ok.ok).toBe(true);
  expect(get(h, `forum/topics/${ok.topic}.json`).poll.options.map((o: any) => o.text)).toEqual(["Tea", "Coffee"]);
  const bad = route(h, "/forum/topic", { board: "b1", title: "Tea only", text: "x", poll: ["Tea", "tea"] });
  expect(bad.status).toBe(400);
  // no options typed at all: a plain topic
  const plain = route(h, "/forum/topic", { board: "b1", title: "Plain one", text: "x", poll: ["", ""] }).json;
  expect(get(h, `forum/topics/${plain.topic}.json`).poll).toBeUndefined();
});

test("a poll event from the Moderator needs two options; the system prompt asks for them", () => {
  const h = world();
  put(h, "forum/events.json", { last: 0, kind: "", lastComment: 0, lastClose: 0, pendingAt: NOW, failedAt: 0 });
  expect(forum.eventSystem({ line: "x" }, "poll")).toContain('"options"');
  expect(forum.eventSystem({ line: "x" })).not.toContain('"options"');
  expect(forum.EVENT_KINDS).toContain("poll");
  const bad = forum.fileEventResult(h.fs, { text: '{"title": "Who hosts?", "text": "Vote!", "options": ["Only one"]}' }, boards, NOW, () => 0, "poll");
  expect(bad.error).toContain("two options");
  const good = forum.fileEventResult(h.fs, { text: '{"title": "Who hosts?", "text": "Vote!", "options": ["Anna", "Boris", "Clara"]}' }, boards, NOW + 1, () => 0, "poll");
  const t = get(h, `forum/topics/${good.topicId}.json`);
  expect(t.event.kind).toBe("poll");
  expect(t.poll.options.map((o: any) => o.text)).toEqual(["Anna", "Boris", "Clara"]);
});

test("pollWeights: interests count, a liked member named in an option counts, a cold or rival one almost never", () => {
  const profiles = [prof("anna", { interests: ["gardening"] }), prof("boris"), prof("clara")];
  const poll = { options: opts("Gardening day", "Hosted by Boris", "Hosted by Clara") };
  const rel = { feel: { anna: { boris: 6, clara: -5 } }, lvl: { anna: { boris: "friend" } }, ties: {}, level: "warm", adult: {}, near: {}, jealousy: true };
  const w = Object.fromEntries(forum.pollWeights(profiles[0], poll, profiles, rel).map((x: any) => [x.id, x.w]));
  expect(w.o1).toBe(3); // an interest
  expect(w.o2).toBe(4.5); // a liked friend: 1 + 2 + 1.5
  expect(w.o3).toBeCloseTo(0.2); // cold to Clara
  const rival = { ...rel, feel: {}, lvl: {}, ties: { anna: { clara: ["rival"] } } };
  expect(forum.pollWeights(profiles[0], poll, profiles, rival).find((x: any) => x.id === "o3").w).toBeCloseTo(0.2);
  // with no relations at all: everything starts level, self counts a little
  expect(forum.pollWeights(profiles[1], { options: opts("Boris is right", "No") }, profiles, null).map((x: any) => x.w)).toEqual([2, 1]);
});

test("pickVote: open polls only, once per character, the invited first; a vote lands where the weights lead", () => {
  const profiles = [prof("anna"), prof("boris")];
  const open = topicOf("t1", [post("p1", "boris", NOW - HOUR)], { poll: { options: [{ id: "o1", text: "Tea", votes: ["anna"] }, { id: "o2", text: "Coffee", votes: [] }] } });
  const pick = forum.pickVote({ profiles, topics: [open], now: NOW, tz: 0, rel: null }, () => 0);
  expect(pick.author.id).toBe("boris");
  expect(["o1", "o2"]).toContain(pick.option);
  expect(forum.pickVote({ profiles, topics: [{ ...open, locked: true }], now: NOW, tz: 0, rel: null }, () => 0)).toBeNull();
  expect(forum.pickVote({ profiles, topics: [{ ...open, createdAt: NOW - 4 * DAY }], now: NOW, tz: 0, rel: null }, () => 0)).toBeNull();
  const voted = topicOf("t2", [post("p1", "boris", NOW - HOUR)], { poll: { options: [{ id: "o1", text: "Tea", votes: ["anna", "boris"] }, { id: "o2", text: "Coffee", votes: [] }] } });
  expect(forum.pickVote({ profiles, topics: [voted], now: NOW, tz: 0, rel: null }, () => 0)).toBeNull();
});

test("the result line names the votes, and the chronicle tells a poll that ended", () => {
  const t = topicOf("pt", [post("p1", "anna", NOW - 2 * HOUR)], { title: "Who hosts?", locked: true, lastAt: NOW - HOUR, by: "_mod", event: { kind: "poll", at: NOW - 3 * DAY, invited: ["anna"] }, poll: { options: [{ id: "o1", text: "Anna", votes: ["boris", "clara"] }, { id: "o2", text: "Boris", votes: ["anna"] }] } });
  expect(forum.pollResultLine(t)).toBe('Poll "Who hosts?" results: "Anna" 2, "Boris" 1.');
  expect(forum.pollResultLine({ ...t, poll: forum.newPoll(["a", "b"]) })).toContain("nobody voted");
  const h = world();
  const f = forum.chronicleFacts(h.fs, forum.loadProfiles(h.fs), [t], NOW, 0, NOW - DAY);
  expect(f.facts.some((x: string) => x.includes("ended with") && x.includes('"Anna" 2'))).toBe(true);
});

// ---------- reposts ----------

const likes = { anna: { "c:boris": 6 } };
const settings = { reposts: true, repostsPerDay: 2 };
const topic3 = (extra: object = {}) => topicOf("t1", [post("p1", "boris", NOW - 5 * HOUR, "A good point about tea."), post("p2", "clara", NOW - 4 * HOUR), post("p3", "clara", NOW - 3 * HOUR), post("p4", "clara", NOW - 2 * HOUR), post("p5", "clara", NOW - HOUR)], extra);

test("pickRepost: a post of someone the character likes, old enough, not among the last three, not its own; cold or jealous never", () => {
  const profiles = [prof("anna"), prof("boris"), prof("clara")];
  const go = (over: object = {}) => forum.pickRepost({ profiles: [profiles[0]], topics: [topic3()], settings, now: NOW, tz: 0, feels: likes, rel: null, ...over }, () => 0);
  const hit = go();
  expect(hit.author.id).toBe("anna");
  expect(hit.post.id).toBe("p1");
  expect(go({ feels: { anna: { "c:boris": 1 } } })).toBeNull(); // not liked enough
  expect(go({ feels: { anna: { "c:clara": 6 } } }).post.id).toBe("p2"); // Clara's p3 to p5 are among the last three posts, p2 is not
  expect(go({ settings: { ...settings, reposts: false } })).toBeNull();
  expect(go({ settings: { ...settings, repostsPerDay: 0 } })).toBeNull();
  expect(go({ topics: [topicOf("t1", topic3().posts.map((p: any) => ({ ...p, at: p.at + 5 * HOUR - 30000 })))] })).toBeNull(); // too fresh
  const rel = { jealousy: true, ties: { anna: { boris: ["rival"] } }, lvl: {}, feel: {}, adult: {}, near: {}, items: [], level: "warm" };
  expect(go({ rel })).toBeNull();
  // a post that was already passed on is not passed on again
  const again = topic3();
  again.posts.push(post("r1", "anna", NOW - 30 * 60000, "↻ Reposted Boris", { repost: true, quote: { by: "boris", name: "Boris", text: "A good point about tea." } }));
  expect(go({ topics: [again] })).toBeNull();
  // the day's cap counts what is stored
  const capped = topic3();
  capped.posts.push(post("r2", "clara", NOW - HOUR / 2, "↻ Reposted", { repost: true, quote: { by: "boris", name: "Boris", text: "x" } }), post("r3", "clara", NOW - HOUR / 3, "↻ Reposted", { repost: true, quote: { by: "boris", name: "Boris", text: "y" } }));
  expect(forum.repostsToday([capped], NOW, 0)).toBe(2);
  expect(go({ topics: [capped] })).toBeNull();
});

test("repostTick writes a quoted post with the flag, tells the user when their post is passed on, and marks a rumour as passed on", () => {
  const h = world();
  const mine = topicOf("mt", [post("u1", "me", NOW - 5 * HOUR, "My own idea about tea."), post("p2", "clara", NOW - 4 * HOUR), post("p3", "clara", NOW - 3 * HOUR), post("p4", "clara", NOW - 2 * HOUR), post("p5", "clara", NOW - HOUR)]);
  put(h, "forum/topics/mt.json", mine);
  put(h, "profiles/boris.json", prof("boris", { forum: { frequency: 50, repliesYou: true, repliesOthers: false, opensOwn: true, favourites: [] } }));
  put(h, "profiles/clara.json", prof("clara", { forum: { frequency: 50, repliesYou: true, repliesOthers: false, opensOwn: true, favourites: [] } }));
  // Anna is fond of the user's persona (the people list says so), so she passes the post on
  put(h, "life/people/anna.json", { scanned: 0, noteDay: "", failedAt: 0, people: [{ key: "n:yaroslav", name: "Yaroslav", seen: 3, toMe: 2, fromMe: 2, said: [], note: "", feel: 6 }] });
  const s = { ...forum.readSettings(h.fs), autonomous: true, reposts: true, repostsPerDay: 2, quietFrom: "00:00", quietTo: "00:00" };
  expect(forum.repostTick(h.fs, s, NOW, 0, () => 0)).toBe(true);
  const t = get(h, "forum/topics/mt.json");
  const last = t.posts[t.posts.length - 1];
  expect(last).toMatchObject({ by: "anna", repost: true, quote: { by: "me" } });
  expect(last.text).toContain("Reposted");
  expect(last.quote.text).toBe("My own idea about tea.");
  expect(get(h, "forum/notices.json").items[0]).toMatchObject({ kind: "repost", by: "anna", post: "u1" });
  // the flag survives a read, and a user post can never carry it
  expect(forum.readTopic(h.fs, "mt").posts.slice(-1)[0].repost).toBe(true);
  put(h, "forum/topics/mt.json", { ...t, posts: [...t.posts.slice(0, -1), { ...last, by: "me" }] });
  expect(forum.readTopic(h.fs, "mt").posts.slice(-1)[0].repost).toBeUndefined();
  // a second try at once finds nothing new to pass on (the same post is taken), so the cap or the repeat rule holds
  expect(forum.repostTick(h.fs, { ...s, repostsPerDay: 0 }, NOW, 0, () => 0)).toBe(false);
});

test("a rumour's opening post that is passed on counts as told by the one who passed it on", () => {
  const h = world();
  const t = topicOf("gt", [post("g1", "boris", NOW - 5 * HOUR, "Heard something about Clara."), post("p2", "clara", NOW - 4 * HOUR), post("p3", "clara", NOW - 3 * HOUR), post("p4", "clara", NOW - 2 * HOUR), post("p5", "clara", NOW - HOUR)]);
  put(h, "forum/topics/gt.json", t);
  put(h, "forum/gossip.json", { items: [{ id: "g-1", kind: "rift", about: ["boris", "clara"], tone: "plain", truth: 1, by: "boris", at: NOW - 5 * HOUR, topic: "gt", told: ["boris"] }], drafts: [] });
  put(h, "life/people/anna.json", { scanned: 0, noteDay: "", failedAt: 0, people: [{ key: "c:boris", name: "Boris", seen: 3, toMe: 2, fromMe: 2, said: [], note: "", feel: 6 }] });
  const s = { ...forum.readSettings(h.fs), autonomous: true, reposts: true, repostsPerDay: 2, quietFrom: "00:00", quietTo: "00:00" };
  const only = (id: string) => put(h, `profiles/${id}.json`, prof(id, { forum: { frequency: 50, repliesYou: true, repliesOthers: false, opensOwn: true, favourites: [] } }));
  only("boris");
  only("clara");
  expect(forum.repostTick(h.fs, s, NOW, 0, () => 0)).toBe(true);
  expect(get(h, "forum/gossip.json").items[0].told).toEqual(["boris", "anna"]);
});

test("the settings carry reposts on by default, two a day, and the profiles plugin keeps them", async () => {
  const h = world();
  expect(forum.readSettings(h.fs)).toMatchObject({ reposts: true, repostsPerDay: 2 });
  put(h, "settings.json", { community: { reposts: false, repostsPerDay: 5 } });
  expect(forum.readSettings(h.fs)).toMatchObject({ reposts: false, repostsPerDay: 5 });
  const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));
  expect(profiles.DEFAULT_SETTINGS.community).toMatchObject({ reposts: true, repostsPerDay: 2 });
  const m = profiles.mergeSettings(profiles.DEFAULT_SETTINGS, { community: { reposts: false, repostsPerDay: 500 } });
  expect(m.community).toMatchObject({ reposts: false, repostsPerDay: 20 });
});
