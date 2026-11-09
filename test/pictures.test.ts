import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fitSize } from "../src/screens/profiles/picture-api";

// Pictures in messages and posts (issue #331): the shared plugin block, the messenger and forum routes, settings and the profile's model.
const root = path.resolve(import.meta.dir, "..");
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
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
  const host: any = { fs: fsx, llm: { results: {} as Record<string, unknown>, request: (key: string, req: any) => void requests.push({ key, req }) } };
  return { files, requests, host };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const seed = (h: H, extra: Record<string, unknown> = {}) => put(h, "profiles/a.json", { id: "a", name: "Ada", hue: 100, about: "A painter.", interests: [], habits: [], voice: { length: 1, emoji: 0 }, schedule: always, forum: { frequency: 50 }, ...extra });
const settings = (h: H, patch: Record<string, unknown> = {}) => put(h, "settings.json", { tzOffset: 0, ...patch });
const route = (mod: any, h: H, method: string, p: string, body?: unknown, extra: object = {}) => mod.handleRoute({ method, path: p, body, ...extra }, h.host);

const GOOD = "/v1/assets/abc123";

test("the messenger and the forum carry the same pictures block", () => {
  const block = (f: string) => /\/\/ <images-shared>[\s\S]*?\/\/ <\/images-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8"))?.[0];
  expect(block("plugins/messenger/plugin.js")).toBeTruthy();
  expect(block("plugins/forum/plugin.js")).toBe(block("plugins/messenger/plugin.js"));
});

test("cleanImage: ready needs an engine asset URL; pending and failed keep a short prompt; the rest is dropped", () => {
  const c = messenger.cleanImage;
  expect(c({ url: GOOD, alt: " a  lake ", gen: true })).toEqual({ state: "ready", url: GOOD, alt: "a lake", gen: true });
  expect(c({ state: "ready", url: GOOD })).toEqual({ state: "ready", url: GOOD });
  expect(c({ url: "https://evil.example/x.png" })).toBeNull();
  expect(c({ url: "/v1/assets/../etc" })).toBeNull();
  expect(c({ state: "pending", prompt: "a lake", url: "https://evil.example/x.png" })).toEqual({ state: "pending", prompt: "a lake", gen: true });
  expect(c({ state: "failed", prompt: "x".repeat(900) })?.prompt.length).toBe(400);
  expect(c({ state: "pending", prompt: " " })).toBeNull();
  expect(c("x")).toBeNull();
});

test("takeImageMarker cuts the marker out of any reply, in either case", () => {
  const t = messenger.takeImageMarker;
  expect(t("Look at this.\n[[image: a lake at dusk]]")).toEqual({ text: "Look at this.", prompt: "a lake at dusk" });
  expect(t("[[ IMAGE : cat ]] hi")).toEqual({ text: "hi", prompt: "cat" });
  expect(t("no marker")).toEqual({ text: "no marker", prompt: "" });
  expect(t("a [[image: x]] b")).toEqual({ text: "a b", prompt: "" }); // too short to draw from: cut out, no picture
});

test("messenger: a user picture goes in with or without text; only an engine asset is taken", () => {
  const h = makeHost();
  seed(h);
  settings(h);
  const bad = route(messenger, h, "POST", "/messenger/send", { id: "a", text: "", image: { url: "https://evil.example/x.png" } });
  expect(bad.status).toBe(400);
  const first = route(messenger, h, "POST", "/messenger/send", { id: "a", text: "", image: { url: GOOD, alt: "my cat", gen: false } });
  expect(first.__llmPending).toBe(true);
  const chat = get(h, "chats/a.json");
  expect(chat.messages[0]).toMatchObject({ who: "me", text: "", image: { state: "ready", url: GOOD, alt: "my cat" } });
  // the model is never shown the picture, only that one was sent
  expect(h.requests[0]!.req.messages[0].content).toBe("[a picture: my cat]");
});

