// Issue #446, M1: the facts ledger beside the chat note. A fold answers JSON {facts, note}; the code merges, never drops.
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

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off"));
const BASE = 1_700_000_000_000;
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "m" + i, who: i % 2 === 0 ? "me" : "them", at: BASE + i * 60000, text: "line " + i }));
function seed(h: H, chat: object = {}, settings: object = { messengerContext: 12 }) {
  h.files.set("profiles/mavka.json", JSON.stringify({ id: "mavka", name: "Mavka", hue: 150, source: "own", about: "Lives by the lake.", schedule: always }));
  h.files.set("chats/mavka.json", JSON.stringify({ id: "mavka", messages: msgs(30), pending: null, failed: null, unread: false, shared: [], ...chat }));
  h.files.set("settings.json", JSON.stringify(settings));
}
const readChat = (h: H) => JSON.parse(h.files.get("chats/mavka.json")!);
const route = (h: H, method: string, p: string, body?: unknown, query?: object) => plugin.handleRoute({ method, path: p, body, query }, h.host);
const answer = (obj: unknown) => ({ text: typeof obj === "string" ? obj : JSON.stringify(obj) });
const F = (id: string, text: string, extra: object = {}) => ({ id, text, kind: "about_you", at: BASE, from: BASE, private: true, pinned: false, by: "model", ...extra });

/** Runs the tick that asks for a fold, answers it, runs the tick that files it. */
function fold(h: H, result: unknown) {
  plugin.onTick({}, h.host);
  const asked = h.requests.at(-1)!;
  expect(asked.key.startsWith("sum:")).toBe(true);
  h.requests.length = 0;
  h.results[asked.key] = result;
  plugin.onTick({}, h.host);
  delete h.results[asked.key];
  return asked;
}

test("a JSON answer fills the ledger and a shorter note; the fold request lists what is known and asks for JSON", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv.")] });
  const asked = fold(h, answer({ facts: [{ text: "Serhii has a dog called Barsyk.", kind: "about_you" }, { text: "Mavka promised a playlist by Friday.", kind: "promise", private: false }], note: "They joke a lot; Serhii is tired after rehearsals." }));
  expect(asked.req.systemPrompt).toContain("JSON");
  expect(asked.req.messages[0].content).toContain("f1: Serhii lives in Lviv.");
  const chat = readChat(h);
  expect(chat.summary.text).toBe("They joke a lot; Serhii is tired after rehearsals.");
  expect(chat.facts.map((f: any) => f.text)).toEqual(["Serhii lives in Lviv.", "Serhii has a dog called Barsyk.", "Mavka promised a playlist by Friday."]);
  // private is the default; the model may mark a fact public; the id is new
  expect(chat.facts.map((f: any) => f.private)).toEqual([true, true, false]);
  expect(chat.facts[1]).toMatchObject({ id: "f2", kind: "about_you", by: "model", pinned: false, from: BASE + 17 * 60000 });
});

test("a plain-text answer behaves exactly as before: it is the note, the ledger is untouched", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv.")] });
  fold(h, answer("<think>x</think>Serhii writes songs; Mavka promised to listen."));
  const chat = readChat(h);
  expect(chat.summary.text).toBe("Serhii writes songs; Mavka promised to listen.");
  expect(chat.facts).toHaveLength(1);
  // broken JSON is a plain answer too
  const h2 = makeHost();
  seed(h2);
  fold(h2, answer('{"facts": [{"text": "cut off'));
  expect(readChat(h2).summary.text).toContain("cut off");
  expect(readChat(h2).facts).toEqual([]);
});

test("a duplicate replaces, not adds; a fold drops nothing; a changed fact replaces by id", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv."), F("f2", "Rehearsals are on Thursday.", { kind: "plan" })] });
  fold(h, answer({ facts: [{ text: "serhii lives in LVIV" }, { text: "Serhii moved to Kyiv.", replaces: "f1" }], note: "n" }));
  const facts = readChat(h).facts;
  expect(facts.map((f: any) => [f.id, f.text])).toEqual([["f3", "Serhii moved to Kyiv."], ["f2", "Rehearsals are on Thursday."]]);
  // the new fact kept the kind of the one it replaced; the untouched one is still there
  expect(facts[0].kind).toBe("about_you");
});

