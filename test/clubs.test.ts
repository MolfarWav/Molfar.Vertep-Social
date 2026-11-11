// Clubs (#368): group chats of three or four characters. Create and limits, members that are deleted, the tick (a simulated day with a
// restart: cap, gap, schedule, the speaker rule, the reply owed to the user first, no double ask, a failure waits), the prompt, the ceiling,
// the Moderator's clubs, Start over and deleting a character, the settings, the pinned copies.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dictionary } from "@/i18n/index";

const root = path.resolve(import.meta.dir, "..");
const clubs = await import(path.join(root, "plugins/clubs/plugin.js"));
const chatter = await import(path.join(root, "plugins/chatter/plugin.js"));
const profilesPlugin = await import(path.join(root, "plugins/profiles/plugin.js"));

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const never = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off"));
const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const MIN = 60000;
const DAYMS = 86400000;

function memFs(files: Map<string, string>) {
  return {
    read: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    write: (p: string, c: string) => void files.set(p, c),
    remove: (p: string) => {
      for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k);
    },
    list: (d: string) => {
      const o = [...new Set([...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1).split("/")[0]!))];
      if (!o.length) throw new Error("ENOENT");
      return o.sort();
    },
  } as any;
}

type World = ReturnType<typeof world>;
/** Five characters (Anna, Boris, Clara, Dora, Egor), all around; a persona "Ann". The community switches are on. */
function world(settings: object = {}, extra: Record<string, unknown> = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { clubs: true, clubsPerDay: 2, clubsMod: false }, models: { messenger: "prov/chat" }, ...settings }));
  const who: [string, string, string][] = [["anna", "Anna", "A weaver."], ["boris", "Boris", "A fisher."], ["clara", "Clara", "A baker."], ["dora", "Dora", "A smith."], ["egor", "Egor", "A scribe."]];
  for (const [id, name, about] of who) files.set(`profiles/${id}.json`, JSON.stringify({ id, name, hue: 100, about, schedule: always, card: "SECRET CARD TEXT of " + name, ...(extra[id] as object | undefined) }));
  files.set("you.json", JSON.stringify({ active: "p1", personas: [{ id: "p1", name: "Ann", about: "The user." }] }));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  const host: any = { fs: memFs(files), llm: { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) } };
  const route = (method: string, p: string, body?: unknown, query?: unknown, stash?: unknown) => clubs.handleRoute({ method, path: p, body, query, ...(stash ? { stash } : {}) }, host);
  return { files, requests, host, route, setResults: (r: Record<string, unknown>) => (results = r) };
}
const at = <T,>(ms: number, fn: () => T, rand = 0): T => {
  const n = Date.now;
  const r = Math.random;
  Date.now = () => ms;
  Math.random = () => rand;
  try {
    return fn();
  } finally {
    Date.now = n;
    Math.random = r;
  }
};
const tick = (w: World, ms: number) => at(ms, () => clubs.onTick({}, w.host));
const make = (w: World, members = ["anna", "boris", "clara"], name = "Weavers") => w.route("POST", "/clubs/club", { name, interest: "weaving", members }).json.club.id as string;
const file = (w: World, id: string) => JSON.parse(w.files.get(`clubs/${id}.json`)!);
const say = (w: World, id: string, speaker: string, text: string, ms: number) => {
  w.setResults({ [`cl:${id}:${speaker}`]: { text } });
  tick(w, ms);
  w.setResults({});
};

// ---------- create, validate, limits ----------

test("a club is made by the user with three or four characters, listed, edited and removed; at most three clubs", () => {
  const w = world();
  expect(w.route("GET", "/clubs").json).toMatchObject({ on: true, max: 3, clubs: [] });
  const r = w.route("POST", "/clubs/club", { name: "  Weavers  ", interest: "weaving", members: ["anna", "boris", "clara"] });
  expect(r.json.club).toMatchObject({ name: "Weavers", interest: "weaving", by: "user", on: true, count: 0, last: null });
  expect(r.json.club.members.map((m: any) => m.name)).toEqual(["Anna", "Boris", "Clara"]);
  expect(r.json.club.id).toMatch(/^[A-Za-z0-9_-]{1,60}$/);
  const id = r.json.club.id;
  expect(file(w, id)).toMatchObject({ by: "user", on: true, today: 0, messages: [], pending: 0, failedAt: 0 });
  // validation
  const bad = (b: object) => w.route("POST", "/clubs/club", b).status;
  expect(bad({ name: "", members: ["anna", "boris", "clara"] })).toBe(400);
  expect(bad({ name: "X", members: ["anna", "boris"] })).toBe(400);
  expect(bad({ name: "X", members: ["anna", "boris", "clara", "dora", "egor"] })).toBe(400);
  expect(bad({ name: "X", members: ["anna", "anna", "boris"] })).toBe(400);
  expect(bad({ name: "X", members: ["anna", "boris", "ghost"] })).toBe(400);
  expect(bad({ name: "X", members: "anna" })).toBe(400);
  // the name and the interest are cut
  const long = w.route("POST", "/clubs/club", { name: "N".repeat(80), interest: "i".repeat(90), members: ["anna", "boris", "dora", "egor"] }).json.club;
  expect(long.name).toHaveLength(40);
  expect(long.interest).toHaveLength(60);
  expect(long.members).toHaveLength(4);
  // the third, then the fourth is refused (on or off, three clubs in all)
  expect(w.route("POST", "/clubs/club", { name: "Third", members: ["clara", "dora", "egor"], on: false }).json.club.on).toBe(false);
  expect(w.route("POST", "/clubs/club", { name: "Fourth", members: ["clara", "dora", "egor"] }).status).toBe(409);
  expect(w.route("GET", "/clubs").json.clubs).toHaveLength(3);
  // edit
  expect(w.route("POST", "/clubs/edit", { id, name: "Looms", interest: "", on: false }).json.club).toMatchObject({ name: "Looms", interest: "", on: false });
  expect(w.route("POST", "/clubs/edit", { id, members: ["anna", "boris", "dora"] }).json.club.members.map((m: any) => m.id)).toEqual(["anna", "boris", "dora"]);
  expect(w.route("POST", "/clubs/edit", { id, members: ["anna", "boris"] }).status).toBe(400);
  expect(w.route("POST", "/clubs/edit", { id, name: " " }).status).toBe(400);
  expect(w.route("POST", "/clubs/edit", { id: "nope", name: "x" }).status).toBe(404);
  expect(w.route("POST", "/clubs/edit", { id, on: true }).json.club.on).toBe(true);
  // remove
  expect(w.route("POST", "/clubs/remove", { id }).json.ok).toBe(true);
  expect(w.files.has(`clubs/${id}.json`)).toBe(false);
  expect(w.route("POST", "/clubs/remove", { id }).status).toBe(404);
  expect(w.route("POST", "/clubs/remove", { id: "state" }).status).toBe(404);
  expect(w.route("POST", "/clubs/remove", { id: "../x" }).status).toBe(404);
  expect(w.route("GET", "/clubs/chat", undefined, { id }).status).toBe(404);
  expect(clubs.handleRoute({ method: "GET", path: "/other" }, w.host)).toBeNull();
});

