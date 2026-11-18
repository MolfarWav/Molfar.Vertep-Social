// Issue #446, M2: what a reply remembered (`message.used`) and pinned messages (`message.pinned`).
import { expect, test } from "bun:test";
import path from "node:path";

const plugin = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
  const results: Record<string, unknown> = {};
  const host = {
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => void files.delete(p),
      list: (d: string) => {
        const out = [...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1));
        if (!out.length) throw new Error("ENOENT");
        return out.sort();
      },
    },
    llm: { results, request: (key: string, req: any) => void requests.push({ key, req }) },
  };
  return { host, files, requests, results };
}
type H = ReturnType<typeof makeHost>;

const online = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const BASE = Date.now() - 3 * 86400_000;
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "m" + i, who: i % 2 === 0 ? "me" : "them", at: BASE + i * 60000, text: "line " + i }));
function seed(h: H, chat: object = {}, settings: object = { messengerContext: 12 }) {
  h.files.set("profiles/mavka.json", JSON.stringify({ id: "mavka", name: "Mavka", hue: 150, source: "own", about: "Lives by the lake.", schedule: online }));
  h.files.set("chats/mavka.json", JSON.stringify({ id: "mavka", messages: msgs(30), pending: null, failed: null, unread: false, shared: [], ...chat }));
  h.files.set("settings.json", JSON.stringify(settings));
}
const readChat = (h: H) => JSON.parse(h.files.get("chats/mavka.json")!);
const route = (h: H, p: string, body?: unknown, extra: object = {}) => plugin.handleRoute({ method: "POST", path: p, body, ...extra }, h.host);
const F = (id: string, text: string, extra: object = {}) => ({ id, text, kind: "about_you", at: BASE, from: BASE, private: true, pinned: false, by: "model", ...extra });
const chatOf = (h: H) => ({ ...readChat(h), breaks: readChat(h).breaks ?? [] });

/** Sends a message and answers it; returns the reply message. */
function converse(h: H, text = "hello again") {
  const sent = route(h, "/messenger/send", { id: "mavka", text });
  expect(sent.__llmPending).toBe(true);
  h.results.reply = { text: "Hi there!" };
  route(h, "/messenger/send", { id: "mavka", text }, { stash: sent.stash });
  delete h.results.reply;
  return readChat(h).messages.at(-1);
}

test("a reply records what went into its prompt: fact ids, the note, pinned messages; the pending record is gone", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv."), F("f2", "Rehearsals are on Thursday.")], summary: { text: "They get on well.", upto: BASE + 5 * 60000, at: 1 }, messages: msgs(30).map((m, i) => (i === 2 ? { ...m, pinned: BASE } : m)) });
  const reply = converse(h);
  expect(reply.who).toBe("them");
  expect(reply.used).toEqual({ f: ["f1", "f2"], p: ["m2"], n: 1 });
  expect(readChat(h).pending).toBeNull();
  // the same ids reach the prompt
  const prompt = h.requests.at(-1)!.req.systemPrompt;
  expect(prompt).toContain("- Serhii lives in Lviv.");
  expect(prompt).toContain('"line 2"');
});

test("a reply that used nothing has no `used`", () => {
  const h = makeHost();
  seed(h, { messages: msgs(4) });
  const reply = converse(h);
  expect(reply.used).toBeUndefined();
});

test("a reply made by the tick (the user was away) records it too", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv.")], pending: { at: BASE, dueAt: BASE }, messages: msgs(5).slice(0, 5) });
  plugin.onTick({}, h.host);
  const asked = h.requests.at(-1)!;
  expect(asked.key.startsWith("rep:")).toBe(true);
  expect(readChat(h).pending.used).toEqual({ f: ["f1"] });
  h.results[asked.key] = { text: "Back now." };
  plugin.onTick({}, h.host);
  expect(readChat(h).messages.at(-1).used).toEqual({ f: ["f1"] });
});

test("a stored `used` is cleaned on read: odd ids are dropped, lists capped", () => {
  const h = makeHost();
  seed(h, { messages: [{ id: "a", who: "them", at: BASE, text: "x", used: { f: ["f1", "nope", "<b>"], r: ["a", "b", "c", "d", "e"], p: [], n: 1 } }, { id: "b", who: "them", at: BASE + 1, text: "y", used: { f: ["zz"] } }] });
  const chat = route(h, "/messenger/chat", undefined, { method: "GET", query: { id: "mavka" } }).json.chat;
  expect(chat.messages[0].used).toEqual({ f: ["f1"], r: ["a", "b", "c"], n: 1 });
  expect(chat.messages[1].used).toBeUndefined();
});

