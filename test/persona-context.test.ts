import { expect, test } from "bun:test";
import path from "node:path";

// The user's persona on forum posts, and the messenger's context window (messages the character sees).
const root = path.resolve(import.meta.dir, "..");
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
  const fsx = {
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
  };
  return { files, host: { fs: fsx, llm: { results: {} as Record<string, unknown>, request: (_k: string, _r: any) => {} } } as any };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);
const route = (mod: any, h: H, method: string, p: string, body?: unknown, extra: object = {}) => mod.handleRoute({ method, path: p, body, ...extra }, h.host);
const PIC = "/v1/assets/vlad1";

const seedBoard = (h: H) => {
  put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Open", desc: "" }] }] });
  put(h, "profiles/a.json", { id: "a", name: "Ada", hue: 100, about: "", interests: [], habits: [], voice: {}, schedule: [], forum: {} });
};

test("forum: a post by the user is shown as the persona it was written as, with its picture", () => {
  const h = makeHost();
  seedBoard(h);
  const both = [
    { id: "p1", name: "Vladyslav", hue: 30, about: "x", picture: PIC },
    { id: "p2", name: "Mira", hue: 200, about: "" },
  ];
  put(h, "you.json", { active: "p1", personas: both });
  const made = route(forum, h, "POST", "/forum/topic", { board: "b1", title: "Hello there", text: "First" });
  const topicId = made.json.topic;
  const stored = get(h, `forum/topics/${topicId}.json`);
  expect(stored.posts[0]).toMatchObject({ by: "me", name: "Vladyslav", hue: 30, persona: "p1" });
  // the view adds how to show it: name, hue and the persona's picture
  const view = route(forum, h, "GET", "/forum/topic", undefined, { query: { id: topicId } }).json;
  expect(view.topic.posts[0].as).toEqual({ name: "Vladyslav", hue: 30, picture: PIC });
  // a later post by another persona keeps its own name; the first one is not renamed
  put(h, "you.json", { active: "p2", personas: both });
  route(forum, h, "POST", "/forum/reply", { topic: topicId, text: "Second", quoteOf: stored.posts[0].id });
  const v2 = route(forum, h, "GET", "/forum/topic", undefined, { query: { id: topicId } }).json.topic.posts;
  expect(v2[0].as.name).toBe("Vladyslav");
  expect(v2[1].as).toEqual({ name: "Mira", hue: 200, picture: "" });
  // a quote of the user's post names the persona
  expect(v2[1].quote).toMatchObject({ by: "me", name: "Vladyslav" });
});

test("forum: posts from before personas follow the active persona; a deleted persona keeps its stored name; no persona means null", () => {
  const h = makeHost();
  seedBoard(h);
  put(h, "forum/topics/t1.json", {
    id: "t1",
    board: "b1",
    title: "Old topic",
    by: "me",
    name: "",
    hue: 200,
    createdAt: 1,
    lastAt: 3,
    locked: false,
    unread: false,
    owe: 0,
    posts: [
      { id: "p1", by: "me", name: "", hue: 200, at: 1, text: "old" },
      { id: "p2", by: "me", name: "Gone", hue: 50, at: 2, text: "from a deleted persona", persona: "p9" },
    ],
  });
  const view = (hh: H) => route(forum, hh, "GET", "/forum/topic", undefined, { query: { id: "t1" } }).json.topic.posts;
  put(h, "you.json", { active: "p1", personas: [{ id: "p1", name: "Vladyslav", hue: 30, about: "", picture: PIC }] });
  const posts = view(h);
  expect(posts[0].as).toEqual({ name: "Vladyslav", hue: 30, picture: PIC }); // the old post follows the active persona
  expect(posts[1].as).toEqual({ name: "Gone", hue: 50, picture: "" }); // its persona is gone: the stored name, no picture
  const none = makeHost();
  seedBoard(none);
  none.files.set("forum/topics/t1.json", h.files.get("forum/topics/t1.json")!);
  expect(view(none)[0].as).toBeNull(); // no persona: the screen says "You"
  expect(route(forum, none, "POST", "/forum/reply", { topic: "t1", text: "hi" }).json.ok).toBe(true);
  expect(get(none, "forum/topics/t1.json").posts.at(-1)).toMatchObject({ by: "me", name: "" });
});

test("messenger: the context window is Settings > Messenger, 24 when never set, bad values ignored", () => {
  const h = makeHost();
  expect(messenger.historyLimit(h.host.fs)).toBe(24);
  put(h, "settings.json", { messengerContext: 100 });
  expect(messenger.historyLimit(h.host.fs)).toBe(100);
  for (const bad of [3, 0, 501, "50", null, 12.5]) {
    put(h, "settings.json", { messengerContext: bad });
    expect(messenger.historyLimit(h.host.fs), String(bad)).toBe(24);
  }
  put(h, "settings.json", { messengerContext: 500 });
  expect(messenger.historyLimit(h.host.fs)).toBe(500);
  const msgs = Array.from({ length: 600 }, (_, i) => ({ id: "m" + i, who: i % 2 ? "them" : "me", at: i, text: "t" + i }));
  expect(messenger.historyFor(msgs).length).toBe(24);
  expect(messenger.historyFor(msgs, 10).length).toBe(10);
  expect(messenger.historyFor(msgs, 10).at(-1)!.content).toBe("t599");
  expect(messenger.historyFor(msgs, 500).length).toBe(500);
});

test("settings: messengerContext defaults to 24, is clamped to 4..500 and survives other patches", () => {
  const h = makeHost();
  expect(profiles.readSettings(h.host.fs).messengerContext).toBe(24);
  expect(route(profiles, h, "PUT", "/settings", { messengerContext: 120 }).json.settings.messengerContext).toBe(120);
  expect(route(profiles, h, "PUT", "/settings", { postsPerDay: 10 }).json.settings.messengerContext).toBe(120);
  expect(route(profiles, h, "PUT", "/settings", { messengerContext: 9999 }).json.settings.messengerContext).toBe(500);
  expect(route(profiles, h, "PUT", "/settings", { messengerContext: 1 }).json.settings.messengerContext).toBe(4);
});

test("a reply request carries as many messages as the window says", () => {
  const h = makeHost();
  const reqs: any[] = [];
  h.host.llm.request = (_k: string, r: any) => void reqs.push(r);
  const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
  put(h, "profiles/a.json", { id: "a", name: "Ada", hue: 100, voice: {}, schedule: always });
  put(h, "chats/a.json", { id: "a", messages: Array.from({ length: 60 }, (_, i) => ({ id: "m" + i, who: i % 2 ? "them" : "me", at: i + 1, text: "t" + i })), pending: null, failed: null, unread: false, shared: [] });
  // the note switched off: exactly the window
  put(h, "settings.json", { tzOffset: 0, messengerContext: 40, messengerSummary: false });
  route(messenger, h, "POST", "/messenger/send", { id: "a", text: "now" });
  expect(reqs[0].messages.length).toBe(40);
  put(h, "settings.json", { tzOffset: 0, messengerSummary: false });
  route(messenger, h, "POST", "/messenger/send", { id: "a", text: "again" });
  expect(reqs[1].messages.length).toBe(24);
  // the note on (the default): messages not yet folded into it stay, up to the window plus a third of it (#333)
  put(h, "settings.json", { tzOffset: 0, messengerContext: 40 });
  route(messenger, h, "POST", "/messenger/send", { id: "a", text: "third" });
  expect(reqs[2].messages.length).toBe(54);
});