test("a club asks for a name even when the Moderator's file for it is called state", () => {
  const w = world();
  w.files.set("clubs/state.json", JSON.stringify({ lastAuto: 1, removed: {} }));
  expect(w.route("GET", "/clubs").json.clubs).toEqual([]);
  expect(w.route("GET", "/clubs/chat", undefined, { id: "state" }).status).toBe(404);
});

// ---------- members that are deleted ----------

test("a member that no longer exists leaves the club; under three members the club switches itself off and is kept", () => {
  const w = world();
  const id = make(w, ["anna", "boris", "clara", "dora"]);
  w.files.delete("profiles/dora.json");
  let c = w.route("GET", "/clubs").json.clubs[0];
  expect(c.members.map((m: any) => m.id)).toEqual(["anna", "boris", "clara"]);
  expect(c.on).toBe(true);
  expect(file(w, id).members).toEqual(["anna", "boris", "clara"]); // written back
  w.files.delete("profiles/clara.json");
  c = w.route("GET", "/clubs").json.clubs[0];
  expect(c.members.map((m: any) => m.id)).toEqual(["anna", "boris"]);
  expect(c.on).toBe(false);
  expect(file(w, id)).toMatchObject({ on: false, members: ["anna", "boris"] });
  // it cannot be switched on again with two members, and the tick leaves it alone
  expect(w.route("POST", "/clubs/edit", { id, on: true }).json.club.on).toBe(false);
  tick(w, noon);
  expect(w.requests).toHaveLength(0);
  // a new member makes it possible again
  expect(w.route("POST", "/clubs/edit", { id, members: ["anna", "boris", "egor"], on: true }).json.club.on).toBe(true);
});

test("deleting a character drops it from the clubs with its messages; Start over's chats part and the profiles part remove clubs/", () => {
  const w = world();
  const id = make(w);
  w.files.set(`clubs/${id}.json`, JSON.stringify({ ...file(w, id), messages: [{ id: "m1", by: "anna", at: noon, text: "hi" }, { id: "m2", by: "boris", at: noon + 1, text: "yo" }, { id: "m3", by: "me", at: noon + 2, text: "hey" }] }));
  w.files.set("profiles/anna.json", JSON.stringify({ id: "anna", name: "Anna" }));
  const res = profilesPlugin.handleRoute({ method: "DELETE", path: "/profiles/anna" }, w.host);
  expect(res.json.ok).toBe(true);
  expect(file(w, id)).toMatchObject({ members: ["boris", "clara"], on: false });
  expect(file(w, id).messages.map((m: any) => m.id)).toEqual(["m2", "m3"]);
  expect(profilesPlugin.RESET_PARTS.chats).toContain("clubs");
  profilesPlugin.resetData(w.host.fs, ["chats"]);
  expect(w.files.has(`clubs/${id}.json`)).toBe(false);
  expect(w.files.has("clubs/state.json")).toBe(false);
  // the profiles part carries the chats part
  const w2 = world();
  const id2 = make(w2);
  profilesPlugin.resetData(w2.host.fs, ["profiles"]);
  expect(w2.files.has(`clubs/${id2}.json`)).toBe(false);
});

// ---------- the tick ----------

