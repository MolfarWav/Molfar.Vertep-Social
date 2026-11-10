// One messenger chat per pair, a character and a persona (#366): the routes work on the chat of the active persona, a chat made before
// personas had their own goes to the persona that is active when it is first touched, replies and notes follow the chat's persona.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const life = await import(path.join(root, "plugins/life/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

function makeHost(results: Record<string, unknown> = {}) {
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
    llm: { results, request: (key: string, req: any) => void requests.push({ key, req }) },
    net: { results: {}, request: () => {} },
  };
  return { host, files, requests, results };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);
const always = (status: string) => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => status));
const NOW = 1_700_000_000_000;
const msg = (id: string, who: "me" | "them", at: number, text: string) => ({ id, who, at, text });
const call = (h: H, method: string, p: string, body?: unknown, extra: object = {}) => messenger.handleRoute({ method, path: p, ...(method === "GET" ? { query: body } : { body }), ...extra }, h.host);

function seed(persons: string[] = ["u1", "u2"], active = "u1", status = "off") {
  const h = makeHost();
  put(h, "profiles/mavka.json", { id: "mavka", name: "Mavka", hue: 150, source: "own", about: "Lives by the lake.", schedule: always(status) });
  if (persons.length) put(h, "you.json", { active, personas: persons.map((id) => ({ id, name: id === "u1" ? "Serhii" : "Oksana", about: "About " + id })) });
  return h;
}

test("each persona has a chat of its own with a character; switching persona switches the chat", () => {
  const h = seed();
  call(h, "POST", "/messenger/send", { id: "mavka", text: "Hi, it is Serhii" });
  expect(h.files.has("chats/mavka.u1.json")).toBe(true);
  expect(h.files.has("chats/mavka.json")).toBe(false);
  put(h, "you.json", { active: "u2", personas: [{ id: "u1", name: "Serhii", about: "" }, { id: "u2", name: "Oksana", about: "" }] });
  expect(call(h, "GET", "/messenger/chat", { id: "mavka" }).json.chat.messages).toEqual([]);
  call(h, "POST", "/messenger/send", { id: "mavka", text: "And I am Oksana" });
  expect(get(h, "chats/mavka.u2.json").messages.map((m: any) => m.text)).toEqual(["And I am Oksana"]);
  expect(get(h, "chats/mavka.u1.json").messages.map((m: any) => m.text)).toEqual(["Hi, it is Serhii"]);
  expect(call(h, "GET", "/messenger/chat", { id: "mavka" }).json.chat.persona).toBe("u2");
  // the contact list shows the active persona's chat
  const c = call(h, "GET", "/messenger/contacts").json.contacts[0];
  expect(c.line).toContain("Oksana");
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }, { id: "u2", name: "Oksana", about: "" }] });
  expect(call(h, "GET", "/messenger/contacts").json.contacts[0].line).toContain("Serhii");
});

test("a chat from before personas had their own goes to the persona active at first touch, once", () => {
  const h = seed(["u1", "u2"], "u2");
  put(h, "chats/mavka.json", { id: "mavka", messages: [msg("a", "me", NOW, "old words")], pending: null, failed: null, unread: false, shared: [] });
  const chat = call(h, "GET", "/messenger/chat", { id: "mavka" }).json.chat;
  expect(chat.messages.map((m: any) => m.text)).toEqual(["old words"]);
  expect(chat.persona).toBe("u2");
  expect(h.files.has("chats/mavka.json")).toBe(false);
  expect(get(h, "chats/mavka.u2.json").persona).toBe("u2");
  // the other persona starts empty
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }, { id: "u2", name: "Oksana", about: "" }] });
  expect(call(h, "GET", "/messenger/chat", { id: "mavka" }).json.chat.messages).toEqual([]);
});

test("without any persona the chat stays the plain file, and adopts nothing", () => {
  const h = seed([]);
  call(h, "POST", "/messenger/send", { id: "mavka", text: "hello" });
  expect(h.files.has("chats/mavka.json")).toBe(true);
  expect(messenger.activePersonaId(h.host.fs)).toBe("");
  // the first persona that appears takes it
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }] });
  expect(call(h, "GET", "/messenger/chat", { id: "mavka" }).json.chat.messages).toHaveLength(1);
  expect(h.files.has("chats/mavka.u1.json")).toBe(true);
});

test("a reply is asked and filed in the chat it belongs to, whoever is active by then, and names that persona", () => {
  const h = seed(["u1", "u2"], "u1", "online");
  put(h, "chats/mavka.u2.json", { id: "mavka", persona: "u2", messages: [msg("a", "me", NOW - 1000, "from Oksana")], pending: { at: NOW - 1000, dueAt: NOW - 500 }, failed: null, unread: false, shared: [] });
  messenger.onTick({}, h.host);
  const asked = h.requests.find((r) => r.key.startsWith("rep:"))!;
  expect(asked.key).toBe("rep:mavka:u2");
  expect(asked.req.systemPrompt).toContain("Oksana");
  expect(asked.req.systemPrompt).not.toContain("Serhii");
  h.requests.length = 0;
  h.results["rep:mavka:u2"] = { text: "Hello, Oksana." };
  messenger.onTick({}, h.host);
  const chat = get(h, "chats/mavka.u2.json");
  expect(chat.messages.at(-1)).toMatchObject({ who: "them", text: "Hello, Oksana." });
  expect(chat.unread).toBe(true);
  expect(h.files.has("chats/mavka.u1.json")).toBe(false);
});

