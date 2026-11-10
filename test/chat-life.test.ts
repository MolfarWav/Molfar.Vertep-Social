// The community's own life reaches the chats (#367, #366): a close friend writes first and checks in, a rumour told on the forum may come up in a
// chat, and one character may be a little jealous of another in their own chat. All by rules, one more line in the prompt, no extra model call.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const chatter = await import(path.join(root, "plugins/chatter/plugin.js"));

const DAY = 24 * 3600 * 1000;
const NOW = 1_700_000_000_000;
const always = (status: string) => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => status));

function makeHost() {
  const files = new Map<string, string>();
  return {
    files,
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
  } as any;
}
const put = (h: any, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const prof = (id: string, name: string, extra: object = {}) => ({ id, name, hue: 150, source: "own", about: "x", interests: [], habits: [], voice: { length: 1, emoji: 1 }, schedule: always("online"), adult: true, ...extra });
const entry = (key: string, extra: object = {}) => ({ key, name: key.slice(2), seen: 3, toMe: 1, fromMe: 1, said: [], note: "", feel: 0, ...extra });
const people = (h: any, id: string, list: object[]) => put(h, `life/people/${id}.json`, { scanned: 0, noteDay: "", failedAt: 0, people: list });

// ---------- the pinned copy ----------

test("the messenger and the characters' chat carry the same chat-life reader", () => {
  const block = (f: string) => /\/\/ <chat-life-shared>[\s\S]*?\/\/ <\/chat-life-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n"))?.[0];
  const m = block("plugins/messenger/plugin.js");
  expect(m).toBeTruthy();
  expect(block("plugins/chatter/plugin.js")).toBe(m);
});

// ---------- a rumour in a chat ----------

const rumour = (extra: object = {}) => ({ id: "g-1", kind: "rift", about: ["boris", "clara"], tone: "plain", truth: 1, by: "anna", at: NOW - DAY, topic: "t1", told: ["anna"], ...extra });
function gossipWorld(item: object = rumour(), settings: object = {}) {
  const h = makeHost();
  for (const [id, name] of [["anna", "Anna"], ["boris", "Boris"], ["clara", "Clara"]]) put(h, `profiles/${id}.json`, prof(id, name));
  put(h, "forum/gossip.json", { items: [item], drafts: [] });
  put(h, "settings.json", { community: { tone: "warm", ...settings } });
  return h;
}

test("chatGossipLine: a rumour the character told or heard lately, on a share of replies, as something not proven", () => {
  const h = gossipWorld();
  const anna = { id: "anna" };
  const line = messenger.chatGossipLine(h.fs, anna, NOW, () => 0, []);
  expect(line).toContain("Boris and Clara have been at odds lately");
  expect(line).toContain("not sure");
  expect(line).toContain("never reveal anything from anyone's private chats");
  // the share: a high roll says nothing
  expect(messenger.chatGossipLine(h.fs, anna, NOW, () => 0.9, [])).toBe("");
  // one that heard it counts too; one that did not does not
  const heard = gossipWorld(rumour({ by: "boris", told: ["boris", "anna"] }));
  expect(messenger.chatGossipLine(heard.fs, anna, NOW, () => 0, [])).toContain("at odds");
  expect(messenger.chatGossipLine(h.fs, { id: "clara" }, NOW, () => 0, [])).toBe(""); // it is about her
  expect(messenger.chatGossipLine(gossipWorld(rumour({ told: [], by: "boris" })).fs, anna, NOW, () => 0, [])).toBe("");
});

test("chatGossipLine: not when it is old, switched off, about the one it is talking to, and a romantic one not at tone none", () => {
  const anna = { id: "anna" };
  expect(messenger.chatGossipLine(gossipWorld(rumour({ at: NOW - 4 * DAY })).fs, anna, NOW, () => 0, [])).toBe("");
  expect(messenger.chatGossipLine(gossipWorld(rumour(), { gossip: false }).fs, anna, NOW, () => 0, [])).toBe("");
  expect(messenger.chatGossipLine(gossipWorld().fs, anna, NOW, () => 0, ["clara"])).toBe("");
  const sweet = rumour({ kind: "sweet" });
  const line = messenger.chatGossipLine(gossipWorld(sweet).fs, anna, NOW, () => 0, []);
  expect(line).toContain("seems to be sweet on Clara");
  expect(line).toContain("gentle"); // the ceiling of the warm level
  expect(messenger.chatGossipLine(gossipWorld(sweet, { tone: "none" }).fs, anna, NOW, () => 0, [])).toBe("");
});

test("the messenger's reply prompt carries the rumour line, and a stranger's does not", () => {
  const p = { name: "Anna", voice: {} };
  expect(messenger.systemPromptFor(p, null, "", { gossip: "On the forum you have lately talked about this: X." })).toContain("On the forum you have lately talked about this: X.");
  expect(messenger.systemPromptFor(p, null, "", {})).not.toContain("On the forum");
});

// ---------- jealousy in a chat between characters ----------

test("jealousChatLine: the speaker loves someone and the other has been getting close to them; adults only, never at tone none", () => {
  const h = makeHost();
  put(h, "profiles/anna.json", prof("anna", "Anna"));
  put(h, "profiles/boris.json", prof("boris", "Boris"));
  put(h, "profiles/clara.json", prof("clara", "Clara"));
  put(h, "settings.json", { community: { tone: "flirty" } });
  people(h, "anna", [entry("c:clara", { ties: [{ type: "crush" }] })]);
  people(h, "boris", [entry("c:clara", { lvl: "friend", feel: 5 })]);
  const line = chatter.jealousChatLine(h.fs, "anna", "boris");
  expect(line).toContain("Boris has been getting close to Clara");
  expect(line).toContain("never cruel");
  expect(line).toContain("hints and teasing"); // the flirty ceiling
  // the other way round: Boris has no romantic tie to anyone, so nothing
  expect(chatter.jealousChatLine(h.fs, "boris", "anna")).toBe("");
  // not close enough
  people(h, "boris", [entry("c:clara", { lvl: "friend", feel: 0 })]);
  expect(chatter.jealousChatLine(h.fs, "anna", "boris")).toBe("");
  people(h, "boris", [entry("c:clara", { lvl: "friend", feel: 5 })]);
  put(h, "settings.json", { community: { tone: "none" } });
  expect(chatter.jealousChatLine(h.fs, "anna", "boris")).toBe("");
  put(h, "settings.json", { community: { tone: "warm" } });
  put(h, "profiles/clara.json", prof("clara", "Clara", { adult: false }));
  expect(chatter.jealousChatLine(h.fs, "anna", "boris")).toBe("");
  put(h, "profiles/clara.json", prof("clara", "Clara"));
  put(h, "profiles/anna.json", prof("anna", "Anna", { adult: false }));
  expect(chatter.jealousChatLine(h.fs, "anna", "boris")).toBe("");
});

// ---------- who writes first ----------

const closeFriend = (extra: object = {}) => entry("u:u1", { lvl: "close", feel: 5, ...extra });
function firstWorld(entryOf: object | null, lastAt: number | null, stranger = false) {
  const h = makeHost();
  put(h, "profiles/mavka.json", prof("mavka", "Mavka", stranger ? { knows: "stranger" } : {}));
  put(h, "you.json", { active: "u1", personas: [{ id: "u1", name: "Serhii", about: "" }] });
  put(h, "settings.json", { tzOffset: 0, quietFrom: "00:00", quietTo: "00:00", messengerFirst: true, messengerPerDay: 5, messengerQuiet: "own" });
  if (lastAt !== null) put(h, "chats/mavka.u1.json", { id: "mavka", persona: "u1", messages: [{ id: "m1", who: "me", at: lastAt, text: "hi" }, { id: "m2", who: "them", at: lastAt + 1000, text: "hello" }] });
  people(h, "mavka", entryOf ? [entryOf] : []);
  return h;
}

test("firstWeight: a stranger rarely opens a chat, a close friend often, warmth leans it, a cold feeling away", () => {
  expect(messenger.firstWeight(null)).toBe(1);
  expect(messenger.firstWeight(entry("u:u1", { lvl: "stranger" }))).toBe(0.25);
  expect(messenger.firstWeight(entry("u:u1", { lvl: "close" }))).toBe(2);
  expect(messenger.firstWeight(entry("u:u1", { lvl: "close", feel: 5 }))).toBeCloseTo(2.6);
  expect(messenger.firstWeight(entry("u:u1", { lvl: "friend", feel: -5 }))).toBeCloseTo(0.45);
});

test("a close friend checks in after three quiet days, with no news of its own", () => {
  const h = firstWorld(closeFriend(), NOW - 5 * DAY);
  const plan = messenger.planFirst(h.fs, NOW, () => 0);
  expect(plan.profile.id).toBe("mavka");
  expect(plan.persona).toBe("u1");
  expect(plan.subject.ref).toMatch(/^checkin-/);
  expect(plan.subject.text).toContain("4 days");
  expect(plan.subject.text).toContain("Do not invent");
});

test("no check-in when the talk is recent, the level is lower, the friend feels cool, there is no chat, or the character does not know the user", () => {
  expect(messenger.planFirst(firstWorld(closeFriend(), NOW - 1 * DAY).fs, NOW, () => 0)).toBeNull();
  expect(messenger.planFirst(firstWorld(closeFriend({ lvl: "acquaintance" }), NOW - 5 * DAY).fs, NOW, () => 0)).toBeNull();
  expect(messenger.planFirst(firstWorld(closeFriend({ lvl: "friend", feel: 0 }), NOW - 5 * DAY).fs, NOW, () => 0)).toBeNull();
  expect(messenger.planFirst(firstWorld(closeFriend({ lvl: "friend", feel: 4 }), NOW - 5 * DAY).fs, NOW, () => 0)?.subject.ref).toMatch(/^checkin-/);
  expect(messenger.planFirst(firstWorld(closeFriend(), null).fs, NOW, () => 0)).toBeNull();
  expect(messenger.planFirst(firstWorld(null, NOW - 5 * DAY).fs, NOW, () => 0)).toBeNull();
  expect(messenger.planFirst(firstWorld(closeFriend(), NOW - 5 * DAY, true).fs, NOW, () => 0)).toBeNull();
});

test("with several candidates the level leans the draw; with equal levels it is the plain draw", () => {
  const h = firstWorld(closeFriend(), NOW - 5 * DAY);
  put(h, "profiles/borys.json", prof("borys", "Borys"));
  put(h, "chats/borys.u1.json", { id: "borys", persona: "u1", messages: [{ id: "m1", who: "me", at: NOW - 6 * DAY, text: "hi" }] });
  people(h, "borys", [entry("u:u1", { lvl: "friend", feel: 4 })]);
  const ids = new Set<string>();
  // weights: mavka (close, warm) 2.6, borys (friend, warm) 1.95
  for (const roll of [0.1, 0.3, 0.55, 0.6, 0.75, 0.9]) {
    let n = 0;
    const r = () => (n++ === 0 ? 0 : roll); // the first draw passes the day's chance, the second picks
    const plan = messenger.planFirst(h.fs, NOW, r);
    if (plan) ids.add(plan.profile.id);
  }
  expect(ids.has("mavka")).toBe(true);
  expect(ids.has("borys")).toBe(true);
  // equal levels: the index draw of before
  people(h, "borys", [closeFriend()]);
  expect(messenger.planFirst(h.fs, NOW, () => 0).profile.id).toBeTruthy();
});