test("nothing is written unless the global switch and the club are on and two members are around", () => {
  const off = world({ community: { clubs: false } });
  make(off);
  tick(off, noon);
  expect(off.requests).toHaveLength(0);
  const clubOff = world();
  const id = make(clubOff);
  clubOff.route("POST", "/clubs/edit", { id, on: false });
  tick(clubOff, noon);
  expect(clubOff.requests).toHaveLength(0);
  // one member around is not enough for talk of their own
  const one = world({}, { boris: { schedule: never }, clara: { schedule: never } });
  make(one);
  tick(one, noon);
  expect(one.requests).toHaveLength(0);
  const two = world({}, { clara: { schedule: never } });
  make(two);
  tick(two, noon);
  expect(two.requests).toHaveLength(1);
  expect(["anna", "boris"]).toContain(two.requests[0]!.key.split(":")[2]);
});

test("the tick asks one model call per message: the speaker is around and is not the last one, the chance gates idle talk", () => {
  const w = world();
  const id = make(w);
  // the chance of a tick is 12%: a high random number does nothing
  at(noon, () => clubs.onTick({}, w.host), 0.9);
  expect(w.requests).toHaveLength(0);
  tick(w, noon);
  expect(w.requests).toHaveLength(1);
  expect(w.requests[0]!.key).toBe(`cl:${id}:anna`); // random 0 takes the first
  expect(w.requests[0]!.req.model).toBe("prov/chat");
  expect(w.requests[0]!.req.messages[0].content).toContain("Open the chat of the club");
  expect(file(w, id).pending).toBe(noon);
  // a request is out: no second one
  tick(w, noon + MIN);
  expect(w.requests).toHaveLength(1);
  say(w, id, "anna", "Anna: The loom is humming today.", noon + 2 * MIN);
  expect(file(w, id).messages).toEqual([{ id: expect.any(String), by: "anna", at: noon + 2 * MIN, text: "The loom is humming today." }]);
  expect(file(w, id)).toMatchObject({ today: 1, pending: 0, failedAt: 0 });
  // the gap of three minutes
  tick(w, noon + 4 * MIN);
  expect(w.requests).toHaveLength(1);
  tick(w, noon + 6 * MIN);
  expect(w.requests).toHaveLength(2);
  expect(w.requests[1]!.key).toBe(`cl:${id}:boris`); // not Anna again
  expect(w.requests[1]!.req.messages[0].content).toContain("Anna: The loom is humming today.");
  // never the last speaker, over many draws
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const w2 = world();
    const i2 = make(w2);
    say(w2, i2, "boris", "Hello.", noon);
    at(noon + 5 * MIN, () => clubs.onTick({}, w2.host), r * 0.1);
    expect(w2.requests).toHaveLength(1);
    expect(w2.requests[0]!.key).not.toBe(`cl:${i2}:boris`);
  }
});

test("a simulated day with a restart: the cap, the gap and the next day", () => {
  const w = world(); // two a day
  const id = make(w);
  say(w, id, "anna", "One.", noon);
  say(w, id, "boris", "Two.", noon + 10 * MIN);
  expect(file(w, id).today).toBe(2);
  tick(w, noon + 20 * MIN);
  expect(w.requests).toHaveLength(0); // the cap is used
  // a restart: a new plugin state reads the same files and still holds the cap
  const again = { ...w, requests: [] as typeof w.requests };
  again.host = { fs: w.host.fs, llm: { results: {}, request: (key: string, req: any) => void again.requests.push({ key, req }) } };
  at(noon + 30 * MIN, () => clubs.onTick({}, again.host));
  expect(again.requests).toHaveLength(0);
  // the next day it goes on
  at(noon + DAYMS, () => clubs.onTick({}, again.host));
  expect(again.requests).toHaveLength(1);
  expect(clubs.readClub(w.host.fs, id, noon + DAYMS, 0).today).toBe(0); // a new day starts at nothing
  expect(clubs.fileClubResult(w.host.fs, again.requests[0]!.key, { text: "Three." }, noon + DAYMS + MIN, 0).message.text).toBe("Three.");
  expect(file(w, id).today).toBe(1);
});

test("a failure waits half an hour, and a pending club is not asked twice, even after a restart", () => {
  const w = world();
  const id = make(w);
  tick(w, noon);
  expect(w.requests).toHaveLength(1);
  w.setResults({ [w.requests[0]!.key]: { error: "boom" } });
  tick(w, noon + MIN);
  expect(file(w, id).failedAt).toBe(noon + MIN);
  w.setResults({});
  tick(w, noon + 20 * MIN);
  expect(w.requests).toHaveLength(1);
  tick(w, noon + 40 * MIN);
  expect(w.requests).toHaveLength(2);
  // the answer never comes: the club stays pending for ten minutes, then it is asked again
  tick(w, noon + 45 * MIN);
  expect(w.requests).toHaveLength(2);
  tick(w, noon + 52 * MIN);
  expect(w.requests).toHaveLength(3);
});

test("an answer for a club switched off meanwhile is dropped; a message that goes past the ceiling is not filed and counts as a failure", () => {
  const w = world();
  const id = make(w);
  tick(w, noon);
  w.route("POST", "/clubs/edit", { id, on: false });
  say(w, id, "anna", "Late line.", noon + 1000);
  expect(file(w, id).messages).toEqual([]);
  w.route("POST", "/clubs/edit", { id, on: true });
  say(w, id, "boris", "They had sex all night.", noon + 2000);
  expect(file(w, id).messages).toEqual([]);
  expect(file(w, id).failedAt).toBe(noon + 2000);
  say(w, id, "ghost", "Hi.", noon + 3000);
  expect(file(w, id).messages).toEqual([]);
  // a plain message is filed, cleaned like the characters' chats
  say(w, id, "clara", "Clara - <b>Hello</b>\u0007, all.", noon + 4000);
  expect(file(w, id).messages.map((m: any) => m.text)).toEqual(["Hello , all."]);
});