test("pin and unpin: only a message with text, at most 20, the chat view carries the time", () => {
  const h = makeHost();
  seed(h, { messages: [...msgs(24), { id: "pic", who: "them", at: BASE + 99999, text: "", image: { state: "ready", url: "/v1/assets/abc" } }] });
  const pin = (messageId: string, pinned = true) => route(h, "/messenger/pin", { id: "mavka", messageId, pinned });
  const r = pin("m3");
  expect(r.json.chat.messages.find((m: any) => m.id === "m3").pinned).toBeGreaterThan(0);
  expect(pin("m3", false).json.chat.messages.find((m: any) => m.id === "m3").pinned).toBeUndefined();
  expect(pin("pic").status).toBe(400);
  expect(pin("nope").status).toBe(404);
  expect(route(h, "/messenger/pin", { id: "mavka", messageId: "m3" }).status).toBe(400);
  expect(route(h, "/messenger/pin", { id: "ghost", messageId: "m3", pinned: true }).status).toBe(404);
  for (let i = 0; i < 20; i++) expect(pin("m" + i).status).toBe(200);
  expect(pin("m20").status).toBe(400);
  // pinning one that is already pinned is not "one more"
  expect(pin("m5").status).toBe(200);
});

test("pinned messages go into the prompt: after the last divider, not in the window, the latest five, oldest first, with Recall off", () => {
  const h = makeHost();
  const t = (i: number) => BASE + i * 60000;
  const messages = msgs(40).map((m, i) => ({ ...m, ...([1, 2, 3, 4, 5, 6, 33].includes(i) ? { pinned: BASE + i } : {}) }));
  seed(h, { messages, breaks: [t(1) + 1] }, { messengerContext: 12, messengerRecall: false });
  const pins = plugin.pinnedFor(h.host.fs, chatOf(h));
  // 1 is before the divider; 33 is in the window (the last 12 + slack); 2..6 are the five that count
  expect(pins.map((x: any) => x.id)).toEqual(["m2", "m3", "m4", "m5", "m6"]);
  expect(pins[0].text).toBe("line 2");
  expect(pins[0].when).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  // six pinned outside the window: only the latest five
  const more = msgs(40).map((m, i) => ({ ...m, ...(i >= 1 && i <= 7 ? { pinned: BASE + i } : {}) }));
  seed(h, { messages: more }, { messengerContext: 12 });
  expect(plugin.pinnedFor(h.host.fs, chatOf(h)).map((x: any) => x.id)).toEqual(["m3", "m4", "m5", "m6", "m7"]);
  // the prompt names them as quotes
  const sent = route(h, "/messenger/send", { id: "mavka", text: "again" });
  expect(sent.__llmPending).toBe(true);
  const prompt = h.requests.at(-1)!.req.systemPrompt;
  expect(prompt).toContain("Messages the person asked you to keep in mind");
  expect(prompt).toContain('"line 3"');
  expect(prompt).not.toContain('"line 2"');
});

test("pinned messages work with the note switched off, are cut and cost at most 900 characters", () => {
  const h = makeHost();
  const messages = msgs(40).map((m, i) => ({ ...m, text: i >= 1 && i <= 5 ? "<b>" + "word ".repeat(120) + "</b>" : m.text, ...(i >= 1 && i <= 5 ? { pinned: BASE + i } : {}) }));
  seed(h, { messages }, { messengerContext: 12, messengerSummary: false });
  const pins = plugin.pinnedFor(h.host.fs, chatOf(h));
  expect(pins.length).toBeGreaterThan(0);
  expect(pins.every((x: any) => !/[<>]/.test(x.text) && x.text.length <= 280)).toBe(true);
  expect(pins.reduce((n: number, x: any) => n + x.text.length + x.when.length + 16, 0)).toBeLessThanOrEqual(900);
});

test("a pinned message is not quoted twice: recall skips it", () => {
  const h = makeHost();
  const messages = msgs(60).map((m, i) => (i === 3 ? { ...m, text: "my cat Barsyk eats only fish", pinned: BASE } : i === 5 ? { ...m, text: "Barsyk loves fish too and salmon" } : m));
  seed(h, { messages }, { messengerContext: 12, messengerRecall: true });
  const out = plugin.recallFor(h.host.fs, { ...chatOf(h), messages: [...chatOf(h).messages.slice(0, 58), { id: "q1", who: "me", at: BASE + 58 * 60000, text: "what does Barsyk eat, fish" }, { id: "q2", who: "me", at: BASE + 59 * 60000, text: "Barsyk fish" }] }, null);
  expect(out.some((x: any) => x.id === "m3")).toBe(false);
  expect(out.every((x: any) => typeof x.id === "string")).toBe(true);
});
