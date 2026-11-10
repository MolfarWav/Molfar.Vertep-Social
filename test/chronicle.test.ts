// The chronicle (#367): once a day the Moderator posts what happened between the members. The facts come from rules (milestones in the
// people lists, rumours, events); one model request words them; nothing is posted when there is too little to tell.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));

const DAY = 86400000;
const HOUR = 3600000;
const NOW = 40 * DAY + 12 * HOUR;
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const NAMES: Record<string, string> = { anna: "Anna", boris: "Boris", clara: "Clara", dmytro: "Dmytro" };

function makeHost(files: Map<string, string> = new Map()) {
  const requests: { key: string; body: any }[] = [];
  const host: any = {
    files,
    requests,
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
    llm: { results: {} as Record<string, unknown>, request: (key: string, body: any) => void requests.push({ key, body }) },
  };
  return host;
}
const put = (h: any, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: any, p: string) => JSON.parse(h.files.get(p)!);
const person = (id: string, marks: object[] = [], extra: object = {}) => ({ key: "c:" + id, name: NAMES[id], seen: 3, toMe: 1, fromMe: 1, said: [], note: "", feel: 0, marks, ...extra });

/** Four adult characters; `lists` is each one's list of people. */
function world(lists: Record<string, object[]> = {}, community: object = {}) {
  const h = makeHost();
  for (const id of Object.keys(NAMES)) {
    put(h, `profiles/${id}.json`, { id, name: NAMES[id], hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, adult: true, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true } });
    put(h, `life/people/${id}.json`, { scanned: 0, noteDay: "", failedAt: 0, people: lists[id] || [] });
  }
  put(h, "settings.json", { tzOffset: 0, community: { tone: "warm", ...community } });
  put(h, "forum/boards.json", { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "Off-topic", desc: "" }] }] });
  return h;
}
const profilesOf = (h: any) => forum.loadProfiles(h.fs);
const since = NOW - DAY;
const mark = (k: string, v: string, at = NOW - HOUR, up = true) => ({ at, k, v, ...(up ? { up: true } : {}) });
const facts = (h: any, topics: any[] = []) => forum.chronicleFacts(h.fs, profilesOf(h), topics, NOW, 0, since);

test("chronicleFacts: milestones between characters inside the window, one line for a pair seen from both sides", () => {
  const h = world({
    anna: [person("boris", [mark("level", "friend")]), person("clara", [mark("level", "friend", NOW - 3 * DAY)])],
    boris: [person("anna", [mark("level", "friend")])],
    clara: [person("dmytro", [mark("feel", "hostile", NOW - HOUR, false)])],
  });
  const f = facts(h);
  expect(f.facts).toContain("Anna and Boris became friends");
  expect(f.facts.filter((x: string) => x.includes("became friends")).length).toBe(1);
  expect(f.facts.some((x: string) => x.includes("Clara and"))).toBe(false); // too old
  expect(f.facts).toContain("Clara is now openly at odds with Dmytro");
  expect(f.strong).toBe(2);
  expect(f.people.sort()).toEqual(["anna", "boris", "clara", "dmytro"]);
});

test("chronicleFacts: a level that fell is a drift, a rival tie is rivalry, the user's persona is never named", () => {
  const h = world({
    anna: [person("boris", [mark("level", "acquaintance", NOW - HOUR, false)]), { ...person("boris"), key: "u:p1", name: "Persona", marks: [mark("level", "friend")] }],
    clara: [person("dmytro", [mark("tie", "rival")])],
  });
  const f = facts(h);
  expect(f.facts).toContain("Anna and Boris drifted apart");
  expect(f.facts).toContain("Clara and Dmytro became rivals");
  expect(JSON.stringify(f.facts)).not.toContain("Persona");
});

test("chronicleFacts: a couple only between adults and only while the tone is not none", () => {
  const lists = { anna: [person("boris", [mark("tie", "dating")])] };
  expect(facts(world(lists)).facts).toContain("Anna and Boris are seeing each other now");
  expect(facts(world(lists, { tone: "none" })).facts.some((x: string) => x.includes("seeing"))).toBe(false);
  const h = world(lists);
  put(h, "profiles/boris.json", { ...get(h, "profiles/boris.json"), adult: false });
  expect(facts(h).facts.some((x: string) => x.includes("seeing"))).toBe(false);
});