// ---------- the user writes ----------

test("the user's message is filed at once and the first reply is asked in the same two-pass way as the messenger's", () => {
  const w = world();
  const id = make(w);
  const first = at(noon, () => w.route("POST", "/clubs/send", { id, text: "  Hello, everyone!  " }));
  expect(first.__llmPending).toBe(true);
  expect(first.stash).toMatchObject({ sent: true });
  expect(w.requests).toHaveLength(1);
  expect(w.requests[0]!.key).toBe("reply");
  expect(file(w, id).messages).toEqual([{ id: expect.any(String), by: "me", persona: "p1", at: noon, text: "Hello, everyone!" }]);
  expect(file(w, id).pending).toBe(noon);
  const speaker = first.stash.speaker as string;
  expect(["anna", "boris", "clara"]).toContain(speaker);
  const sys = w.requests[0]!.req.systemPrompt as string;
  expect(sys).toContain("Ann is a real person");
  expect(sys).toContain("double parentheses");
  expect(w.requests[0]!.req.messages[0].content).toContain("Ann: Hello, everyone!");
  expect(w.requests[0]!.req.messages[0].content).toContain("answering Ann");
  // while it is out the tick does not ask again
  tick(w, noon + MIN);
  expect(w.requests).toHaveLength(1);
  // the second pass files the reply and answers with the chat
  w.setResults({ reply: { text: "Welcome, Ann." } });
  const second = at(noon + 5000, () => w.route("POST", "/clubs/send", { id, text: "Hello, everyone!" }, undefined, first.stash));
  expect(second.json.ok).toBe(true);
  expect(second.json.chat.messages.map((m: any) => [m.by, m.mine, m.text, m.name])).toEqual([["me", true, "Hello, everyone!", "Ann"], [speaker, false, "Welcome, Ann.", expect.any(String)]]);
  expect(second.json.chat.messages[0].as).toBeUndefined(); // one persona: nothing about "as"
  expect(file(w, id)).toMatchObject({ pending: 0, today: 1 });
});

test("a reply owed to the user comes first: no chance, no gap, no cap; the second member answers on the next tick, then it is idle talk again", () => {
  const w = world({ community: { clubs: true, clubsPerDay: 1, clubsMod: false } });
  const id = make(w);
  say(w, id, "anna", "Idle line.", noon); // the cap of one a day is used
  const first = at(noon + 30 * 1000, () => w.route("POST", "/clubs/send", { id, text: "Anna, did you hear?" }));
  expect(first.__llmPending).toBe(true); // the cap does not stop an answer to the user
  w.setResults({ reply: { text: "I did." } });
  at(noon + 31 * 1000, () => w.route("POST", "/clubs/send", { id, text: "Anna, did you hear?" }, undefined, first.stash));
  w.setResults({});
  w.requests.length = 0;
  // one member answered: the next tick (a bad chance draw does not matter) asks a second, not the one who just spoke
  at(noon + 32 * 1000, () => clubs.onTick({}, w.host), 0.99);
  expect(w.requests).toHaveLength(1);
  expect(w.requests[0]!.key.startsWith(`cl:${id}:`)).toBe(true);
  expect(w.requests[0]!.key.split(":")[2]).not.toBe(first.stash.speaker);
  say(w, id, w.requests[0]!.key.split(":")[2]!, "Me too.", noon + 33 * 1000);
  // two answered: no more owed; the gap and the cap hold idle talk back
  w.requests.length = 0;
  at(noon + 34 * 1000, () => clubs.onTick({}, w.host), 0);
  expect(w.requests).toHaveLength(0);
});

test("the user's message waits when nobody is around, the club is off or the global switch is off; no request, no error", () => {
  const nobody = world({}, { anna: { schedule: never }, boris: { schedule: never }, clara: { schedule: never } });
  const idA = make(nobody);
  const r = at(noon, () => nobody.route("POST", "/clubs/send", { id: idA, text: "Anyone?" }));
  expect(r.json).toMatchObject({ ok: true, queued: true });
  expect(nobody.requests).toHaveLength(0);
  expect(file(nobody, idA).messages).toHaveLength(1);
  const globalOff = world({ community: { clubs: false } });
  const idB = make(globalOff);
  expect(at(noon, () => globalOff.route("POST", "/clubs/send", { id: idB, text: "Hi" })).json.queued).toBe(true);
  const clubOff = world();
  const idC = make(clubOff);
  clubOff.route("POST", "/clubs/edit", { id: idC, on: false });
  expect(at(noon, () => clubOff.route("POST", "/clubs/send", { id: idC, text: "Hi" })).json.queued).toBe(true);
  expect(clubOff.requests.length + globalOff.requests.length).toBe(0);
  expect(clubOff.route("POST", "/clubs/send", { id: idC, text: "  " }).status).toBe(400);
  expect(clubOff.route("POST", "/clubs/send", { id: "nope", text: "Hi" }).status).toBe(404);
});

