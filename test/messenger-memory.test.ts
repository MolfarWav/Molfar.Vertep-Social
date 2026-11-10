// Issue #333: the memory note, new conversations, how well a character knows the user, OOC.
import { expect, test } from "bun:test";
import path from "node:path";

const plugin = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));

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

const always = (status: string) => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => status));
const BASE = 1_700_000_000_000;
/** n messages, alternating me and them, one minute apart, the first at BASE. */
const msgs = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: "m" + (from + i), who: i % 2 === 0 ? "me" : "them", at: BASE + (from + i) * 60000, text: "line " + (from + i) }));

function seed(h: H, opts: { messages?: any[]; chat?: object; profile?: object; settings?: object; you?: object } = {}) {
  h.files.set("profiles/mavka.json", JSON.stringify({ id: "mavka", name: "Mavka", hue: 150, source: "own", about: "Lives by the lake.", schedule: always("off"), ...opts.profile }));
  // with a persona the chat is the pair's, as the plugin stores it; without one it is the plain chat
  h.files.set(opts.you ? "chats/mavka.u1.json" : "chats/mavka.json", JSON.stringify({ id: "mavka", messages: opts.messages ?? [], pending: null, failed: null, unread: false, shared: [], ...opts.chat }));
  if (opts.settings) h.files.set("settings.json", JSON.stringify(opts.settings));
  if (opts.you) h.files.set("you.json", JSON.stringify(opts.you));
}
const readChat = (h: H) => JSON.parse(h.files.get(h.files.has("chats/mavka.u1.json") ? "chats/mavka.u1.json" : "chats/mavka.json")!);
const route = (host: any, p: string, body?: unknown, extra: object = {}) => plugin.handleRoute({ method: "POST", path: p, body, ...extra }, host);
const YOU = { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "Writes songs." }] };

test("without a note the window grows by its slack before anything is dropped, with a note only the open messages go", () => {
  const h = makeHost();
  seed(h, { messages: msgs(40), settings: { messengerContext: 12 } });
  const chat = plugin.contextOf(h.host.fs, { ...plugin.handleRoute({ method: "GET", path: "/messenger/chat", query: { id: "mavka" } }, h.host).json.chat, summary: null, breaks: [], foldFailAt: 0 });
  // 12 + slack 4 = 16 open messages, the newest ones
  expect(chat.messages).toHaveLength(16);
  expect(chat.messages.at(-1).content).toBe("line 39");
  expect(chat.summary).toBe("");
  const withNote = plugin.contextOf(h.host.fs, { messages: msgs(40), breaks: [], foldFailAt: 0, summary: { text: "Old news.", upto: BASE + 30 * 60000, at: 1 } });
  expect(withNote.messages).toHaveLength(9); // messages 31..39
  expect(withNote.messages[0].content).toBe("line 31");
  expect(withNote.summary).toBe("Old news.");
});

test("with the note switched off the model sees only the last window, as before", () => {
  const h = makeHost();
  seed(h, { messages: msgs(40), settings: { messengerContext: 12, messengerSummary: false } });
  const ctx = plugin.contextOf(h.host.fs, { messages: msgs(40), breaks: [], foldFailAt: 0, summary: { text: "x", upto: 0, at: 1 } });
  expect(ctx.messages).toHaveLength(12);
  expect(ctx.summary).toBe("");
  expect(plugin.foldPlan(h.host.fs, { messages: msgs(40), breaks: [], foldFailAt: 0, summary: null }, false, BASE)).toBeNull();
});

