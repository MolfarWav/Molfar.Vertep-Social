// Issue #446, M3: privacy as code. The forum and the clubs get only the facts marked public (`private: false`), never the memory note;
// the reader is one block copied into both plugins, and Settings > Messenger "Public facts leave the chat" cuts it off.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const clubs = await import(path.join(root, "plugins/clubs/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));

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
  return { fsx, files };
}
const put = (h: ReturnType<typeof makeHost>, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const F = (id: string, text: string, extra: object = {}) => ({ id, text, kind: "about_you", at: 1, from: 1, private: false, pinned: false, by: "model", ...extra });
const YOU = { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "Plays bass." }, { id: "u2", name: "Oksana", about: "" }] };

function seed(h: ReturnType<typeof makeHost>, facts: object[], settings: object = {}, profile: object = {}) {
  put(h, "you.json", YOU);
  put(h, "settings.json", settings);
  put(h, "chats/mavka.u1.json", { id: "mavka", persona: "u1", messages: [], facts });
  return { id: "mavka", name: "Mavka", ...profile };
}

test("the reader is the same block in the forum and the clubs", () => {
  const block = (f: string) => /\/\/ <public-facts-shared>[\s\S]*?\/\/ <\/public-facts-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n"))?.[0];
  expect(block("plugins/forum/plugin.js")).toBeTruthy();
  expect(block("plugins/clubs/plugin.js")).toBe(block("plugins/forum/plugin.js"));
  // and the helpers it calls are the messenger's, copied
  for (const name of ["knowsOf", "activePersonaId"]) {
    expect(String(clubs[name]), "clubs " + name).toBe(String(messenger[name]));
    expect(String(forum[name]), "forum " + name).toBe(String(messenger[name]));
  }
  expect(String(clubs.publicFacts)).toBe(String(forum.publicFacts));
});

test("only a fact with `private: false` leaves the chat: a missing flag, true and odd values stay in", () => {
  const h = makeHost();
  const p = seed(h, [
    F("f1", "Public one."),
    F("f2", "Private one.", { private: true }),
    F("f3", "No flag at all.", { private: undefined }),
    F("f4", "A string flag.", { private: "false" }),
    F("f5", "Zero flag.", { private: 0 }),
    "junk",
    { id: "f6", text: 5, private: false },
  ]);
  for (const plugin of [forum, clubs]) expect(plugin.publicFacts(h.fsx, p, "u1")).toEqual(["Public one."]);
});

test("the note is never read, even in a chat that has no facts", () => {
  const h = makeHost();
  put(h, "you.json", YOU);
  put(h, "chats/mavka.u1.json", { id: "mavka", persona: "u1", messages: [], summary: { text: "A secret about his boss.", upto: 1, at: 1 } });
  for (const plugin of [forum, clubs]) expect(plugin.publicFacts(h.fsx, { id: "mavka" }, "u1")).toEqual([]);
});

test("off with the sharing switch, with the messenger's memory switch, and for a stranger; the profile's own choice wins", () => {
  const facts = [F("f1", "Public one.")];
  for (const settings of [{ factsShare: false }, { messengerSummary: false }, { messengerKnows: "stranger" }]) {
    const h = makeHost();
    const p = seed(h, facts, settings);
    for (const plugin of [forum, clubs]) expect(plugin.publicFacts(h.fsx, p, "u1"), JSON.stringify(settings)).toEqual([]);
  }
  const own = makeHost();
  const p = seed(own, facts, { messengerKnows: "stranger" }, { knows: "knows" });
  expect(forum.publicFacts(own.fsx, p, "u1")).toEqual(["Public one."]);
  const stranger = makeHost();
  const q = seed(stranger, facts, {}, { knows: "stranger" });
  expect(clubs.publicFacts(stranger.fsx, q, "u1")).toEqual([]);
  // the switch on, explicitly
  const on = makeHost();
  expect(forum.publicFacts(on.fsx, seed(on, facts, { factsShare: true }), "u1")).toEqual(["Public one."]);
});

