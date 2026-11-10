// The Moderator (#358): the forum's own voice. Comments in lively topics, closing topics that went quiet or ran too long, the end of an event.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const profile = (id: string, name: string) => ({ id, name, hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true } });
const post = (id: string, by: string, name: string, text: string, at: number) => ({ id, by, name, hue: 100, at, text });
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
const evBoards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "Off-topic", desc: "" }] }] };
const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const DAY = 86400000;
const modSettings = { autonomous: true, modComments: "rare", modCloses: true };
const topicOf = (id: string, posts: any[], extra: object = {}) => ({ id, board: "b1", title: id + " title", by: "a", name: "A", hue: 1, createdAt: posts[0].at, lastAt: posts[posts.length - 1].at, locked: false, owe: 0, posts, ...extra });
const chatter = (n: number, end: number, last = "a") => Array.from({ length: n }, (_, i) => post("p" + i, i === n - 1 ? last : i % 2 ? "b" : "a", i % 2 ? "B" : "A", "line " + i, end - (n - i) * 60000));

test("the Moderator's voice: dry, never cruel, the forum's language, never an AI, and the tone changes", () => {
  const sys = forum.modSystem(forum.MOD_TONES[0]);
  expect(sys).toContain("sarcastic");
  expect(sys).toContain("never cruel");
  expect(sys).toContain("language of the forum");
  expect(sys).toContain("Never mention that you are an AI");
  expect(forum.modSystem(forum.MOD_TONES[1])).toContain("official");
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) seen.add(forum.modTone(() => (i % 10) / 10).id);
  expect(seen.size).toBeGreaterThan(1);
});

test("pickModComment: a lively open topic, not its own last word, not twice in a row, after the gap", () => {
  const st = { lastComment: 0 };
  const live = topicOf("live", chatter(6, noon - 1000));
  expect(forum.pickModComment([live], st, modSettings, noon, () => 0).id).toBe("live");
  expect(forum.pickModComment([live], st, { ...modSettings, modComments: "off" }, noon, () => 0)).toBeNull();
  expect(forum.pickModComment([live], { lastComment: noon - 3600000 }, modSettings, noon, () => 0)).toBeNull(); // rare: eight hours
  expect(forum.pickModComment([live], { lastComment: noon - 3 * 3600000 }, { ...modSettings, modComments: "often" }, noon, () => 0)).not.toBeNull();
  expect(forum.pickModComment([topicOf("short", chatter(3, noon - 1000))], st, modSettings, noon, () => 0)).toBeNull();
  expect(forum.pickModComment([topicOf("old", chatter(6, noon - 20 * 3600000))], st, modSettings, noon, () => 0)).toBeNull();
  expect(forum.pickModComment([{ ...live, locked: true }], st, modSettings, noon, () => 0)).toBeNull();
  expect(forum.pickModComment([topicOf("own", chatter(6, noon - 1000, "_mod"))], st, modSettings, noon, () => 0)).toBeNull();
  const earlier = chatter(6, noon - 1000);
  earlier[2] = post("m", "_mod", "Moderator", "hm", noon - 5000);
  expect(forum.pickModComment([topicOf("had", earlier)], st, modSettings, noon, () => 0)).toBeNull();
});

test("modCloseReason and pickModClose: an event three days old, two quiet weeks, a very long topic; once a day; the oldest first", () => {
  const ev = topicOf("ev", chatter(2, noon - 4 * DAY), { event: { kind: "contest", at: noon - 4 * DAY, invited: [] } });
  const quiet = topicOf("quiet", chatter(5, noon - 20 * DAY));
  const fresh = topicOf("fresh", chatter(5, noon - 2 * DAY));
  const tiny = topicOf("tiny", chatter(2, noon - 30 * DAY));
  const long = topicOf("long", Array.from({ length: 400 }, (_, i) => post("p" + i, "a", "A", "x" + i, noon - 1000 + i)));
  expect(forum.modCloseReason(ev, noon)).toBe("event");
  expect(forum.modCloseReason(quiet, noon)).toBe("quiet");
  expect(forum.modCloseReason(fresh, noon)).toBeNull();
  expect(forum.modCloseReason(tiny, noon)).toBeNull(); // too few posts to bother
  expect(forum.modCloseReason(long, noon)).toBe("long");
  expect(forum.modCloseReason({ ...quiet, locked: true }, noon)).toBeNull();
  const st = { lastClose: 0 };
  expect(forum.pickModClose([ev, quiet, fresh], st, modSettings, noon).topic.id).toBe("quiet"); // the older last post first
  expect(forum.pickModClose([ev, quiet], { lastClose: noon - 3600000 }, modSettings, noon)).toBeNull();
  expect(forum.pickModClose([ev, quiet], st, { ...modSettings, modCloses: false }, noon)).toBeNull();
});

