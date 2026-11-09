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
  return { host, files, requests };
}

/** A schedule that is `status` in every band of every day. */
const always = (status: string) => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => status));

function seed(h: ReturnType<typeof makeHost>, id: string, status: string, extra: object = {}) {
  h.files.set(
    `profiles/${id}.json`,
    JSON.stringify({ id, name: "Мавка", hue: 150, source: "own", about: "Мешканка озера.", interests: ["очерет"], habits: [{ text: "пише вечорами" }], voice: { text: "Повільна, тиха.", length: 0, emoji: 0, formality: 20, never: ["капслок"] }, schedule: always(status), ...extra }),
  );
}
const route = (host: any, method: string, p: string, body?: unknown, extra: object = {}) => plugin.handleRoute({ method, path: p, body, ...extra }, host);

test("statusAt reads the band and the day in the user's time, from the stored offset", () => {
  const sched = always("off");
  sched[4][1] = "online"; // 12:00-15:00 on Tuesday
  const tue1230Utc = new Date(Date.UTC(2026, 10, 10, 10, 30)); // Tue 10 Nov 2026
  expect(plugin.statusAt(sched, tue1230Utc, -120)).toBe("online"); // UTC+2: 12:30
  expect(plugin.statusAt(sched, tue1230Utc, 0)).toBe("off"); // UTC: 10:30
  expect(plugin.statusAt(sched, new Date(Date.UTC(2026, 10, 9, 10, 30)), -120)).toBe("off"); // Monday
  expect(plugin.statusAt(null, tue1230Utc, 0)).toBe("off");
});

test("nextOnline finds the start of the next online band", () => {
  const sched = always("off");
  sched[4][1] = "online";
  const from = Date.UTC(2026, 10, 10, 6, 5); // Tue 08:05 at UTC+2
  expect(plugin.nextOnline(sched, from, -120)).toBe(Date.UTC(2026, 10, 10, 10, 0)); // Tue 12:00 at UTC+2
  expect(plugin.nextOnline(always("off"), from, -120)).toBeNull();
});

test("the system prompt carries the profile's voice and never the card", () => {
  const p = { name: "Мавка", about: "Мешканка озера.", interests: ["очерет"], habits: [{ text: "пише вечорами" }], voice: { text: "Повільна.", length: 0, emoji: 2, formality: 80, never: ["капслок"] } };
  const s = plugin.systemPromptFor(p);
  expect(s).toContain("You are Мавка");
  expect(s).toContain("Мешканка озера.");
  expect(s).toContain("пише вечорами");
  expect(s).toContain("Повільна.");
  expect(s).toContain("Short: one or two sentences");
  expect(s).toContain("Use emoji often");
  expect(s).toContain("Formal");
  expect(s).toContain("капслок");
});

test("history keeps the last messages with the right roles; replies are cleaned", () => {
  const msgs = Array.from({ length: 30 }, (_, i) => ({ who: i % 2 ? "them" : "me", text: "m" + i }));
  const h = plugin.historyFor(msgs);
  expect(h).toHaveLength(24);
  expect(h[h.length - 1]).toEqual({ role: "assistant", content: "m29" });
  expect(h[0].role).toBe("user");
  expect(plugin.cleanReply("<think>hmm</think>Мавка: «Привіт»", "Мавка")).toBe("Привіт");
  expect(plugin.cleanReply('"Привіт, друже"', "Мавка")).toBe("Привіт, друже");
  expect(plugin.cleanReply("<b>a</b> b", "")).toBe("a b");
});