test("a persona's own chat: the asked persona, else the active one, and an old chat before personas is adopted by the active one", () => {
  const h = makeHost();
  put(h, "you.json", YOU);
  put(h, "chats/mavka.u1.json", { id: "mavka", messages: [], facts: [F("f1", "Serhii's fact.")] });
  put(h, "chats/mavka.u2.json", { id: "mavka", messages: [], facts: [F("f1", "Oksana's fact.")] });
  for (const plugin of [forum, clubs]) {
    expect(plugin.publicFacts(h.fsx, { id: "mavka" }, "u2")).toEqual(["Oksana's fact."]);
    expect(plugin.publicFacts(h.fsx, { id: "mavka" }, "")).toEqual(["Serhii's fact."]);
  }
  const old = makeHost();
  put(old, "you.json", YOU);
  put(old, "chats/mavka.json", { id: "mavka", messages: [], facts: [F("f1", "Old chat fact.")] });
  expect(forum.publicFacts(old.fsx, { id: "mavka" }, "")).toEqual(["Old chat fact."]);
  // but not for a persona that is not the active one
  expect(forum.publicFacts(old.fsx, { id: "mavka" }, "u2")).toEqual([]);
});

test("pinned first, then the newest; at most 12 and about 1000 characters; each cleaned and cut to 160", () => {
  const h = makeHost();
  const many = Array.from({ length: 30 }, (_, i) => F("f" + (i + 1), "Fact number " + (i + 1) + ".", { from: i, pinned: i === 2 }));
  const p = seed(h, many);
  const out = forum.publicFacts(h.fsx, p, "u1");
  expect(out).toHaveLength(12);
  expect(out[0]).toBe("Fact number 3.");
  expect(out[1]).toBe("Fact number 30.");
  const long = makeHost();
  const q = seed(long, [F("f1", "<b>Hello</b>\n" + "x".repeat(400)), ...Array.from({ length: 11 }, (_, i) => F("g" + i, "y".repeat(150), { from: 5 + i }))]);
  const lines = clubs.publicFacts(long.fsx, q, "u1");
  expect(lines.every((x: string) => x.length <= 160 && !/[<>\n]/.test(x))).toBe(true);
  expect(lines.reduce((n: number, x: string) => n + x.length, 0)).toBeLessThanOrEqual(1000 + 160);
  expect(lines.length).toBeLessThan(12);
});

test("a club's prompt carries the public facts of the persona who wrote, only while the user is in the talk", () => {
  const h = makeHost();
  const p = seed(h, [F("f1", "Serhii plays bass."), F("f2", "Serhii fears his boss.", { private: true })]);
  void p;
  const club = { id: "c1", name: "Lake", interest: "reeds", members: ["mavka"], messages: [{ id: "m1", by: "me", persona: "u1", at: 1, text: "Hello!" }], answered: 0 };
  const speaker = { id: "mavka", name: "Mavka", about: "Lives by the lake.", interests: ["reeds"], voice: { text: "", emoji: 1, never: [], words: [] }, model: "", freq: 35 };
  const req = clubs.buildRequest(h.fsx, { answers: 5, model: "" }, club, speaker);
  expect(req.systemPrompt).toContain("- Serhii plays bass.");
  expect(req.systemPrompt).not.toContain("fears his boss");
  // the user's turn is used up: the club talks among itself and does not see the user's lines or facts
  const muted = clubs.buildRequest(h.fsx, { answers: 5, model: "" }, { ...club, answered: 5 }, speaker);
  expect(muted.systemPrompt).not.toContain("Serhii plays bass");
  // nobody from the user wrote
  const none = clubs.buildRequest(h.fsx, { answers: 5, model: "" }, { ...club, messages: [] }, speaker);
  expect(none.systemPrompt).not.toContain("Serhii plays bass");
  // the persona that wrote is the one whose chat is read
  put(h, "chats/mavka.u2.json", { id: "mavka", persona: "u2", messages: [], facts: [F("f1", "Oksana paints.")] });
  const second = clubs.buildRequest(h.fsx, { answers: 5, model: "" }, { ...club, messages: [{ id: "m2", by: "me", persona: "u2", at: 2, text: "Hi" }] }, speaker);
  expect(second.systemPrompt).toContain("- Oksana paints.");
  expect(second.systemPrompt).not.toContain("Serhii plays bass");
});

test("the Settings switch is stored: on by default, kept when set off", async () => {
  const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));
  const h = makeHost();
  const host = { fs: h.fsx, llm: { results: {}, request: () => undefined } };
  const call = (method: string, body?: unknown) => profiles.handleRoute({ method, path: "/settings", body }, host);
  expect(call("GET").json.settings.factsShare).toBe(true);
  expect(call("PUT", { factsShare: false }).json.settings.factsShare).toBe(false);
  expect(call("GET").json.settings.factsShare).toBe(false);
  expect(call("PUT", { postsPerDay: 20 }).json.settings.factsShare).toBe(false);
});
