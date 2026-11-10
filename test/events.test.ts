// Events (#358, idea 1): now and then the moderator opens a topic, and several invited characters talk about it.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const profile = (id: string, name: string) => ({ id, name, hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true } });
const post = (id: string, by: string, name: string, text: string, at: number, extra: object = {}) => ({ id, by, name, hue: 100, at, text, ...extra });

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
const evBoards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "Off-topic", desc: "" }, { id: "b2", name: "Games", desc: "" }] }] };
const evSettings = { autonomous: true, events: "weekly", quietFrom: "01:00", quietTo: "08:00" };
const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const DAY = 86400000;

test("eventDue: only when on, with two characters and a board, outside quiet hours, after the gap, never the same kind twice", () => {
  const two = [profile("a", "A"), profile("b", "B")];
  const st = { last: 0, kind: "contest", pendingAt: 0, failedAt: 0 };
  const due = forum.eventDue(evSettings, st, two, evBoards, noon, 0, () => 0);
  expect(due.kind).not.toBe("contest");
  expect(forum.EVENT_KINDS).toContain(due.kind);
  expect(forum.eventDue({ ...evSettings, events: "off" }, st, two, evBoards, noon, 0, () => 0)).toBeNull();
  expect(forum.eventDue({ ...evSettings, autonomous: false }, st, two, evBoards, noon, 0, () => 0)).toBeNull();
  expect(forum.eventDue(evSettings, st, [two[0]], evBoards, noon, 0, () => 0)).toBeNull();
  expect(forum.eventDue(evSettings, st, two, { categories: [] }, noon, 0, () => 0)).toBeNull();
  expect(forum.eventDue(evSettings, st, two, evBoards, Date.UTC(2026, 10, 10, 3, 0, 0), 0, () => 0)).toBeNull(); // quiet hours
  expect(forum.eventDue(evSettings, { ...st, last: noon - 3 * DAY }, two, evBoards, noon, 0, () => 0)).toBeNull(); // weekly: too soon
  expect(forum.eventDue({ ...evSettings, events: "daily" }, { ...st, last: noon - 21 * 3600000 }, two, evBoards, noon, 0, () => 0)).not.toBeNull();
  expect(forum.eventDue(evSettings, { ...st, pendingAt: noon - 60000 }, two, evBoards, noon, 0, () => 0)).toBeNull(); // a request is out
  expect(forum.eventDue(evSettings, { ...st, failedAt: noon - 60000 }, two, evBoards, noon, 0, () => 0)).toBeNull(); // waits after a failure
});

test("an event: the model's JSON becomes a topic by the moderator on a general board, with invited guests; a bad answer waits", () => {
  const files = new Map<string, string>();
  const fsx = memFs(files);
  for (const id of ["a", "b", "c", "d", "e", "f"]) files.set("profiles/" + id + ".json", JSON.stringify(profile(id, id.toUpperCase())));
  files.set("forum/events.json", JSON.stringify({ last: 0, kind: "", pendingAt: noon - 1000, failedAt: 0 }));
  const bad = forum.fileEventResult(fsx, { text: "no json here" }, evBoards, noon, () => 0, "contest");
  expect(bad.error).toBeTruthy();
  expect(JSON.parse(files.get("forum/events.json")!).failedAt).toBe(noon);
  expect(JSON.parse(files.get("forum/events.json")!).pendingAt).toBe(0);
  const out = forum.fileEventResult(fsx, { text: '```json\n{"title": "Photo of the week", "text": "Show the best thing you saw this week."}\n```' }, evBoards, noon + 1, () => 0, "contest");
  expect(out.topicId).toBeTruthy();
  const topic = JSON.parse(files.get("forum/topics/" + out.topicId + ".json")!);
  expect(topic.board).toBe("b1"); // the general board
  expect(topic.by).toBe("_mod");
  expect(topic.name).toBe("Moderator");
  expect(topic.event.kind).toBe("contest");
  expect(topic.event.invited.length).toBe(4);
  expect(new Set(topic.event.invited).size).toBe(4);
  expect(JSON.parse(files.get("forum/events.json")!)).toEqual({ last: noon + 1, kind: "contest", lastComment: 0, lastClose: 0, pendingAt: 0, failedAt: 0, lastChronicle: 0, chronicleTry: 0 });
  // the same title again is refused
  expect(forum.fileEventResult(fsx, { text: '{"title": "photo of the week!", "text": "x"}' }, evBoards, noon + 2, () => 0, "game").error).toContain("repeats");
  // a Ukrainian event is signed in Ukrainian
  const uk = forum.fileEventResult(fsx, { text: '{"title": "Тема тижня", "text": "Розкажіть, що бачили."}' }, evBoards, noon + 3, () => 0, "question");
  expect(JSON.parse(files.get("forum/topics/" + uk.topicId + ".json")!).name).toBe("Модератор");
  // the topic route and the board list carry the kind; the moderator is no person for the Life plugin
  const host = { fs: fsx } as any;
  files.set("forum/boards.json", JSON.stringify(evBoards));
  const view = forum.handleRoute({ path: "/forum/topic", method: "GET", query: { id: out.topicId } }, host).json;
  expect(view.topic.event).toBe("contest");
  const rows = forum.handleRoute({ path: "/forum/board", method: "GET", query: { id: "b1" } }, host).json.topics;
  expect(rows.find((r: any) => r.id === out.topicId).event).toBe("contest");
  const ev = life.topicEvents("a", { posts: [post("1", "_mod", "Moderator", "Hello", 10), post("2", "a", "A", "Hi", 20)] }, 0);
  expect(ev).toEqual([]);
});