test("the user's own and the pinned facts are never replaced by the model; the user's edit survives the next fold", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv.", { pinned: true }), F("f2", "Barsyk is a poodle.", { by: "you" })] });
  fold(h, answer({ facts: [{ text: "Serhii lives in Kyiv.", replaces: "f1" }, { text: "Barsyk is a dachshund.", replaces: "f2" }, { text: "A new thing." }], note: "n" }));
  expect(readChat(h).facts.map((f: any) => f.text)).toEqual(["Serhii lives in Lviv.", "Barsyk is a poodle.", "A new thing."]);
  // an edit through the route marks the fact as the user's
  const r = route(h, "POST", "/messenger/facts", { id: "mavka", op: "update", factId: "f3", text: "A new thing, said better." });
  expect(r.json.facts.find((f: any) => f.id === "f3")).toMatchObject({ text: "A new thing, said better.", by: "you" });
});

test("a replacing fact keeps the old one's private flag (the user's choice survives a rewording)", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii is a bass player.", { private: false })] });
  fold(h, answer({ facts: [{ text: "Serhii plays bass in a band.", replaces: "f1", private: true }], note: "n" }));
  expect(readChat(h).facts[0].private).toBe(false);
});

test("over the ceiling the oldest unpinned jokes and shared moments go to the archive first, nothing is lost silently", () => {
  const h = makeHost();
  const facts = Array.from({ length: 200 }, (_, i) => F("f" + (i + 1), "Fact number " + (i + 1) + " about something.", { at: BASE + i, from: BASE + i, kind: i === 5 ? "joke" : i === 7 ? "shared" : "about_you", pinned: i === 5 }));
  seed(h, { facts });
  fold(h, answer({ facts: [{ text: "One more fact that arrives." }, { text: "And another fact that arrives." }], note: "n" }));
  const chat = readChat(h);
  expect(chat.facts).toHaveLength(200);
  // f6 is a pinned joke: it stays; f8 is the unpinned shared one: it goes first, then the oldest of the rest (f1)
  expect(chat.facts.some((f: any) => f.id === "f6")).toBe(true);
  expect(chat.factsArchive.map((f: any) => f.id)).toEqual(["f8", "f1"]);
  expect(chat.factsDropped).toBe(0);
  // the archive is not sent to the model, and a fact can come back
  const view = route(h, "GET", "/messenger/facts", undefined, { id: "mavka" }).json;
  expect(view.archive).toHaveLength(2);
  const back = route(h, "POST", "/messenger/facts", { id: "mavka", op: "restore", factId: "f8" }).json;
  // the restored one stays; the next to go is the oldest unpinned joke or shared fact left (the fresh default-kind one)
  expect(back.facts.some((f: any) => f.id === "f8")).toBe(true);
  expect(back.archive.map((f: any) => f.id)).toEqual(["f1", "f201"]);
  expect(back.facts).toHaveLength(200);
});

test("the facts in a reply's prompt: pinned first, the newest, then the ones about what is being said, within the budget", () => {
  const h = makeHost();
  const many = Array.from({ length: 80 }, (_, i) => F("f" + (i + 1), "Detail " + i + " about topic" + i + " that Serhii mentioned once.", { at: BASE + i, from: BASE + i }));
  many[3] = F("f4", "Serhii is allergic to hazelnuts, so no hazelnut cake.", { pinned: true, from: BASE + 3 });
  many[10] = F("f11", "Serhii plays the bass guitar in a folk band.", { from: BASE + 10 });
  seed(h, { facts: many, messages: [...msgs(3).slice(0, 2), { id: "q", who: "me", at: BASE + 5 * 60000, text: "I bought a new bass guitar strings today" }] });
  const out = plugin.factsFor(h.host.fs, { ...JSON.parse(h.files.get("chats/mavka.json")!), breaks: [] });
  const lines = out.split("\n");
  expect(out.length).toBeLessThanOrEqual(1500 + 3 * lines.length);
  expect(out).toContain("hazelnuts");
  expect(out).toContain("bass guitar in a folk band");
  expect(out).toContain("Detail 79 ");
  expect(lines.length).toBeLessThan(80);
  // oldest first
  expect(lines[0]).toContain("hazelnuts");
  // with the note switched off the ledger is not sent
  h.files.set("settings.json", JSON.stringify({ messengerSummary: false }));
  expect(plugin.factsFor(h.host.fs, { ...JSON.parse(h.files.get("chats/mavka.json")!), breaks: [] })).toBe("");
});