test("sending to an online profile writes the reply in two passes and stores both messages", () => {
  const first = makeHost();
  seed(first, "mavka", "online");
  const pending = route(first.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" });
  expect(pending.__llmPending).toBe(true);
  expect(first.requests).toHaveLength(1);
  expect(first.requests[0].req.messages).toEqual([{ role: "user", content: "Привіт!" }]);
  expect(first.requests[0].req.systemPrompt).toContain("You are Мавка");
  expect(first.requests[0].req.model).toBeUndefined();
  // pass two (the host re-runs the route with the stash and the model's result)
  const second = makeHost({ reply: { text: "Мавка: Тихо тут. Заходь." } });
  second.files = first.files;
  (second.host.fs as any).read = first.host.fs.read;
  (second.host.fs as any).write = first.host.fs.write;
  (second.host.fs as any).list = first.host.fs.list;
  const done = route(second.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" }, { stash: pending.stash }).json;
  expect(done.ok).toBe(true);
  expect(done.chat.messages.map((m: any) => [m.who, m.text])).toEqual([["me", "Привіт!"], ["them", "Тихо тут. Заходь."]]);
  expect(done.chat.pending).toBeNull();
  const contacts = route(first.host, "GET", "/messenger/contacts").json.contacts;
  expect(contacts[0]).toMatchObject({ id: "mavka", name: "Мавка", status: "online", unread: false, pending: false });
  expect(contacts[0].line).toBe("Тихо тут. Заходь.");
  expect(typeof contacts[0].nextOnline).not.toBe("undefined");
});

test("a reply uses the profile's own model first, then the messenger's model in Settings", () => {
  const ask = (profileExtra: object, settings?: object) => {
    const h = makeHost();
    seed(h, "mavka", "online", profileExtra);
    if (settings) h.files.set("settings.json", JSON.stringify(settings));
    route(h.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" });
    return h.requests[0].req.model;
  };
  expect(ask({ model: "prov/own" }, { models: { messenger: "prov/app" } })).toBe("prov/own");
  expect(ask({ model: "" }, { models: { messenger: "prov/app" } })).toBe("prov/app");
  expect(ask({}, { models: { messenger: "prov/app" } })).toBe("prov/app");
  expect(ask({ model: "default" }, { models: { messenger: "prov/app" } })).toBe("prov/app");
  expect(ask({ model: "has space" })).toBeUndefined();
});

test("a profile that is not online queues the message; no model call is made", () => {
  for (const status of ["dnd", "na", "off", "away"]) {
    const h = makeHost();
    seed(h, "mavka", status);
    const out = route(h.host, "POST", "/messenger/send", { id: "mavka", text: "Ти тут?" }).json;
    expect(out).toMatchObject({ ok: true, queued: true });
    expect(h.requests).toHaveLength(0);
    expect(out.chat.pending).not.toBeNull();
    expect(out.chat.pending.dueAt === null).toBe(status !== "away");
    expect(out.chat.status).toBe(status);
  }
});

test("onTick answers a queued message once the profile is online, and files the reply as unread", () => {
  const h = makeHost();
  seed(h, "mavka", "off");
  route(h.host, "POST", "/messenger/send", { id: "mavka", text: "Ти тут?" });
  expect(plugin.dueChats(h.host.fs, Date.now())).toHaveLength(0);
  seed(h, "mavka", "online"); // the schedule now says online
  plugin.onTick({}, h.host);
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0].key).toBe("rep:mavka");
  const h2 = makeHost({ "rep:mavka": { text: "Я тут." } });
  h2.files = h.files;
  (h2.host.fs as any).read = h.host.fs.read;
  (h2.host.fs as any).write = h.host.fs.write;
  (h2.host.fs as any).list = h.host.fs.list;
  plugin.onTick({}, h2.host);
  const chat = route(h.host, "GET", "/messenger/chat", undefined, { query: { id: "mavka" } }).json.chat;
  expect(chat.messages.map((m: any) => m.who)).toEqual(["me", "them"]);
  expect(chat.pending).toBeNull();
  expect(route(h.host, "GET", "/messenger/contacts").json.contacts[0].unread).toBe(true);
  route(h.host, "POST", "/messenger/read", { id: "mavka" });
  expect(route(h.host, "GET", "/messenger/contacts").json.contacts[0].unread).toBe(false);
});

test("a failed reply keeps the message and the reason; retry asks again; a tick does not retry a failed chat", () => {
  const h = makeHost();
  seed(h, "mavka", "online");
  route(h.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт" });
  const failed = makeHost({ reply: { error: 'No model providers configured for user "molfar".' } });
  failed.files = h.files;
  for (const k of ["read", "write", "list"]) (failed.host.fs as any)[k] = (h.host.fs as any)[k];
  const out = route(failed.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт" }, { stash: { sent: true } }).json;
  expect(out).toMatchObject({ ok: false, code: "no-model" });
  expect(out.chat.messages).toHaveLength(1);
  expect(out.chat.failed.code).toBe("no-model");
  expect(plugin.dueChats(h.host.fs, Date.now())).toHaveLength(1);
  plugin.onTick({}, h.host);
  expect(h.requests.filter((r) => r.key.startsWith("rep:"))).toHaveLength(0);
  const retry = route(h.host, "POST", "/messenger/retry", { id: "mavka" });
  expect(retry.__llmPending).toBe(true);
  expect(route(h.host, "POST", "/messenger/retry", { id: "nobody" }).status).toBe(404);
});

test("a tick does not ask for a second reply while the send route is still waiting for the model (#343)", () => {
  const h = makeHost();
  seed(h, "mavka", "online");
  const pending = route(h.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" });
  expect(pending.__llmPending).toBe(true);
  expect(h.requests).toHaveLength(1);
  // the one-minute tick fires while the model is still thinking
  expect(plugin.dueChats(h.host.fs, Date.now())).toHaveLength(0);
  plugin.onTick({}, h.host);
  expect(h.requests.filter((r) => r.key.startsWith("rep:"))).toHaveLength(0);
  // a call that never came back is asked again after a while
  expect(plugin.dueChats(h.host.fs, Date.now() + 6 * 60 * 1000)).toHaveLength(1);
  // the answer arrives: one reply, and the chat is free again
  const second = makeHost({ reply: { text: "Привіт." } });
  for (const k of ["read", "write", "list"]) (second.host.fs as any)[k] = (h.host.fs as any)[k];
  const done = route(second.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" }, { stash: pending.stash }).json;
  expect(done.chat.messages.map((m: any) => m.who)).toEqual(["me", "them"]);
  expect(done.chat.pending).toBeNull();
});

test("a second answer to a message that was already answered is dropped (#343)", () => {
  const h = makeHost();
  seed(h, "mavka", "online");
  const pending = route(h.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" });
  const answer = (text: string) => {
    const x = makeHost({ reply: { text } });
    for (const k of ["read", "write", "list"]) (x.host.fs as any)[k] = (h.host.fs as any)[k];
    return route(x.host, "POST", "/messenger/send", { id: "mavka", text: "Привіт!" }, { stash: pending.stash }).json;
  };
  answer("Перша відповідь.");
  const again = answer("Друга відповідь.");
  expect(again.ok).toBe(true);
  expect(again.chat.messages.map((m: any) => [m.who, m.text])).toEqual([["me", "Привіт!"], ["them", "Перша відповідь."]]);
});

test("input checks: unknown profile, empty text, ids that are not ids, foreign paths", () => {
  const h = makeHost();
  seed(h, "mavka", "online");
  expect(route(h.host, "POST", "/messenger/send", { id: "../x", text: "hi" }).status).toBe(404);
  expect(route(h.host, "POST", "/messenger/send", { id: "mavka", text: "   " }).status).toBe(400);
  expect(route(h.host, "GET", "/messenger/chat", undefined, { query: { id: "nope" } }).status).toBe(404);
  expect(route(h.host, "GET", "/profiles")).toBeNull();
  expect(route(h.host, "GET", "/messenger/other").status).toBe(404);
});

// ---------- emoji (#316) ----------

/** True when the text has a half of a surrogate pair, which would draw as a broken character. */
const hasLoneSurrogate = (s: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);

test("the emoji level shapes the prompt; a profile that never set one gets 'now and then'", () => {
  const base = { name: "Мавка", about: "x", interests: [], habits: [] };
  expect(plugin.systemPromptFor({ ...base, voice: { emoji: 0 } })).toContain("Never use emoji.");
  expect(plugin.systemPromptFor({ ...base, voice: {} })).toContain("Use an emoji now and then");
  expect(plugin.systemPromptFor({ ...base, voice: { emoji: 1 } })).toContain("Use an emoji now and then");
  const often = plugin.systemPromptFor({ ...base, voice: { emoji: 2 } });
  expect(often).toContain("Use emoji often");
  // the model is told to write the characters, not :codes:, so the app's emoji font draws them
  expect(often).toContain("never as :codes:");
});

test("emoji survive the round trip: the user's message and the character's reply", () => {
  const first = makeHost();
  seed(first, "mavka", "online");
  const text = "Привіт 😀 як ти 👋🏽 🏳️‍🌈 ❤️";
  const pending = route(first.host, "POST", "/messenger/send", { id: "mavka", text });
  expect(first.requests[0].req.messages).toEqual([{ role: "user", content: text }]);
  const second = makeHost({ reply: { text: "Мавка: Тихо тут 🌿 Заходь 🫶" } });
  second.host.fs = first.host.fs;
  const done = route(second.host, "POST", "/messenger/send", { id: "mavka", text }, { stash: pending.stash }).json;
  expect(done.chat.messages.map((m: any) => m.text)).toEqual([text, "Тихо тут 🌿 Заходь 🫶"]);
});

test("a message cut at the limit never tears an emoji", () => {
  const max = 2000;
  // the emoji straddles the limit: a pair, a ZWJ family, a flag, and one that ends exactly on it
  for (const [pad, emoji] of [[max - 1, "😀"], [max - 4, "👨‍👩‍👧"], [max - 1, "🇺🇦"], [max - 2, "😀"], [max - 1, "❤️"]] as const) {
    const out = plugin.cleanReply("a".repeat(pad) + emoji, "");
    expect(out.length).toBeLessThanOrEqual(max);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(/[‍️]$/.test(out)).toBe(false);
  }
  expect(plugin.cleanReply("a".repeat(max - 2) + "😀", "")).toBe("a".repeat(max - 2) + "😀"); // fits exactly: kept whole
  // and the user's own text goes through the same cut when it is sent
  const h = makeHost();
  seed(h, "mavka", "off");
  const r = route(h.host, "POST", "/messenger/send", { id: "mavka", text: "a".repeat(max - 1) + "😀" }).json;
  const stored = r.chat.messages[0].text;
  expect(stored).toBe("a".repeat(max - 1));
  expect(hasLoneSurrogate(stored)).toBe(false);
});