test("chronicleFacts: rumours told in the window, events opened by the Moderator, the busiest topic", () => {
  const h = world();
  put(h, "forum/gossip.json", { items: [{ id: "g-1", kind: "rift", about: ["boris", "clara"], tone: "plain", truth: 1, by: "anna", at: NOW - HOUR, topic: "", told: ["anna"] }, { id: "g-2", kind: "sweet", about: ["anna", "dmytro"], tone: "kind", truth: 1, by: "boris", at: NOW - 2 * DAY, topic: "", told: ["boris"] }], drafts: [] });
  const ev = { id: "t-ev", board: "b1", title: "Photo of the week", by: "_mod", name: "Moderator", hue: 45, createdAt: NOW - 2 * HOUR, lastAt: NOW - HOUR, locked: false, owe: 0, event: { kind: "contest", at: NOW - 2 * HOUR, invited: ["clara"] }, posts: [{ id: "p1", by: "_mod", name: "Moderator", hue: 45, at: NOW - 2 * HOUR, text: "x" }, { id: "p2", by: "clara", name: "Clara", hue: 1, at: NOW - HOUR, text: "y" }] };
  const busy = { id: "t-busy", board: "b1", title: "Tea or coffee", by: "anna", name: "Anna", hue: 1, createdAt: NOW - 5 * HOUR, lastAt: NOW - HOUR, locked: false, owe: 0, posts: Array.from({ length: 5 }, (_, i) => ({ id: "b" + i, by: i % 2 ? "boris" : "anna", name: "X", hue: 1, at: NOW - 5 * HOUR + i * 60000, text: "t" + i })) };
  const f = facts(h, [ev, busy]);
  expect(f.facts.some((x: string) => x.includes("Anna has been telling people") && x.includes("Boris and Clara have been at odds"))).toBe(true);
  expect(f.facts.some((x: string) => x.includes("sweet"))).toBe(false); // too old
  expect(f.facts.some((x: string) => x.includes('"Photo of the week"') && x.includes("1 answers"))).toBe(true);
  expect(f.facts.some((x: string) => x.includes('busiest topic was "Tea or coffee"'))).toBe(true);
  expect(f.strong).toBe(2);
});

test("a chronicle topic is not ended like an event after three days", () => {
  const t = { id: "c1", board: "b1", title: "x", by: "_mod", locked: false, lastAt: NOW, event: { kind: "chronicle", at: NOW - 4 * DAY, invited: [] }, posts: [{ id: "p", by: "_mod", name: "M", hue: 1, at: NOW - 4 * DAY, text: "x" }] };
  expect(forum.modCloseReason(t, NOW)).toBeNull();
  expect(forum.modCloseReason({ ...t, event: { ...t.event, kind: "contest" } }, NOW)).toBe("event");
});

test("chronicleDue: needs the switch, two characters, a board, the gap, and a pause between tries", () => {
  const h = world();
  const st = { lastChronicle: NOW - 23 * HOUR, chronicleTry: 0 };
  const s = forum.readSettings(h.fs);
  const boards = forum.readBoards(h.fs);
  expect(forum.chronicleDue(s, st, profilesOf(h), boards, NOW)).toBe(true);
  expect(forum.chronicleDue({ ...s, chronicle: false }, st, profilesOf(h), boards, NOW)).toBe(false);
  expect(forum.chronicleDue(s, { ...st, lastChronicle: NOW - 10 * HOUR }, profilesOf(h), boards, NOW)).toBe(false);
  expect(forum.chronicleDue(s, { ...st, chronicleTry: NOW - 10 * 60000 }, profilesOf(h), boards, NOW)).toBe(false);
  expect(forum.chronicleDue(s, st, profilesOf(h).slice(0, 1), boards, NOW)).toBe(false);
  expect(forum.chronicleDue(s, st, profilesOf(h), { categories: [] }, NOW)).toBe(false);
  expect(forum.readSettings(h.fs).chronicle).toBe(true);
  put(h, "settings.json", { community: { chronicle: false } });
  expect(forum.readSettings(h.fs).chronicle).toBe(false);
});

function at(ms: number, fn: () => void) {
  const real = Date.now;
  Date.now = () => ms;
  try {
    fn();
  } finally {
    Date.now = real;
  }
}
const twoFacts = { anna: [person("boris", [mark("level", "friend")])], clara: [person("dmytro", [mark("feel", "hostile", NOW - HOUR, false)])] };

test("the tick asks once for the chronicle when there is enough to tell, and not before the gap", () => {
  const h = world(twoFacts);
  put(h, "forum/events.json", { last: NOW, kind: "", lastComment: NOW, lastClose: NOW, pendingAt: 0, failedAt: 0, lastChronicle: NOW - 23 * HOUR, chronicleTry: 0 });
  at(NOW, () => forum.onTick({}, h));
  const ask = h.requests.find((r: any) => r.key.startsWith("cr:"));
  expect(ask).toBeTruthy();
  expect(ask.key).toBe("cr:1970-02-10");
  expect(ask.body.messages[0].content).toContain("Anna and Boris became friends");
  expect(ask.body.systemPrompt).toContain("daily chronicle");
  expect(ask.body.systemPrompt).toContain("never as proven");
  // too soon after the last one: nothing is asked
  const early = world(twoFacts);
  put(early, "forum/events.json", { last: NOW, kind: "", lastComment: NOW, lastClose: NOW, pendingAt: 0, failedAt: 0, lastChronicle: NOW - 5 * HOUR, chronicleTry: 0 });
  at(NOW, () => forum.onTick({}, early));
  expect(early.requests.some((r: any) => r.key.startsWith("cr:"))).toBe(false);
});