test("a reply asks with the facts in the system prompt", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv.")] });
  h.files.set("profiles/mavka.json", JSON.stringify({ id: "mavka", name: "Mavka", source: "own", schedule: Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online")) }));
  const sent = route(h, "POST", "/messenger/send", { id: "mavka", text: "hello again" });
  expect(sent.__llmPending).toBe(true);
  const prompt = h.requests.at(-1)!.req.systemPrompt;
  expect(prompt).toContain("Facts you know about this person");
  expect(prompt).toContain("- Serhii lives in Lviv.");
});

test("the routes: add, update, pin, flip private, delete; text is cut and cleaned; bad input is refused", () => {
  const h = makeHost();
  seed(h);
  const add = route(h, "POST", "/messenger/facts", { id: "mavka", op: "add", text: "  <b>Serhii</b> hates cilantro. " + "x".repeat(400), kind: "joke" });
  expect(add.json.facts).toHaveLength(1);
  const f = add.json.facts[0];
  expect(f).toMatchObject({ id: "f1", kind: "joke", by: "you", private: true, pinned: false });
  expect(f.text.length).toBe(160);
  expect(f.text.startsWith("Serhii hates cilantro.")).toBe(true);
  expect(route(h, "POST", "/messenger/facts", { id: "mavka", op: "add", text: "   " }).status).toBe(400);
  const up = route(h, "POST", "/messenger/facts", { id: "mavka", op: "update", factId: "f1", pinned: true, private: false, kind: "plan" }).json;
  expect(up.facts[0]).toMatchObject({ pinned: true, private: false, kind: "plan", by: "you" });
  expect(route(h, "POST", "/messenger/facts", { id: "mavka", op: "update", factId: "nope", pinned: true }).status).toBe(404);
  expect(route(h, "POST", "/messenger/facts", { id: "mavka", op: "fly" }).status).toBe(400);
  expect(route(h, "POST", "/messenger/facts", { id: "ghost", op: "add", text: "x" }).status).toBe(404);
  // the chat view only carries the counts
  const view = route(h, "GET", "/messenger/chat", undefined, { id: "mavka" }).json.chat;
  expect(view.factCount).toBe(1);
  expect(view.factPinned).toBe(1);
  expect(view.facts).toBeUndefined();
  const del = route(h, "POST", "/messenger/facts", { id: "mavka", op: "delete", factId: "f1" }).json;
  expect(del.facts).toEqual([]);
});

test("a new conversation without the note drops the unpinned facts; clearing the chat drops all", () => {
  const h = makeHost();
  seed(h, { facts: [F("f1", "Serhii lives in Lviv."), F("f2", "Keep me.", { pinned: true })], factsArchive: [F("f3", "Old.")] });
  const r = route(h, "POST", "/messenger/new", { id: "mavka", keepNote: false });
  expect(r.json.ok).toBe(true);
  expect(readChat(h).facts.map((f: any) => f.id)).toEqual(["f2"]);
  expect(readChat(h).factsArchive).toEqual([]);
  route(h, "POST", "/messenger/clear", { id: "mavka" });
  expect(readChat(h).facts).toEqual([]);
});

test("a stored ledger is cleaned on read: bad ids made unique, junk dropped, kinds and flags normalised", () => {
  const h = makeHost();
  seed(h, { facts: [{ id: "f2", text: "A." }, { id: "f2", text: "B.", kind: "weird", private: false, pinned: true, by: "you" }, { text: "" }, "junk", { id: "x", text: "C." }] });
  const view = route(h, "GET", "/messenger/facts", undefined, { id: "mavka" }).json;
  expect(view.facts.map((f: any) => f.text)).toEqual(["A.", "B.", "C."]);
  expect(new Set(view.facts.map((f: any) => f.id)).size).toBe(3);
  expect(view.facts[1]).toMatchObject({ kind: "shared", private: false, pinned: true, by: "you" });
});