test("a fold waits for the window plus its slack, takes the oldest, and respects a recent failure", () => {
  const h = makeHost();
  seed(h, { settings: { messengerContext: 12 } });
  const chat = (n: number, extra: object = {}) => ({ messages: msgs(n), breaks: [], foldFailAt: 0, summary: null, ...extra });
  expect(plugin.foldPlan(h.host.fs, chat(16), false, BASE)).toBeNull();
  const plan = plugin.foldPlan(h.host.fs, chat(17), false, BASE);
  expect(plan.messages).toHaveLength(5); // 17 open - 12 kept
  expect(plan.upto).toBe(BASE + 4 * 60000);
  expect(plugin.foldPlan(h.host.fs, chat(40, { foldFailAt: BASE - 60000 }), false, BASE)).toBeNull();
  expect(plugin.foldPlan(h.host.fs, chat(40, { foldFailAt: BASE - 11 * 60000 }), false, BASE)).not.toBeNull();
  // what is already in the note is not folded again
  const noted = plugin.foldPlan(h.host.fs, chat(40, { summary: { text: "n", upto: BASE + 20 * 60000, at: 1 } }), false, BASE);
  expect(noted.messages[0].id).toBe("m21");
});

test("a long fold input is cut by size, and `upto` follows what was included", () => {
  const h = makeHost();
  seed(h, { settings: { messengerContext: 4 } });
  const long = msgs(60).map((m) => ({ ...m, text: "x".repeat(550) }));
  const plan = plugin.foldPlan(h.host.fs, { messages: long, breaks: [], foldFailAt: 0, summary: null }, false, BASE);
  expect(plan.messages.length).toBeLessThan(56);
  expect(plan.upto).toBe(plan.messages.at(-1).at);
});

test("the tick folds old messages into the note, and the next reply carries the note and only the open messages", () => {
  const h = makeHost();
  seed(h, { messages: msgs(30), settings: { messengerContext: 12 }, you: YOU });
  plugin.onTick({}, h.host);
  expect(h.requests).toHaveLength(1);
  const { key, req } = h.requests[0];
  const upto = BASE + 17 * 60000; // 30 open, 12 kept: messages 0..17 go
  expect(key).toBe("sum:mavka:" + upto + (h.files.has("chats/mavka.u1.json") ? ":u1" : ""));
  expect(req.systemPrompt).toContain("Mavka");
  expect(req.messages[0].content).toContain("(empty)");
  expect(req.messages[0].content).toContain("Serhii: line 0");
  expect(req.messages[0].content).toContain("Mavka: line 17");
  expect(req.messages[0].content).not.toContain("line 18");
  // the answer arrives on the next pass
  h.requests.length = 0;
  h.results[key] = { text: "<think>x</think>Serhii writes songs; Mavka promised to listen." };
  plugin.onTick({}, h.host);
  const chat = readChat(h);
  expect(chat.summary).toMatchObject({ text: "Serhii writes songs; Mavka promised to listen.", upto });
  // a reply now: the note is in the system prompt, the history starts after `upto`
  delete h.results["sum:mavka:" + upto];
  h.files.set("profiles/mavka.json", JSON.stringify({ id: "mavka", name: "Mavka", source: "own", schedule: always("online") }));
  const sent = route(h.host, "/messenger/send", { id: "mavka", text: "hello again" });
  expect(sent.__llmPending).toBe(true);
  const reply = h.requests.at(-1)!.req;
  expect(reply.systemPrompt).toContain("What you remember from earlier in this conversation");
  expect(reply.systemPrompt).toContain("Mavka promised to listen");
  expect(reply.messages[0].content).toBe("line 18");
  expect(reply.messages.at(-1).content).toBe("hello again");
});

test("a failed fold is remembered and not asked again at once; a stale answer is dropped", () => {
  const h = makeHost();
  seed(h, { messages: msgs(30), settings: { messengerContext: 12 } });
  plugin.onTick({}, h.host);
  const key = h.requests[0].key;
  h.requests.length = 0;
  h.results[key] = { error: "boom" };
  plugin.onTick({}, h.host);
  expect(readChat(h).summary).toBeNull();
  expect(readChat(h).foldFailAt).toBeGreaterThan(0);
  delete h.results[key];
  plugin.onTick({}, h.host);
  expect(h.requests.filter((r) => r.key.startsWith("sum:"))).toHaveLength(0);
  // a result for a fold the note has already passed changes nothing
  seed(h, { messages: msgs(30), chat: { summary: { text: "kept", upto: BASE + 25 * 60000, at: 5 } }, settings: { messengerContext: 12 } });
  h.results["sum:mavka:" + (BASE + 17 * 60000)] = { text: "older note" };
  plugin.onTick({}, h.host);
  expect(readChat(h).summary.text).toBe("kept");
});