test("messenger: characters send pictures only when the switch is on, within the daily cap; the marker never shows as text", () => {
  // off: the marker is cut out, no picture, no hint in the prompt
  const off = makeHost();
  seed(off);
  settings(off);
  route(messenger, off, "POST", "/messenger/send", { id: "a", text: "hi" });
  expect(off.requests[0]!.req.systemPrompt).not.toContain("[[image:");
  off.host.llm.results = { reply: { text: "Hello! [[image: a lake at dusk]]" } };
  const r0 = route(messenger, off, "POST", "/messenger/send", { id: "a", text: "hi" }, { stash: { sent: true } });
  expect(r0.json.chat.messages.at(-1)).toMatchObject({ who: "them", text: "Hello!" });
  expect(r0.json.chat.messages.at(-1).image).toBeUndefined();

  // on, one a day
  const h = makeHost();
  seed(h);
  settings(h, { images: { on: true, perDay: 1 } });
  route(messenger, h, "POST", "/messenger/send", { id: "a", text: "hi" });
  expect(h.requests[0]!.req.systemPrompt).toContain("[[image:");
  h.host.llm.results = { reply: { text: "Look! [[image: a lake at dusk]]" } };
  const r1 = route(messenger, h, "POST", "/messenger/send", { id: "a", text: "hi" }, { stash: { sent: true } });
  const sent = r1.json.chat.messages.at(-1);
  expect(sent).toMatchObject({ who: "them", text: "Look!", image: { state: "pending", prompt: "a lake at dusk", gen: true } });
  // the cap is used up: no hint, and a second marker is cut out without a picture
  h.host.llm.results = {};
  route(messenger, h, "POST", "/messenger/send", { id: "a", text: "more" });
  expect(h.requests.at(-1)!.req.systemPrompt).not.toContain("[[image:");
  h.host.llm.results = { reply: { text: "Again [[image: another one]]" } };
  const r2 = route(messenger, h, "POST", "/messenger/send", { id: "a", text: "more" }, { stash: { sent: true } });
  expect(r2.json.chat.messages.at(-1)).toMatchObject({ text: "Again" });
  expect(r2.json.chat.messages.at(-1).image).toBeUndefined();
  // a reply that is only a picture is a reply
  const solo = makeHost();
  seed(solo);
  settings(solo, { images: { on: true, perDay: 2 } });
  solo.host.llm.results = { reply: { text: "[[image: a cat on a roof]]" } };
  const r3 = route(messenger, solo, "POST", "/messenger/send", { id: "a", text: "show me" }, { stash: { sent: true } });
  expect(r3.json.chat.messages.at(-1)).toMatchObject({ text: "", image: { state: "pending" } });
});

test("messenger: the page draws a waiting picture and files it; the model is the character's own, else Settings, else the engine's", () => {
  const h = makeHost();
  seed(h, { imageModel: "p/own-image" });
  settings(h, { images: { on: true, perDay: 3 }, models: { image: "p/app-image" } });
  h.host.llm.results = { reply: { text: "Look [[image: a lake]]" } };
  route(messenger, h, "POST", "/messenger/send", { id: "a", text: "hi" }, { stash: { sent: true } });
  const items = route(messenger, h, "GET", "/messenger/images").json.items;
  expect(items).toEqual([{ id: "a", messageId: expect.any(String), prompt: "a lake", model: "p/own-image" }]);
  // no own model: Settings; none: the engine's default
  seed(h);
  expect(route(messenger, h, "GET", "/messenger/images").json.items[0].model).toBe("p/app-image");
  settings(h, { images: { on: true, perDay: 3 } });
  expect(route(messenger, h, "GET", "/messenger/images").json.items[0].model).toBe("");
  const { id, messageId } = items[0];
  expect(route(messenger, h, "POST", "/messenger/image", { id, messageId: "nope", url: GOOD }).status).toBe(404);
  expect(route(messenger, h, "POST", "/messenger/image", { id, messageId, url: "https://evil.example/x.png" }).json.image.state).toBe("failed");
  expect(route(messenger, h, "GET", "/messenger/images").json.items).toEqual([]);
  // a filed picture is filed once
  expect(route(messenger, h, "POST", "/messenger/image", { id, messageId, url: GOOD }).status).toBe(404);

  const h2 = makeHost();
  seed(h2);
  settings(h2, { images: { on: true, perDay: 3 } });
  h2.host.llm.results = { reply: { text: "Look [[image: a lake]]" } };
  route(messenger, h2, "POST", "/messenger/send", { id: "a", text: "hi" }, { stash: { sent: true } });
  const w = route(messenger, h2, "GET", "/messenger/images").json.items[0];
  const done = route(messenger, h2, "POST", "/messenger/image", { id: "a", messageId: w.messageId, url: GOOD });
  expect(done.json.image).toEqual({ state: "ready", url: GOOD, alt: "a lake", gen: true });
  expect(route(messenger, h2, "GET", "/messenger/chat?id=a", undefined, { query: { id: "a" } }).json.chat.messages.at(-1).image.state).toBe("ready");
});

const seedTopic = (h: H) => {
  put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Art", desc: "" }] }] });
  put(h, "forum/topics/t1.json", { id: "t1", board: "b1", title: "Hello", by: "me", name: "", hue: 200, createdAt: 1, lastAt: 1, locked: false, unread: false, owe: 0, posts: [{ id: "p1", by: "me", name: "", hue: 200, at: 1, text: "Hi all" }] });
};