test("fileModPost: a comment is a post by the Moderator; a closing also locks the topic; a failure waits; nothing for a locked topic", () => {
  const files = new Map<string, string>();
  const fsx = memFs(files);
  files.set("forum/topics/t1.json", JSON.stringify(topicOf("t1", chatter(5, noon - 5000))));
  files.set("forum/events.json", JSON.stringify({ last: 0, kind: "", lastComment: 0, lastClose: 0, pendingAt: noon - 1000, failedAt: 0 }));
  expect(forum.fileModPost(fsx, "mc", "t1", { text: "Moderator: Riveting stuff, truly." }, noon).topicId).toBe("t1");
  let saved = JSON.parse(files.get("forum/topics/t1.json")!);
  expect(saved.posts[saved.posts.length - 1]).toMatchObject({ by: "_mod", name: "Moderator", text: "Riveting stuff, truly." });
  expect(saved.locked).toBe(false);
  expect(JSON.parse(files.get("forum/events.json")!)).toMatchObject({ lastComment: noon, lastClose: 0, pendingAt: 0 });
  expect(forum.fileModPost(fsx, "mx", "t1", { text: "Closed. Go home." }, noon + 1).topicId).toBe("t1");
  saved = JSON.parse(files.get("forum/topics/t1.json")!);
  expect(saved.locked).toBe(true);
  expect(JSON.parse(files.get("forum/events.json")!).lastClose).toBe(noon + 1);
  // a locked topic takes nothing more, and a failed call waits
  expect(forum.fileModPost(fsx, "mc", "t1", { text: "More." }, noon + 2).error).toBeTruthy();
  expect(JSON.parse(files.get("forum/events.json")!).failedAt).toBe(noon + 2);
  expect(forum.fileModPost(fsx, "mc", "nope", { text: "x" }, noon + 3).error).toBeTruthy();
  files.set("forum/topics/t2.json", JSON.stringify(topicOf("t2", chatter(5, noon - 5000))));
  expect(forum.fileModPost(fsx, "mc", "t2", { error: "boom" }, noon + 4).error).toBe("boom");
  // the Moderator writes in the language of the topic
  files.set("forum/topics/t3.json", JSON.stringify(topicOf("t3", chatter(5, noon - 5000), { title: "Тема про озеро" })));
  forum.fileModPost(fsx, "mc", "t3", { text: "Ну що ж." }, noon + 5);
  const t3 = JSON.parse(files.get("forum/topics/t3.json")!);
  expect(t3.posts[t3.posts.length - 1].name).toBe("Модератор");
});

test("the tick asks for a comment when one is due, one request at a time, in the forum's model", () => {
  const files = new Map<string, string>();
  const fsx = memFs(files);
  files.set("settings.json", JSON.stringify({ models: { forum: "prov/forum-model" }, community: { events: "off", modComments: "often", modCloses: false }, quietFrom: "01:00", quietTo: "02:00", autonomous: true }));
  files.set("forum/boards.json", JSON.stringify(evBoards));
  for (const id of ["a", "b"]) files.set("profiles/" + id + ".json", JSON.stringify(profile(id, id.toUpperCase())));
  files.set("forum/events.json", JSON.stringify({ last: noon - 30 * DAY, kind: "", lastComment: noon - 3 * 3600000, lastClose: noon - 3600000, pendingAt: 0, failedAt: 0 }));
  files.set("forum/topics/live.json", JSON.stringify(topicOf("live", chatter(6, noon - 1000))));
  const requests: { key: string; req: any }[] = [];
  const host: any = { fs: fsx, llm: { results: {}, request: (key: string, req: any) => void requests.push({ key, req }) } };
  const realNow = Date.now;
  const realRandom = Math.random;
  try {
    Date.now = () => noon;
    Math.random = () => 0;
    forum.onTick({}, host);
    const mod = requests.filter((r) => r.key.startsWith("mc:"));
    expect(mod).toHaveLength(1);
    expect(mod[0].key).toBe("mc:live");
    expect(mod[0].req.model).toBe("prov/forum-model");
    expect(mod[0].req.systemPrompt).toContain("Moderator");
    expect(mod[0].req.messages[0].content).toContain("live title");
    // a request is out: the next tick asks for nothing from the Moderator
    forum.onTick({}, host);
    expect(requests.filter((r) => r.key.startsWith("mc:"))).toHaveLength(1);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
});

test("a closing: the tick asks, and the answer locks the topic with the Moderator's last word", () => {
  const files = new Map<string, string>();
  const fsx = memFs(files);
  files.set("settings.json", JSON.stringify({ community: { events: "off", modComments: "off", modCloses: true }, quietFrom: "01:00", quietTo: "02:00", autonomous: true }));
  files.set("forum/boards.json", JSON.stringify(evBoards));
  for (const id of ["a", "b"]) files.set("profiles/" + id + ".json", JSON.stringify(profile(id, id.toUpperCase())));
  files.set("forum/events.json", JSON.stringify({ last: noon - 30 * DAY, kind: "", lastComment: noon, lastClose: noon - 2 * DAY, pendingAt: 0, failedAt: 0 }));
  files.set("forum/topics/old.json", JSON.stringify(topicOf("old", chatter(5, noon - 20 * DAY))));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  const host: any = { fs: fsx, llm: { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) } };
  const realNow = Date.now;
  const realRandom = Math.random;
  try {
    Date.now = () => noon;
    Math.random = () => 0;
    forum.onTick({}, host);
    expect(requests.map((r) => r.key)).toEqual(["mx:old"]);
    expect(requests[0].req.messages[0].content).toContain("Nobody has written here for weeks");
    results = { "mx:old": { text: "Silence noted. Closed." } };
    forum.onTick({}, host);
    const saved = JSON.parse(files.get("forum/topics/old.json")!);
    expect(saved.locked).toBe(true);
    expect(saved.posts[saved.posts.length - 1]).toMatchObject({ by: "_mod", text: "Silence noted. Closed." });
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
});