test("the tick posts no chronicle for a quiet day, and does not look again for half an hour", () => {
  const h = world({ anna: [person("boris", [mark("level", "friend")])] });
  put(h, "forum/events.json", { last: NOW, kind: "", lastComment: NOW, lastClose: NOW, pendingAt: 0, failedAt: 0, lastChronicle: NOW - 23 * HOUR, chronicleTry: 0 });
  at(NOW, () => forum.onTick({}, h));
  expect(h.requests.some((r: any) => r.key.startsWith("cr:"))).toBe(false);
  expect(get(h, "forum/events.json").chronicleTry).toBe(NOW);
  expect(get(h, "forum/events.json").lastChronicle).toBe(NOW - 23 * HOUR);
});

test("a forum that kept time before the chronicle existed gets its first one a day later, not at once", () => {
  const h = world(twoFacts);
  put(h, "forum/events.json", { last: NOW, kind: "", lastComment: NOW, lastClose: NOW, pendingAt: 0, failedAt: 0 });
  at(NOW, () => forum.onTick({}, h));
  expect(h.requests.some((r: any) => r.key.startsWith("cr:"))).toBe(false);
  expect(get(h, "forum/events.json").lastChronicle).toBe(NOW - 2 * HOUR);
});

test("fileChronicle: a topic by the Moderator with a title made by rules, guests, and the clock moved", () => {
  const h = world(twoFacts);
  put(h, "forum/events.json", { last: NOW, kind: "", lastComment: 0, lastClose: 0, pendingAt: NOW - 1000, failedAt: 0, lastChronicle: NOW - 23 * HOUR, chronicleTry: NOW - 1000 });
  const boards = forum.readBoards(h.fs);
  const out = forum.fileChronicle(h.fs, { text: "Anna and Boris are friends now, which the forum took calmly. Clara and Dmytro, less so." }, boards, NOW, () => 0, 0);
  expect(out.topicId).toBeTruthy();
  const t = get(h, "forum/topics/" + out.topicId + ".json");
  expect(t.by).toBe("_mod");
  expect(t.title).toBe("Chronicle of the day · 10.02.1970");
  expect(t.event.kind).toBe("chronicle");
  expect(t.event.invited.sort()).toEqual(["anna", "boris", "clara", "dmytro"]);
  const st = get(h, "forum/events.json");
  expect(st.lastChronicle).toBe(NOW);
  expect(st.pendingAt).toBe(0);
  // the topic route and the board list carry the kind for the badge
  expect(forum.handleRoute({ path: "/forum/topic", method: "GET", query: { id: out.topicId } }, h).json.topic.event).toBe("chronicle");
  // a Ukrainian digest gets a Ukrainian title
  expect(forum.chronicleTitle("2026-11-10", "Анна й Борис потоваришували.")).toBe("Хроніка дня · 10.11.2026");
});

test("fileChronicle: an empty answer, a repeat of the same day and anything past the ceiling are not filed, and the wait starts", () => {
  const h = world(twoFacts);
  put(h, "forum/events.json", { last: NOW, kind: "", lastComment: 0, lastClose: 0, pendingAt: NOW, failedAt: 0, lastChronicle: NOW - 23 * HOUR, chronicleTry: NOW });
  const boards = forum.readBoards(h.fs);
  const text = "Anna and Boris are friends now, which the forum took calmly. Clara and Dmytro, less so.";
  expect(forum.fileChronicle(h.fs, { error: "boom" }, boards, NOW, () => 0, 0).error).toBe("boom");
  expect(get(h, "forum/events.json").failedAt).toBe(NOW);
  expect(forum.fileChronicle(h.fs, { text: "ok" }, boards, NOW, () => 0, 0).error).toBeTruthy();
  expect(forum.fileChronicle(h.fs, { text: "Anna had sex with Boris and then everyone talked about the orgasm for hours." }, boards, NOW, () => 0, 0).error).toContain("ceiling");
  expect(forum.fileChronicle(h.fs, { text }, boards, NOW, () => 0, 0).topicId).toBeTruthy();
  expect(forum.fileChronicle(h.fs, { text }, boards, NOW + 1000, () => 0, 0).error).toContain("repeats");
});
