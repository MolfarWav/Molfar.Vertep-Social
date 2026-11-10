// Relationships (#358, idea 2): a feeling per known person, read from the tone of what was said either way with no model call, and what it
// does in the forum: the prompt line, whose post draws a reply, and who a character lets go by.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));

const DAY = 86400000;
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const profile = (id: string, name: string) => ({ id, name, hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true } });
const post = (id: string, by: string, name: string, text: string, at: number, extra: object = {}) => ({ id, by, name, hue: 100, at, text, ...extra });

test("toneOf reads warm and sharp lines in both languages, flips after a negation, counts emoji", () => {
  expect(life.toneOf("Thank you, that was lovely!")).toBe(1);
  expect(life.toneOf("Дякую, чудова ідея")).toBe(1);
  expect(life.toneOf("That is stupid nonsense")).toBe(-1);
  expect(life.toneOf("Це дурня, я тебе ненавиджу")).toBe(-1);
  expect(life.toneOf("not nice at all")).toBe(-1);
  expect(life.toneOf("не дуже гарно")).toBe(-1);
  expect(life.toneOf("I don't hate it")).toBe(1);
  expect(life.toneOf("\u{1F621}")).toBe(-1);
  expect(life.toneOf("\u{1F60A}")).toBe(1);
  expect(life.toneOf("The lake froze on Tuesday.")).toBe(0);
  expect(life.toneOf("")).toBe(0);
});

test("feelWord names the bands", () => {
  expect([12, 7, 3, 2, 0, -2, -3, -7].map(life.feelWord)).toEqual(["close", "close", "warm", "", "", "", "cold", "hostile"]);
});

test("topicEvents and chatEvents carry the tone of what was said to her and of what she answered", () => {
  const t = {
    posts: [
      post("1", "mavka", "Mavka", "First.", 10),
      post("2", "yaryna", "Yaryna", "Thanks, lovely post!", 20, { quote: { by: "mavka", name: "Mavka", text: "First." } }),
      post("3", "mavka", "Mavka", "You are stupid.", 30, { quote: { by: "yaryna", name: "Yaryna", text: "Thanks" } }),
    ],
  };
  const ev = life.topicEvents("mavka", t, 0);
  expect(ev.map((e: any) => [e.at, e.toMe, e.fromMe, e.tone])).toEqual([
    [20, 1, 0, 1],
    [30, 0, 1, -1],
  ]);
  const chat = { messages: [{ who: "me", at: 5, text: "Thank you!" }, { who: "mavka", at: 6, text: "Hmm, boring." }] };
  expect(life.chatEvents(chat, { key: "u:u1", name: "S" }, 0).map((e: any) => [e.toMe, e.fromMe, e.tone])).toEqual([[1, 0, 1], [0, 1, -1]]);
});

test("mergeEvents moves the feeling by tone, keeps it inside the limits, and cools it over the days", () => {
  const pf = life.emptyPeople();
  const ev = (at: number, tone: number) => ({ key: "c:yaryna", name: "Yaryna", at, where: "forum", seen: 1, toMe: 1, fromMe: 0, said: "", tone });
  life.mergeEvents(pf, [ev(1000, 1), ev(1001, 1), ev(1002, 1)]);
  expect(pf.people[0].feel).toBe(3);
  life.mergeEvents(pf, Array.from({ length: 30 }, (_, i) => ev(2000 + i, 1)));
  expect(pf.people[0].feel).toBe(12);
  life.mergeEvents(pf, [ev(2100 + 10 * DAY, 0)]);
  expect(pf.people[0].feel).toBeLessThan(7); // ten days: 12 * 0.93^10 is about 5.8
  expect(pf.people[0].feel).toBeGreaterThan(5);
  // an old file without `feel` reads as 0, a wild value is clamped
  const clean = life.readPeople({ read: () => JSON.stringify({ people: [{ key: "c:a", name: "A", feel: 99 }, { key: "c:b", name: "B" }] }) } as any, "x");
  expect(clean.people.map((p: any) => p.feel)).toEqual([12, 0]);
});

function fsWith(people: object) {
  const files = new Map<string, string>([["life/people/mavka.json", JSON.stringify({ people })]]);
  return { read: (p: string) => { if (!files.has(p)) throw new Error("ENOENT"); return files.get(p)!; }, write: () => {}, remove: () => {}, list: () => [] } as any;
}