test("a new conversation keeps the note: it folds the open messages first, then puts a divider", () => {
  const h = makeHost();
  seed(h, { messages: msgs(10), chat: { summary: { text: "Earlier: they met.", upto: BASE + 2 * 60000, at: 5 } }, settings: { messengerContext: 12 } });
  const first = route(h.host, "/messenger/new", { id: "mavka", keepNote: true });
  expect(first.__llmPending).toBe(true);
  expect(h.requests[0].key).toBe("newsum");
  expect(h.requests[0].req.messages[0].content).toContain("Earlier: they met.");
  expect(h.requests[0].req.messages[0].content).toContain("line 9");
  expect(h.requests[0].req.messages[0].content).not.toContain("line 2");
  h.results.newsum = { text: "They met, then argued about a song." };
  const done = route(h.host, "/messenger/new", { id: "mavka", keepNote: true }, { stash: first.stash });
  expect(done.json.ok).toBe(true);
  expect(done.json.warn).toBeUndefined();
  const chat = readChat(h);
  expect(chat.summary.text).toBe("They met, then argued about a song.");
  expect(chat.breaks).toHaveLength(1);
  expect(chat.messages).toHaveLength(10); // the history stays in the log
  // the model sees nothing from before the divider, only the note
  const ctx = plugin.contextOf(h.host.fs, plugin.handleRoute({ method: "GET", path: "/messenger/chat", query: { id: "mavka" } }, h.host).json.chat);
  expect(ctx.messages).toHaveLength(0);
  expect(ctx.summary).toContain("argued about a song");
});

test("a new conversation without the note drops it and asks no model; a failed fold still makes the divider", () => {
  const h = makeHost();
  seed(h, { messages: msgs(10), chat: { summary: { text: "Earlier.", upto: BASE, at: 5 } } });
  const plain = route(h.host, "/messenger/new", { id: "mavka", keepNote: false });
  expect(plain.json.ok).toBe(true);
  expect(h.requests).toHaveLength(0);
  expect(readChat(h).summary).toBeNull();
  expect(readChat(h).breaks).toHaveLength(1);

  const h2 = makeHost();
  seed(h2, { messages: msgs(10), chat: { summary: { text: "Earlier.", upto: BASE, at: 5 } } });
  const first = route(h2.host, "/messenger/new", { id: "mavka" });
  h2.results.newsum = { error: "no model" };
  const done = route(h2.host, "/messenger/new", { id: "mavka" }, { stash: first.stash });
  expect(done.json.ok).toBe(true);
  expect(done.json.warn).toBe("note");
  expect(readChat(h2).summary.text).toBe("Earlier."); // the old note stays
  expect(readChat(h2).breaks).toHaveLength(1);
});

test("a new conversation on an empty chat is refused; messages after the divider reach the model", () => {
  const h = makeHost();
  seed(h, { messages: [] });
  expect(route(h.host, "/messenger/new", { id: "mavka" }).status).toBe(400);
  seed(h, { messages: [...msgs(6), { id: "n1", who: "me", at: BASE + 10 * 60000, text: "fresh start" }], chat: { breaks: [BASE + 9 * 60000] }, settings: { messengerSummary: false } });
  const ctx = plugin.contextOf(h.host.fs, { messages: [...msgs(6), { id: "n1", who: "me", at: BASE + 10 * 60000, text: "fresh start" }], breaks: [BASE + 9 * 60000], foldFailAt: 0, summary: null });
  expect(ctx.messages.map((m: any) => m.content)).toEqual(["fresh start"]);
});