test("owed replies stop after two members answered and after three hours; a send while a request is out is only filed; a send clears an old failure", () => {
  const w = world();
  const id = make(w);
  const state = file(w, id);
  const base = { ...state, messages: [{ id: "u1", by: "me", at: noon, text: "Hi" }] };
  expect(clubs.owedState({ ...base, messages: base.messages }, noon + MIN)).toMatchObject({ answered: 0 });
  expect(clubs.owedState({ ...base, messages: [...base.messages, { id: "a", by: "anna", at: noon + 1, text: "x" }] }, noon + MIN)).toMatchObject({ answered: 1 });
  expect(clubs.owedState({ ...base, messages: [...base.messages, { id: "a", by: "anna", at: noon + 1, text: "x" }, { id: "b", by: "boris", at: noon + 2, text: "y" }] }, noon + MIN)).toBeNull();
  expect(clubs.owedState(base, noon + 4 * 3600 * 1000)).toBeNull();
  expect(clubs.owedState({ ...base, messages: [{ id: "a", by: "anna", at: noon, text: "x" }] }, noon + MIN)).toBeNull();
  // while a request is out
  w.files.set(`clubs/${id}.json`, JSON.stringify({ ...state, pending: noon, failedAt: noon - MIN }));
  const queued = at(noon + MIN, () => w.route("POST", "/clubs/send", { id, text: "Again" }));
  expect(queued.json.queued).toBe(true);
  expect(w.requests).toHaveLength(0);
  expect(file(w, id).failedAt).toBe(0);
});

test("with more than one persona the user's messages say who wrote them, and the prompt names the persona that wrote", () => {
  const w = world();
  w.files.set("you.json", JSON.stringify({ active: "p2", personas: [{ id: "p1", name: "Ann" }, { id: "p2", name: "Mira" }] }));
  const id = make(w);
  const r = at(noon, () => w.route("POST", "/clubs/send", { id, text: "Hi, it is me" }));
  expect(file(w, id).messages[0].persona).toBe("p2");
  expect(w.requests[0]!.req.messages[0].content).toContain("Mira: Hi, it is me");
  w.setResults({ reply: { text: "Hello, Mira." } });
  const done = at(noon + 1000, () => w.route("POST", "/clubs/send", { id, text: "Hi, it is me" }, undefined, r.stash));
  expect(done.json.chat.multi).toBe(true);
  expect(done.json.chat.messages[0]).toMatchObject({ mine: true, name: "Mira", as: "Mira" });
  expect(w.route("GET", "/clubs/chat", undefined, { id }).json.messages[0].as).toBe("Mira");
});

test("the list and the chat: the last line, the newest club first, sender names and avatars, a pending and a failed flag", () => {
  const w = world();
  w.files.set("profiles/boris.json", JSON.stringify({ id: "boris", name: "Boris", hue: 20, picture: "/v1/assets/pic1", schedule: always }));
  const a = make(w, ["anna", "boris", "clara"], "Older");
  const b = make(w, ["boris", "clara", "dora"], "Newer");
  say(w, a, "boris", "Older talk.", noon);
  say(w, b, "boris", "Newer talk\nwith a break.", noon + MIN);
  const list = w.route("GET", "/clubs").json.clubs;
  expect(list.map((c: any) => c.name)).toEqual(["Newer", "Older"]);
  expect(list[0].last).toEqual({ by: "boris", name: "Boris", at: noon + MIN, text: "Newer talk with a break." });
  expect(list[0].count).toBe(1);
  const chat = at(noon + 2 * MIN, () => w.route("GET", "/clubs/chat", undefined, { id: b }).json);
  expect(chat.messages[0]).toMatchObject({ by: "boris", name: "Boris", hue: 20, picture: "/v1/assets/pic1", mine: false });
  expect(chat).toMatchObject({ pending: false, failed: false, multi: false });
  w.files.set(`clubs/${b}.json`, JSON.stringify({ ...file(w, b), pending: noon + MIN, failedAt: noon + MIN }));
  const flags = at(noon + 2 * MIN, () => w.route("GET", "/clubs/chat", undefined, { id: b }).json);
  expect(flags).toMatchObject({ pending: true, failed: true });
});

// ---------- the prompt ----------

test("the prompt carries who the member is, the others with what it remembers of them, the tone, the last messages; never the card", () => {
  const w = world({ community: { clubs: true, clubsPerDay: 5, clubsMod: false, tone: "flirty" } }, { anna: { voice: { text: "Dry and short.", emoji: 0, never: ["darling"] }, interests: ["weaving", "tea"] } });
  w.files.set("life/people/anna.json", JSON.stringify({ people: [{ key: "c:boris", name: "Boris", seen: 3, toMe: 1, fromMe: 1, said: [], note: "Gruff but kind.", feel: -8, lvl: "friend", ties: [{ type: "sibling" }] }] }));
  const id = make(w);
  const club = clubs.readClub(w.host.fs, id, noon, 0);
  const speaker = { id: "anna", name: "Anna", about: "A weaver.", interests: ["weaving", "tea"], voice: { text: "Dry and short.", emoji: 0, never: ["darling"] }, model: "", freq: 35 };
  const req = clubs.buildRequest(w.host.fs, clubs.readSettings(w.host.fs), club, speaker);
  const sys = req.systemPrompt as string;
  expect(sys).toContain('You are Anna, a character, in a group chat called "Weavers" about weaving. The other members are Boris, Clara.');
  expect(sys).toContain("Who you are: A weaver.");
  expect(sys).toContain("How you write: Dry and short.");
  expect(sys).toContain("Never use emoji.");
  expect(sys).toContain("Never write: darling.");
  expect(sys).toContain("About Boris: Your impression of them: Gruff but kind. You are in open conflict with them");
  expect(sys).toContain("You are friends.");
  expect(sys).toContain("Boris is your brother or sister.");
  expect(sys).toContain("Keep anything romantic between you light");
  expect(sys).toContain("one short message in your voice");
  expect(sys).not.toContain("About Clara"); // nothing remembered of Clara
  expect(sys).not.toContain("SECRET CARD TEXT");
  expect(sys).not.toContain("double parentheses"); // the user has not written
  expect(JSON.stringify(req)).not.toContain("SECRET CARD TEXT");
  // the tone ceiling follows Settings
  const none = world({ community: { clubs: true, clubsMod: false, tone: "none" } });
  const idN = make(none);
  expect(clubs.buildRequest(none.host.fs, clubs.readSettings(none.host.fs), clubs.readClub(none.host.fs, idN, noon, 0), speaker).systemPrompt).toContain("nothing romantic between the members");
  expect(clubs.buildRequest(w.host.fs, clubs.readSettings(w.host.fs), club, { ...speaker, model: "prov/own" }).model).toBe("prov/own");
});