function setup() {
  const mavka = profile("mavka", "Mavka");
  const topic = (id: string, by: string, name: string, at: number) => ({ id, board: "b1", title: id, by, name, hue: 1, createdAt: at, lastAt: at, locked: false, owe: 0, posts: [post(id + "p", by, name, "hello there", at)] });
  const now = Date.now();
  const settings = { writers: "equal", postsPerAuthor: 99, newTopicShare: 0 };
  const log = { day: "", byAuthor: {}, lastAuthor: "", total: 0, reacts: {} };
  return { mavka, topics: [topic("tY", "yaryna", "Yaryna", now - 1000)], boards: { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "Main", desc: "" }] }] }, settings, log, now };
}

test("planAction: an invited character comes to the event, once, only inside two days, and not when it does not answer others", () => {
  const s = setup();
  const mod = { id: "tE", board: "b1", title: "Event", by: "_mod", name: "Moderator", hue: 45, createdAt: s.now - 1000, lastAt: s.now - 1000, locked: false, owe: 0, event: { kind: "contest", at: s.now - 1000, invited: ["mavka"] }, posts: [post("e1", "_mod", "Moderator", "Join in", s.now - 1000)] };
  const c = (over: object = {}) => ({ profiles: [s.mavka], topics: [...s.topics, mod], boards: s.boards, settings: s.settings, log: s.log, now: s.now, tz: 0, mode: "force", ...over });
  const plan = forum.planAction(c(), () => 0);
  expect(plan.kind).toBe("reply");
  expect(plan.topic.id).toBe("tE");
  // she wrote there: the event no longer calls her
  const wrote = { ...mod, posts: [...mod.posts, post("e2", "mavka", "Mavka", "My photo", s.now - 500)] };
  expect(forum.planAction(c({ topics: [...s.topics, wrote] }), () => 0).topic?.id).not.toBe("tE");
  // old event
  const old = { ...mod, event: { ...mod.event, at: s.now - 3 * DAY } };
  expect(forum.planAction(c({ topics: [...s.topics, old] }), () => 0).topic?.id).not.toBe("tE");
  // not invited
  const other = { ...mod, event: { ...mod.event, invited: ["zorya"] } };
  expect(forum.planAction(c({ topics: [...s.topics, other] }), () => 0).topic?.id).not.toBe("tE");
  // does not answer others
  const shy = { ...s.mavka, forum: { ...s.mavka.forum, repliesOthers: false } };
  expect(forum.planAction(c({ profiles: [shy] }), () => 0)?.topic?.id).not.toBe("tE");
});

test("the tick keeps time for the first event, then asks for it when it is due", () => {
  const files = new Map<string, string>();
  const fsx = memFs(files);
  files.set("settings.json", JSON.stringify({ community: { events: "daily" }, quietFrom: "01:00", quietTo: "02:00", autonomous: true }));
  files.set("forum/boards.json", JSON.stringify(evBoards));
  for (const id of ["a", "b"]) files.set("profiles/" + id + ".json", JSON.stringify(profile(id, id.toUpperCase())));
  const requests: { key: string }[] = [];
  const host: any = { fs: fsx, llm: { results: {}, request: (key: string) => void requests.push({ key }) } };
  const realNow = Date.now;
  try {
    Date.now = () => noon;
    forum.onTick({}, host);
    expect(JSON.parse(files.get("forum/events.json")!).last).toBe(noon);
    expect(requests.filter((r) => r.key.startsWith("ev:")).length).toBe(0); // not on the first tick
    Date.now = () => noon + 25 * 3600000;
    forum.onTick({}, host);
    expect(requests.filter((r) => r.key.startsWith("ev:")).length).toBe(1);
    expect(JSON.parse(files.get("forum/events.json")!).pendingAt).toBe(noon + 25 * 3600000);
  } finally {
    Date.now = realNow;
  }
});