test("metLine adds how it stands, the same in the forum and the messenger", () => {
  const person = (feel: number) => ({ key: "c:yaryna", name: "Yaryna", seen: 3, toMe: 1, fromMe: 1, said: [], note: "", feel });
  for (const [feel, text] of [[8, "close"], [4, "get on well"], [-4, "do not get on"], [-9, "open conflict"], [1, ""]] as const) {
    const fsx = fsWith([person(feel)]);
    const a = forum.metLine(fsx, { id: "mavka" }, "c:yaryna");
    expect(a).toBe(messenger.metLine(fsx, { id: "mavka" }, "c:yaryna"));
    if (text) expect(a).toContain(text);
    else expect(a).not.toContain("You are");
  }
});

test("feelsOf lists the non-zero feelings per character and is empty when life is off", () => {
  const fsx = fsWith([{ key: "c:yaryna", name: "Y", feel: -5 }, { key: "c:zorya", name: "Z", feel: 0 }]);
  expect(forum.feelsOf(fsx, [{ id: "mavka" }, { id: "none" }])).toEqual({ mavka: { "c:yaryna": -5 } });
  expect(forum.feelsOf(fsx, [{ id: "mavka", life: { on: false } }])).toEqual({});
});

// a topic where `last` wrote the last post, and Mavka has not written yet
function setup() {
  const mavka = profile("mavka", "Mavka");
  const yaryna = profile("yaryna", "Yaryna");
  const zorya = profile("zorya", "Zorya");
  const topic = (id: string, by: string, name: string, at: number) => ({ id, board: "b1", title: id, by, name, hue: 1, createdAt: at, lastAt: at, locked: false, owe: 0, posts: [post(id + "p", by, name, "hello there", at)] });
  const now = Date.now();
  const topics = [topic("tY", "yaryna", "Yaryna", now - 1000), topic("tZ", "zorya", "Zorya", now - 1000)];
  const boards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "Main", desc: "" }] }] };
  const settings = { writers: "equal", postsPerAuthor: 99, newTopicShare: 0 };
  const log = { day: "", byAuthor: {}, lastAuthor: "", total: 0 };
  return { mavka, yaryna, zorya, topics, boards, settings, log, now };
}

test("planAction: a liked post draws a reply far more often than a disliked one", () => {
  const s = setup();
  const c = { profiles: [s.mavka], topics: s.topics, boards: s.boards, settings: s.settings, log: s.log, now: s.now, tz: 0, mode: "force", feels: { mavka: { "c:yaryna": 12, "c:zorya": -12 } } };
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const hits: Record<string, number> = { tY: 0, tZ: 0 };
  for (let i = 0; i < 400; i++) {
    const plan = forum.planAction(c, rand);
    if (plan && plan.kind === "reply") hits[plan.topic.id]++;
  }
  expect(hits.tY).toBeGreaterThan(hits.tZ * 4);
  // without feelings the two are about even
  const flat = { ...c, feels: {} };
  const even: Record<string, number> = { tY: 0, tZ: 0 };
  for (let i = 0; i < 400; i++) {
    const plan = forum.planAction(flat, rand);
    if (plan && plan.kind === "reply") even[plan.topic.id]++;
  }
  expect(Math.abs(even.tY - even.tZ)).toBeLessThan(120);
});

test("planAction: a mention by someone in open conflict is often let go, a mention by a friend or the user never", () => {
  const s = setup();
  const withMention = (by: string, name: string) => [{ ...s.topics[0], by, name, posts: [post("m", by, name, "Mavka, what do you think?", s.now - 1000, by === "me" ? { persona: "u1" } : {})] }];
  const run = (topics: any[], feels: object) => {
    let n = 0;
    for (let i = 0; i < 100; i++) {
      const plan = forum.planAction({ profiles: [s.mavka], topics, boards: s.boards, settings: s.settings, log: s.log, now: s.now, tz: 0, mode: "force", feels }, () => (i % 10) / 10);
      if (plan && plan.kind === "reply" && plan.target) n++;
    }
    return n;
  };
  const enemy = withMention("yaryna", "Yaryna");
  expect(run(enemy, {})).toBe(100);
  expect(run(enemy, { mavka: { "c:yaryna": -9 } })).toBeLessThan(60); // skipped when rand < 0.6
  expect(run(enemy, { mavka: { "c:yaryna": -5 } })).toBe(100); // cold is not conflict
  expect(run(withMention("me", "Serhii"), { mavka: { "u:u1": -12 } })).toBe(100);
});