test("forum: the user attaches a picture to a topic and a reply; a character's marker becomes a waiting picture within the cap", () => {
  const h = makeHost();
  seed(h);
  settings(h, { images: { on: true, perDay: 1 } });
  seedTopic(h);
  expect(route(forum, h, "POST", "/forum/reply", { topic: "t1", text: "", image: { url: "https://evil.example/x.png" } }).status).toBe(400);
  expect(route(forum, h, "POST", "/forum/reply", { topic: "t1", text: "", image: { url: GOOD, alt: "mine" } }).json.ok).toBe(true);
  const nt = route(forum, h, "POST", "/forum/topic", { board: "b1", title: "With picture", text: "", image: { url: GOOD } });
  expect(get(h, `forum/topics/${nt.json.topic}.json`).posts[0].image).toEqual({ state: "ready", url: GOOD });
  expect(get(h, "forum/topics/t1.json").posts[1].image.url).toBe(GOOD);

  const boards = forum.readBoards(h.host.fs);
  const now = Date.now();
  const f = { kind: "reply", author: "a", topic: "t1", quote: "" };
  const a = forum.fileResult(h.host.fs, f, { text: "Painted this [[image: a lake at dusk]]" }, now, boards);
  expect(a.post).toMatchObject({ text: "Painted this", image: { state: "pending", prompt: "a lake at dusk", gen: true } });
  // cap used up: the marker is cut out, no second picture
  const b = forum.fileResult(h.host.fs, f, { text: "And again [[image: more]]" }, now + 1, boards);
  expect(b.post.text).toBe("And again");
  expect(b.post.image).toBeUndefined();
  // the page draws it and files it
  const items = route(forum, h, "GET", "/forum/images").json.items;
  expect(items).toEqual([{ topic: "t1", post: a.post.id, prompt: "a lake at dusk", model: "" }]);
  expect(route(forum, h, "POST", "/forum/image", { topic: "t1", post: a.post.id, url: GOOD }).json.image).toEqual({ state: "ready", url: GOOD, alt: "a lake at dusk", gen: true });
  expect(route(forum, h, "GET", "/forum/images").json.items).toEqual([]);
  expect(route(forum, h, "POST", "/forum/image", { topic: "t1", post: a.post.id, url: GOOD }).status).toBe(404);
});

test("forum: a new topic may carry a picture in the JSON answer when allowed; the prompt asks for it only then", () => {
  const on = makeHost();
  seed(on);
  settings(on, { images: { on: true, perDay: 2 } });
  seedTopic(on);
  const boards = forum.readBoards(on.host.fs);
  const topic = forum.fileResult(on.host.fs, { kind: "topic", author: "a", board: "b1", ref: "" }, { text: JSON.stringify({ title: "My lake", text: "Come and see.", image: "a lake at dusk" }) }, Date.now(), boards);
  expect(topic.post).toMatchObject({ text: "Come and see.", image: { state: "pending", prompt: "a lake at dusk" } });
  expect(forum.newTopicContext({ name: "Art", desc: "" }, [], "", true)).toContain('"image"');
  expect(forum.newTopicContext({ name: "Art", desc: "" }, [], "", false)).not.toContain('"image"');
  const off = makeHost();
  seed(off);
  settings(off);
  seedTopic(off);
  const t2 = forum.fileResult(off.host.fs, { kind: "topic", author: "a", board: "b1", ref: "" }, { text: JSON.stringify({ title: "My pond", text: "Come and see.", image: "a pond" }) }, Date.now(), forum.readBoards(off.host.fs));
  expect(t2.post.image).toBeUndefined();
  // history lines: a picture is one short line, never the picture
  expect(forum.systemPromptFor({ name: "Ada", interests: [], habits: [], voice: {}, about: "" }, "", { images: true })).toContain("[[image:");
  expect(forum.systemPromptFor({ name: "Ada", interests: [], habits: [], voice: {}, about: "" }, "")).not.toContain("[[image:");
});

test("settings and profiles: Pictures switch, per-day cap, image model, and a profile's own image model", () => {
  const h = makeHost();
  expect(profiles.readSettings(h.host.fs).images).toEqual({ on: false, perDay: 2 });
  expect(profiles.readSettings(h.host.fs).models.image).toBe("");
  const put1 = route(profiles, h, "PUT", "/settings", { images: { on: true, perDay: 99 }, models: { image: "p/draw" } });
  expect(put1.json.settings.images).toEqual({ on: true, perDay: 20 });
  expect(put1.json.settings.models.image).toBe("p/draw");
  // a later patch of another key keeps them
  expect(route(profiles, h, "PUT", "/settings", { postsPerDay: 10 }).json.settings.images).toEqual({ on: true, perDay: 20 });
  expect(route(profiles, h, "PUT", "/settings", { models: { messenger: "p/x" } }).json.settings.models.image).toBe("p/draw");
  expect(route(profiles, h, "PUT", "/settings", { images: { on: "yes", perDay: -3 } }).json.settings.images).toEqual({ on: true, perDay: 0 });
  const p = route(profiles, h, "PUT", "/profiles/a", { name: "Ada", imageModel: "p/own", model: "" });
  expect(p.json.profile.imageModel).toBe("p/own");
  expect(route(profiles, h, "PUT", "/profiles/a", { name: "Ada", imageModel: "has space" }).json.profile.imageModel).toBe("");
  expect(route(profiles, h, "PUT", "/profiles/a", { name: "Ada", imageModel: "default" }).json.profile.imageModel).toBe("");
});

test("an uploaded picture is scaled to 768 px, never enlarged", () => {
  expect(fitSize(1536, 768)).toEqual({ w: 768, h: 384 });
  expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 });
});