test("the user edits the note, empties it, and clears the chat", () => {
  const h = makeHost();
  seed(h, { messages: msgs(6), chat: { summary: { text: "Model note.", upto: BASE + 60000, at: 5 } } });
  const edited = route(h.host, "/messenger/summary", { id: "mavka", text: "  My own note.  " });
  expect(edited.json.chat.summary).toMatchObject({ text: "My own note.", edited: true });
  expect(readChat(h).summary.upto).toBe(BASE + 60000); // what was folded stays folded
  const emptied = route(h.host, "/messenger/summary", { id: "mavka", text: "" });
  expect(emptied.json.chat.summary.text).toBe("");
  expect(plugin.contextOf(h.host.fs, readChat(h)).summary).toBe("");
  expect(route(h.host, "/messenger/summary", { id: "mavka" }).status).toBe(400);
  expect(route(h.host, "/messenger/summary", { id: "nobody", text: "x" }).status).toBe(404);
  const cleared = route(h.host, "/messenger/clear", { id: "mavka" });
  expect(cleared.json.chat.messages).toEqual([]);
  expect(readChat(h)).toMatchObject({ messages: [], summary: null, breaks: [] });
  expect(route(h.host, "/messenger/clear", { id: "nobody" }).status).toBe(404);
});

test("how well a character knows you: the persona, only the name, or nobody", () => {
  const h = makeHost();
  seed(h, { you: YOU });
  const prompt = (profile: object) => {
    const p = { name: "Mavka", about: "Lake." , ...profile };
    return plugin.systemPromptFor(p, plugin.youFor(h.host.fs, p), "", { stranger: plugin.knowsOf(h.host.fs, p) === "stranger" });
  };
  const knows = prompt({});
  expect(knows).toContain("with Serhii");
  expect(knows).toContain("Writes songs.");
  const name = prompt({ knows: "name" });
  expect(name).toContain("with Serhii");
  expect(name).not.toContain("Writes songs.");
  const stranger = prompt({ knows: "stranger" });
  expect(stranger).not.toContain("Serhii");
  expect(stranger).not.toContain("Writes songs.");
  expect(stranger).toContain("someone you do not know yet");
  // the app-wide default applies to a profile that has no choice of its own
  h.files.set("settings.json", JSON.stringify({ messengerKnows: "stranger" }));
  expect(plugin.knowsOf(h.host.fs, { name: "x" })).toBe("stranger");
  expect(plugin.knowsOf(h.host.fs, { name: "x", knows: "knows" })).toBe("knows");
  h.files.set("settings.json", JSON.stringify({ messengerKnows: "nonsense" }));
  expect(plugin.knowsOf(h.host.fs, { name: "x" })).toBe("knows");
});

test("every prompt carries the out-of-character line", () => {
  const s = plugin.systemPromptFor({ name: "Mavka" }, null, "", {});
  expect(s).toContain(plugin.OOC_HINT);
  expect(plugin.OOC_HINT).toContain("((");
  expect(plugin.OOC_HINT).toContain("OOC");
});

const profiles = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

test("a profile keeps its own 'knows you' choice, and the app default has bounds", () => {
  const clean = (raw: object) => profiles.cleanProfile({ name: "Mavka", ...raw }, "mavka", 1, null);
  expect(clean({ knows: "stranger" }).knows).toBe("stranger");
  expect(clean({ knows: "name" }).knows).toBe("name");
  expect(clean({ knows: "" }).knows).toBeUndefined();
  expect(clean({ knows: "everything" }).knows).toBeUndefined();
  expect(profiles.DEFAULT_SETTINGS.messengerSummary).toBe(true);
  expect(profiles.DEFAULT_SETTINGS.messengerKnows).toBe("knows");
  const merged = profiles.mergeSettings(profiles.DEFAULT_SETTINGS, { messengerSummary: false, messengerKnows: "name" });
  expect(merged).toMatchObject({ messengerSummary: false, messengerKnows: "name" });
  expect(profiles.mergeSettings(merged, { messengerKnows: "nonsense", messengerSummary: "yes" })).toMatchObject({ messengerSummary: false, messengerKnows: "name" });
});