test("the route's second pass files into the persona the first pass was asked for", () => {
  const h = seed(["u1", "u2"], "u1", "online");
  const first = call(h, "POST", "/messenger/send", { id: "mavka", text: "ping" });
  expect(first.__llmPending).toBe(true);
  expect(first.stash.persona).toBe("u1");
  // the user switches persona while the model is writing
  put(h, "you.json", { active: "u2", personas: [{ id: "u1", name: "Serhii", about: "" }, { id: "u2", name: "Oksana", about: "" }] });
  h.results.reply = { text: "pong" };
  call(h, "POST", "/messenger/send", { id: "mavka", text: "ping" }, { stash: first.stash });
  expect(get(h, "chats/mavka.u1.json").messages.map((m: any) => m.text)).toEqual(["ping", "pong"]);
  expect(h.files.has("chats/mavka.u2.json")).toBe(false);
});

test("a character writes first only to the active persona", () => {
  const h = seed(["u1", "u2"], "u2", "online");
  put(h, "settings.json", { tzOffset: 0, quietFrom: "00:00", quietTo: "00:00", messengerFirst: true, messengerPerDay: 5, messengerQuiet: "own" });
  put(h, "life/diary/mavka.json", { entries: [{ id: "e1", at: NOW - 60000, day: "2023-11-14", text: "Found a stone.", kind: "routine", by: "model" }], mood: "calm", plan: "", lastDay: "2023-11-14" });
  const plan = messenger.planFirst(h.host.fs, NOW, () => 0);
  expect(plan.persona).toBe("u2");
  expect(plan.profile.id).toBe("mavka");
});

test("a persona's chat is the memory the forum uses for that persona's posts", () => {
  const h = seed();
  put(h, "chats/mavka.u1.json", { id: "mavka", persona: "u1", messages: [], summary: { text: "Serhii plays bass.", upto: 1, at: 1 } });
  put(h, "chats/mavka.u2.json", { id: "mavka", persona: "u2", messages: [], summary: { text: "Oksana paints.", upto: 1, at: 1 } });
  expect(forum.chatNote(h.host.fs, { id: "mavka" }, "u2")).toContain("Oksana paints");
  expect(forum.chatNote(h.host.fs, { id: "mavka" }, "u1")).toContain("Serhii plays bass");
  expect(forum.chatNote(h.host.fs, { id: "mavka" })).toContain("Serhii plays bass"); // the active one
});

test("the people list counts the chats of every persona, each under its own persona", () => {
  const h = seed();
  put(h, "chats/mavka.u1.json", { id: "mavka", persona: "u1", messages: [msg("a", "me", NOW, "thanks, great"), msg("b", "them", NOW + 1, "glad")] });
  put(h, "chats/mavka.u2.json", { id: "mavka", persona: "u2", messages: [msg("c", "me", NOW, "hello")] });
  put(h, "settings.json", {});
  const events = [
    ...life.chatEvents(get(h, "chats/mavka.u1.json"), { key: "u:u1", name: "Serhii" }, 0),
    ...life.chatEvents(get(h, "chats/mavka.u2.json"), { key: "u:u2", name: "Oksana" }, 0),
  ];
  expect(new Set(events.map((e: any) => e.key))).toEqual(new Set(["u:u1", "u:u2"]));
});

test("deleting a persona deletes its chats and its entries in the lists; deleting a character deletes all its chats", () => {
  const h = seed();
  put(h, "chats/mavka.u1.json", { id: "mavka", messages: [] });
  put(h, "chats/mavka.u2.json", { id: "mavka", messages: [] });
  put(h, "life/people/mavka.json", { scanned: 0, people: [{ key: "u:u1", name: "Serhii" }, { key: "u:u2", name: "Oksana" }] });
  profiles.handleRoute({ method: "DELETE", path: "/you/u2" }, h.host);
  expect(h.files.has("chats/mavka.u2.json")).toBe(false);
  expect(h.files.has("chats/mavka.u1.json")).toBe(true);
  expect(get(h, "life/people/mavka.json").people.map((p: any) => p.key)).toEqual(["u:u1"]);
  profiles.handleRoute({ method: "DELETE", path: "/profiles/mavka" }, h.host);
  expect(h.files.has("chats/mavka.u1.json")).toBe(false);
});

test("clearing the personas in Start over takes their chats; clearing the chats takes them all", () => {
  const h = seed();
  put(h, "chats/mavka.u1.json", { id: "mavka", messages: [] });
  put(h, "chats/mavka.json", { id: "mavka", messages: [] });
  profiles.resetData(h.host.fs, ["personas"]);
  expect(h.files.has("chats/mavka.u1.json")).toBe(false);
  expect(h.files.has("chats/mavka.json")).toBe(true);
});

test("the forum copies of the persona readers match the messenger's", () => {
  for (const name of ["youOf", "activePersonaId"]) expect(String(forum[name]), name).toBe(String(messenger[name]));
});
