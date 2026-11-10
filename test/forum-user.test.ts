// Issue #336: a forum reply sees how well the character knows the user and, when it answers the user's own post, the memory note of their chat.
import { expect, test } from "bun:test";
import path from "node:path";

const forum = await import(path.resolve(import.meta.dir, "../plugins/forum/plugin.js"));
const messenger = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
  const host = {
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
    llm: { results: {} as Record<string, unknown>, request: (key: string, req: any) => void requests.push({ key, req }) },
  };
  return { host, files, requests };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const NOTE = "Mavka promised Serhii a playlist by Friday. Serhii has a dog called Barsyk and moved to Kyiv.";

function seed(h: H, opts: { profile?: object; settings?: object; note?: string | null; you?: object | null } = {}) {
  put(h, "profiles/mavka.json", { id: "mavka", name: "Mavka", hue: 150, about: "Lives by the lake.", interests: ["reeds"], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true }, ...opts.profile });
  put(h, "settings.json", { tzOffset: 0, autonomous: true, models: { forum: "" }, ...opts.settings });
  put(h, "forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Guest", desc: "Hello" }] }] });
  if (opts.note !== null) put(h, "chats/mavka.json", { id: "mavka", messages: [], summary: { text: opts.note ?? NOTE, upto: 5, at: 6 } });
  if (opts.you !== null) put(h, "you.json", opts.you ?? { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "Plays bass." }] });
}
const post = (id: string, by: string, name: string, text: string, at: number) => ({ id, by, name, hue: 150, at, text });
function topicOf(posts: any[]) {
  return { id: "t1", board: "b1", title: "Topic one", by: posts[0].by, name: posts[0].name, hue: 150, createdAt: 1, lastAt: posts.at(-1).at, locked: false, unread: false, owe: 0, posts };
}
const author = (h: H) => forum.loadProfiles(h.host.fs)[0];

test("youOf and knowsOf are the messenger's, copied", () => {
  for (const name of ["youOf", "knowsOf", "activePersonaId"]) expect(String(forum[name]), name).toBe(String(messenger[name]));
});

test("the user is not in the conversation: nothing is added", () => {
  const h = makeHost();
  seed(h);
  const t = topicOf([post("a", "x9", "Other", "Hello", 10), post("b", "x8", "Another", "Hi", 11)]);
  expect(forum.userKnownTo(h.host.fs, author(h), t, t.posts[1])).toBeNull();
});

test("knows: the persona's name and About, and the note when the reply answers the user's post", () => {
  const h = makeHost();
  seed(h);
  const t = topicOf([post("a", "x9", "Other", "Hello", 10), post("b", "me", "Serhii", "Anyone here?", 11)]);
  const u = forum.userKnownTo(h.host.fs, author(h), t, t.posts[1]);
  expect(u).toEqual({ label: "Serhii", name: "Serhii", about: "Plays bass.", note: NOTE });
  // answering another character in a topic where the user wrote: the name, but the private note stays out
  const t2 = topicOf([post("b", "me", "Serhii", "Anyone here?", 10), post("a", "x9", "Other", "Hello", 11)]);
  expect(forum.userKnownTo(h.host.fs, author(h), t2, t2.posts[1])).toEqual({ label: "Serhii", name: "Serhii", about: "Plays bass.", note: "" });
});

test("name only drops the About and keeps the note, a stranger gets neither name, About nor note", () => {
  const t = topicOf([post("b", "me", "Serhii", "Anyone here?", 10)]);
  const named = makeHost();
  seed(named, { profile: { knows: "name" } });
  expect(forum.userKnownTo(named.host.fs, author(named), t, t.posts[0])).toEqual({ label: "Serhii", name: "Serhii", about: "", note: NOTE });
  const stranger = makeHost();
  seed(stranger, { settings: { messengerKnows: "stranger" } });
  expect(forum.userKnownTo(stranger.host.fs, author(stranger), t, t.posts[0])).toEqual({ label: "", name: "", about: "", note: "" });
  // the profile's own choice wins over Settings
  const own = makeHost();
  seed(own, { profile: { knows: "knows" }, settings: { messengerKnows: "stranger" } });
  expect(forum.userKnownTo(own.host.fs, author(own), t, t.posts[0]).name).toBe("Serhii");
});

test("no note: the messenger's switch is off, the chat has none, or there is no chat", () => {
  const t = topicOf([post("b", "me", "Serhii", "Anyone here?", 10)]);
  for (const o of [{ settings: { messengerSummary: false } }, { note: "" }, { note: null }]) {
    const h = makeHost();
    seed(h, o);
    expect(forum.userKnownTo(h.host.fs, author(h), t, t.posts[0]).note).toBe("");
  }
});

test("the prompt: the name and note for a character that knows the user, 'User' and a hint for a stranger, nothing without the user", () => {
  const h = makeHost();
  seed(h);
  const t = topicOf([post("b", "me", "Serhii", "Anyone here?", 10)]);
  const user = forum.userKnownTo(h.host.fs, author(h), t, t.posts[0]);
  const sys = forum.systemPromptFor(author(h), "", { user });
  expect(sys).toContain("writes on this forum as Serhii");
  expect(sys).toContain("Plays bass.");
  expect(sys).toContain(NOTE);
  expect(sys).toContain("do not quote it");
  const ctx = forum.replyContext({ name: "Guest", desc: "" }, t, t.posts[0], user.label);
  expect(ctx).toContain("Serhii: Anyone here?");
  expect(ctx).toContain("You are answering Serhii's post");

  const st = makeHost();
  seed(st, { profile: { knows: "stranger" } });
  const su = forum.userKnownTo(st.host.fs, author(st), t, t.posts[0]);
  const ssys = forum.systemPromptFor(author(st), "", { user: su });
  expect(ssys).not.toContain("Serhii");
  expect(ssys).toContain("do not guess their name");
  expect(ssys).not.toContain("private chats");
  expect(forum.replyContext({ name: "Guest", desc: "" }, t, t.posts[0], su.label)).toContain("User: Anyone here?");

  const plain = forum.systemPromptFor(author(h), "", {});
  expect(plain).not.toContain("writes on this forum as");
  expect(forum.systemPromptFor(author(h), "")).toBe(plain);
});

test("end to end: 'Write now' on the user's topic sends the name and the note, a new topic sends neither", () => {
  const h = makeHost();
  seed(h);
  put(h, "forum/topics/t1.json", topicOf([post("b", "me", "Serhii", "Anyone here?", Date.now() - 1000)]));
  let out: any = forum.handleRoute({ method: "POST", path: "/forum/force", body: { topic: "t1" } }, h.host);
  expect(out.__llmPending).toBe(true);
  const reply = h.requests.splice(0)[0].req;
  expect(reply.systemPrompt).toContain("Serhii");
  expect(reply.systemPrompt).toContain("Barsyk");
  expect(reply.messages[0].content).toContain("Serhii: Anyone here?");

  const h2 = makeHost();
  seed(h2);
  out = forum.handleRoute({ method: "POST", path: "/forum/force", body: { board: "b1", kind: "topic" } }, h2.host);
  const sent = h2.requests.splice(0).map((r) => r.req.systemPrompt).join("\n");
  expect(sent).not.toContain("Barsyk");
});