test("the prompt shows only the last fourteen messages, with the speakers' names", () => {
  const w = world();
  const id = make(w);
  const messages = Array.from({ length: 20 }, (_, i) => ({ id: "m" + i, by: i % 3 === 0 ? "boris" : "clara", at: noon + i, text: "line " + i }));
  w.files.set(`clubs/${id}.json`, JSON.stringify({ ...file(w, id), messages }));
  const club = clubs.readClub(w.host.fs, id, noon + 100, 0);
  const speaker = { id: "anna", name: "Anna", about: "", interests: [], voice: {}, model: "", freq: 35 };
  const user = clubs.buildRequest(w.host.fs, clubs.readSettings(w.host.fs), club, speaker).messages[0].content as string;
  expect(user).toContain("Clara: line 19");
  expect(user).toContain("Boris: line 6");
  expect(user).not.toContain("line 5\n");
  expect(user).toContain("answering Clara");
  expect(user.split("\n").filter((l) => /^(Boris|Clara): /.test(l))).toHaveLength(14);
});

test("a member answering another gets the jealousy line when the rules allow it, and not when answering the user", () => {
  const w = world({ community: { clubs: true, clubsMod: false, tone: "warm" } }, { anna: { adult: true }, boris: { adult: true }, clara: { adult: true } });
  w.files.set("life/people/anna.json", JSON.stringify({ people: [{ key: "c:clara", name: "Clara", ties: [{ type: "crush" }] }] }));
  w.files.set("life/people/boris.json", JSON.stringify({ people: [{ key: "c:clara", name: "Clara", lvl: "friend", feel: 5, ties: [] }] }));
  const id = make(w);
  w.files.set(`clubs/${id}.json`, JSON.stringify({ ...file(w, id), messages: [{ id: "m1", by: "boris", at: noon, text: "Hi, all." }] }));
  const speaker = { id: "anna", name: "Anna", about: "", interests: [], voice: {}, model: "", freq: 35 };
  const build = () => clubs.buildRequest(w.host.fs, clubs.readSettings(w.host.fs), clubs.readClub(w.host.fs, id, noon + 1, 0), speaker).systemPrompt as string;
  expect(build()).toContain("You are a little jealous: Boris has been getting close to Clara");
  w.files.set(`clubs/${id}.json`, JSON.stringify({ ...file(w, id), messages: [{ id: "m1", by: "boris", at: noon, text: "Hi." }, { id: "m2", by: "me", at: noon + 1, text: "Hello" }] }));
  expect(build()).not.toContain("jealous");
});

test("the copies of the relation reader and the jealousy line are the chatter's", () => {
  const body = (f: string, name: string) => {
    const s = fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n");
    const i = s.indexOf("export function " + name + "(");
    return s.slice(i, s.indexOf("\n}\n", i) + 3);
  };
  for (const n of ["relationLine", "jealousChatLine"]) {
    expect(body("plugins/clubs/plugin.js", n).length).toBeGreaterThan(200);
    expect(body("plugins/clubs/plugin.js", n)).toBe(body("plugins/chatter/plugin.js", n));
  }
  expect(clubs.overCeiling("blowjob")).toBe(chatter.overCeiling("blowjob"));
  expect(clubs.communityLevel(world().host.fs)).toBe("warm");
});

test("a typical club message costs a few hundred tokens", () => {
  const w = world({}, { anna: { about: "A weaver of the lake village, quiet, practical and a little superstitious. ".repeat(6), voice: { text: "Short sentences, dry humour. ".repeat(6) } } });
  const id = make(w);
  w.files.set("life/people/anna.json", JSON.stringify({ people: [{ key: "c:boris", name: "Boris", note: "Gruff but kind. ".repeat(6), feel: 4, lvl: "friend" }, { key: "c:clara", name: "Clara", note: "Bakes for everyone. ".repeat(6), feel: 2, lvl: "acquaintance" }] }));
  const messages = Array.from({ length: 14 }, (_, i) => ({ id: "m" + i, by: i % 2 ? "boris" : "clara", at: noon + i, text: "A line of the talk about the weaving of the winter cloth, with a joke. ".repeat(2).trim() }));
  w.files.set(`clubs/${id}.json`, JSON.stringify({ ...file(w, id), messages }));
  const req = clubs.buildRequest(w.host.fs, clubs.readSettings(w.host.fs), clubs.readClub(w.host.fs, id, noon + 100, 0), { id: "anna", name: "Anna", about: "A weaver of the lake village, quiet, practical and a little superstitious. ".repeat(6), interests: ["weaving"], voice: { text: "Short sentences, dry humour. ".repeat(6) }, model: "", freq: 35 });
  const chars = (req.systemPrompt as string).length + (req.messages[0].content as string).length;
  const tokens = Math.ceil(chars / 3.5);
  expect(tokens).toBeGreaterThan(300);
  expect(tokens).toBeLessThan(1200);
});

// ---------- the Moderator's clubs ----------

const withInterests = (w: World, id: string, interests: string[]) => w.files.set(`profiles/${id}.json`, JSON.stringify({ ...JSON.parse(w.files.get(`profiles/${id}.json`)!), interests }));
const modWorld = () => {
  const w = world({ community: { clubs: true, clubsMod: true } });
  withInterests(w, "anna", ["Mushrooms", "Weaving"]);
  withInterests(w, "boris", ["fishing", "mushrooms"]);
  withInterests(w, "clara", ["MUSHROOMS, foraging", "baking"]);
  withInterests(w, "dora", ["smithing", "Forging iron"]);
  withInterests(w, "egor", ["scribing"]);
  return w;
};
const settingsOf = (w: World) => clubs.readSettings(w.host.fs);

test("the Moderator makes a club from three characters who share an interest, whole words, in any case, with no model call", () => {
  const w = modWorld();
  const made = at(noon, () => clubs.modClub(w.host.fs, settingsOf(w), noon, () => 0));
  expect(made).toMatchObject({ by: "mod", on: true, interest: "Mushrooms", name: "Mushrooms club" });
  expect(made.members.sort()).toEqual(["anna", "boris", "clara"]);
  expect(file(w, made.id)).toMatchObject({ by: "mod", on: true, messages: [] });
  expect(JSON.parse(w.files.get("clubs/state.json")!).lastAuto).toBe(noon);
  expect(w.requests).toHaveLength(0);
  // two characters sharing an interest are not a club; a word inside another word is not a match
  const few = world({ community: { clubs: true, clubsMod: true } });
  withInterests(few, "anna", ["stargazing"]);
  withInterests(few, "boris", ["gazing"]);
  withInterests(few, "clara", ["stargazing", "fishing rods"]);
  withInterests(few, "dora", ["rods"]);
  expect(clubs.modClub(few.host.fs, settingsOf(few), noon, () => 0)).toBeNull();
  // the short word and the stop words never make a club
  const stop = world({ community: { clubs: true, clubsMod: true } });
  for (const id of ["anna", "boris", "clara"]) withInterests(stop, id, ["art", "with", "love"]);
  expect(clubs.modClub(stop.host.fs, settingsOf(stop), noon, () => 0)).toBeNull();
});

test("a Cyrillic interest gets a Ukrainian club name and matches in any case", () => {
  const w = world({ community: { clubs: true, clubsMod: true } });
  withInterests(w, "anna", ["Вишивка"]);
  withInterests(w, "boris", ["вишивка", "риболовля"]);
  withInterests(w, "clara", ["ВИШИВКА"]);
  const made = clubs.modClub(w.host.fs, settingsOf(w), noon, () => 0);
  expect(made).toMatchObject({ name: "Клуб «Вишивка»", interest: "Вишивка" });
  expect(clubs.autoName("a".repeat(70))).toHaveLength(40);
  expect(clubs.autoName("в".repeat(70)).length).toBeLessThanOrEqual(40);
});

test("the Moderator makes at most three clubs, one in three days, none for an interest a club has, and none with the switches off", () => {
  const w = modWorld();
  const run = (ms: number) => clubs.modClub(w.host.fs, settingsOf(w), ms, () => 0);
  expect(run(noon)).not.toBeNull();
  // within three days: nothing, even with a second shared interest
  withInterests(w, "dora", ["smithing", "Forging iron"]);
  for (const id of ["anna", "boris", "clara", "dora"]) withInterests(w, id, [...JSON.parse(w.files.get(`profiles/${id}.json`)!).interests, "tea ceremony"]);
  expect(run(noon + 2 * DAYMS)).toBeNull();
  // after three days: a new interest, not the one a club already has
  const second = run(noon + 3 * DAYMS + 1);
  expect(second).toMatchObject({ interest: "tea ceremony" });
  expect(second.members).toHaveLength(4);
  // nothing new to propose: no more
  expect(run(noon + 7 * DAYMS)).toBeNull();
  // the third club, then the cap
  for (const id of ["boris", "clara", "dora"]) withInterests(w, id, [...JSON.parse(w.files.get(`profiles/${id}.json`)!).interests, "chess"]);
  expect(run(noon + 8 * DAYMS)).toMatchObject({ interest: "chess" });
  for (const id of ["anna", "boris", "clara", "dora"]) withInterests(w, id, [...JSON.parse(w.files.get(`profiles/${id}.json`)!).interests, "kites"]);
  expect(w.route("GET", "/clubs").json.clubs).toHaveLength(3);
  expect(run(noon + 20 * DAYMS)).toBeNull();
  // the switches
  const off = modWorld();
  expect(clubs.modClub(off.host.fs, { ...settingsOf(off), mod: false }, noon, () => 0)).toBeNull();
  expect(clubs.modClub(off.host.fs, { ...settingsOf(off), on: false }, noon, () => 0)).toBeNull();
});

test("the Moderator prefers characters who know each other, and a club it made can be changed or deleted by the user; a deleted one is not proposed for 14 days", () => {
  const w = world({ community: { clubs: true, clubsMod: true } });
  for (const id of ["anna", "boris", "clara", "dora", "egor"]) withInterests(w, id, ["mushrooms"]);
  // Anna, Clara, Dora and Egor know each other, Boris knows nobody
  for (const a of ["anna", "clara", "dora", "egor"]) w.files.set(`life/people/${a}.json`, JSON.stringify({ people: ["anna", "clara", "dora", "egor"].filter((o) => o !== a).map((o) => ({ key: "c:" + o, name: o, seen: 3, lvl: "friend" })) }));
  const made = clubs.modClub(w.host.fs, settingsOf(w), noon, () => 0.4);
  expect(made.members.sort()).toEqual(["anna", "clara", "dora", "egor"]);
  // the user renames it, changes the members, switches it off
  const id = made.id;
  expect(w.route("POST", "/clubs/edit", { id, name: "My mushrooms", members: ["anna", "boris", "clara"], on: false }).json.club).toMatchObject({ name: "My mushrooms", on: false, by: "mod" });
  // deleting it remembers the interest for 14 days
  expect(at(noon, () => w.route("POST", "/clubs/remove", { id })).json.ok).toBe(true);
  expect(JSON.parse(w.files.get("clubs/state.json")!).removed).toEqual({ mushrooms: noon });
  const later = (days: number) => clubs.modClub(w.host.fs, settingsOf(w), noon + days * DAYMS, () => 0);
  expect(later(5)).toBeNull(); // the three-day gap is over, the interest is remembered
  expect(later(13)).toBeNull();
  expect(later(15)).toMatchObject({ interest: "mushrooms" });
  // a user's own club never makes the Moderator forget anything
  const w2 = world({ community: { clubs: true, clubsMod: false } });
  const mine = make(w2);
  w2.route("POST", "/clubs/remove", { id: mine });
  expect(w2.files.has("clubs/state.json")).toBe(false);
});

test("the tick starts the Moderator's club now and then, and it talks like any club afterwards", () => {
  const w = modWorld();
  tick(w, noon); // random 0: the Moderator's chance is met
  expect(w.route("GET", "/clubs").json.clubs).toHaveLength(1);
  expect(w.requests).toHaveLength(0); // a club made, nothing asked in the same tick
  tick(w, noon + MIN);
  expect(w.requests).toHaveLength(1);
  expect(w.requests[0]!.key).toMatch(/^cl:cl-/);
  // the global switch off: no club made
  const off = world({ community: { clubs: false, clubsMod: true } });
  withInterests(off, "anna", ["tea"]);
  withInterests(off, "boris", ["tea"]);
  withInterests(off, "clara", ["tea"]);
  tick(off, noon);
  expect(off.files.has("clubs/state.json")).toBe(false);
});

// ---------- settings and the rest ----------

test("the settings have the club switches, with the defaults and the clamps", () => {
  const d = profilesPlugin.DEFAULT_SETTINGS.community;
  expect(d).toMatchObject({ clubs: false, clubsPerDay: 12, clubsMod: true });
  const m = profilesPlugin.mergeSettings(profilesPlugin.DEFAULT_SETTINGS, { community: { clubs: true, clubsPerDay: 500, clubsMod: false } });
  expect(m.community).toMatchObject({ clubs: true, clubsPerDay: 40, clubsMod: false });
  expect(profilesPlugin.mergeSettings(m, { community: { clubsPerDay: 0 } }).community.clubsPerDay).toBe(1);
  expect(profilesPlugin.mergeSettings(m, { community: { clubsPerDay: "many", clubs: "yes" } }).community).toMatchObject({ clubsPerDay: 40, clubs: true });
  expect(profilesPlugin.mergeSettings(profilesPlugin.DEFAULT_SETTINGS, {}).community).toMatchObject({ clubs: false, clubsPerDay: 12, clubsMod: true });
  // the plugin reads the same file with the same clamps and the defaults
  const w = world({ community: { clubs: true, clubsPerDay: 99 } });
  expect(clubs.readSettings(w.host.fs)).toMatchObject({ on: true, perDay: 40, mod: true, model: "prov/chat" });
  expect(clubs.readSettings(world({ community: { clubsPerDay: -4 } }).host.fs).perDay).toBe(1);
  expect(clubs.readSettings(world({ community: {} }).host.fs)).toMatchObject({ on: false, perDay: 12, mod: true });
});

test("the manifest asks only for what the plugin uses; the strings exist in both languages", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "plugins/clubs/manifest.json"), "utf8"));
  expect(m.permissions).toEqual(["routes", "fs", "llm", "schedule"]);
  expect(m.priority).toBeGreaterThan(40);
  for (const lang of ["en", "uk"] as const) {
    const keys = Object.keys(dictionary[lang]);
    for (const k of ["messenger.clubs.title", "messenger.clubs.new", "messenger.clubs.create", "messenger.clubs.search", "messenger.clubs.counter", "messenger.clubs.offLine", "settings.community.clubs", "settings.community.clubs.limit", "settings.community.clubsMod"]) expect(keys).toContain(k);
  }
});
