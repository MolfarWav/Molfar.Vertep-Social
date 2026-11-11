// Levels of familiarity, ties and milestones (#366): the Life plugin keeps them per person in life/people/<id>.json and the
// forum, the messenger and the characters' own chats read them as one or two lines of a prompt.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const chatter = await import(path.join(root, "plugins/chatter/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

function makeHost(files: Map<string, string> = new Map()) {
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
    llm: { results: {}, request: () => {} },
    net: { results: {}, request: () => {} },
  };
  return { files, host };
}
type H = ReturnType<typeof makeHost>;
const put = (h: H, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: H, p: string) => JSON.parse(h.files.get(p)!);
const call = (h: H, method: string, p: string, body?: unknown) => life.handleRoute({ method, path: p, body }, h.host);

const prof = (id: string, extra: object = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), hue: 100, about: "x", interests: [], habits: [], voice: {}, life: { on: true, world: true }, ...extra });
function seed(adultA = true, adultB = true) {
  const h = makeHost();
  put(h, "profiles/anna.json", prof("anna", adultA ? { adult: true } : {}));
  put(h, "profiles/boris.json", prof("boris", adultB ? { adult: true } : {}));
  put(h, "you.json", { active: "me1", personas: [{ id: "me1", name: "Serhiy", about: "" }] });
  return h;
}
const ev = (key: string, at: number, extra: object = {}) => ({ key, name: key, at, where: "forum", seen: 1, toMe: 0, fromMe: 0, said: "", tone: 0, ...extra });

// ---------- the level the meetings reach ----------

test("autoIndex climbs with meetings and feeling, never falls on its own, and a quarrel caps it at acquaintance", () => {
  const p = (o: object) => ({ seen: 0, toMe: 0, fromMe: 0, feel: 0, ...o });
  expect(life.autoIndex(p({}), 0)).toBe(0);
  expect(life.autoIndex(p({ seen: 1 }), 0)).toBe(1);
  expect(life.autoIndex(p({ toMe: 2, fromMe: 1 }), 0)).toBe(2);
  expect(life.autoIndex(p({ toMe: 5, fromMe: 4, feel: 4 }), 0)).toBe(3);
  expect(life.autoIndex(p({ toMe: 9, fromMe: 9, feel: 4 }), 0)).toBe(4);
  expect(life.autoIndex(p({ toMe: 20, fromMe: 20, feel: 8 }), 0)).toBe(5);
  // the feeling cooled: the level stays
  expect(life.autoIndex(p({ toMe: 20, fromMe: 20, feel: 0 }), 5)).toBe(5);
  // a quarrel pulls it back
  expect(life.autoIndex(p({ toMe: 20, fromMe: 20, feel: -5 }), 5)).toBe(2);
  // never the top rung by itself
  expect(life.autoIndex(p({ toMe: 500, fromMe: 500, feel: 12 }), 6)).toBeLessThan(6);
});

test("mergeEvents settles the level; a milestone is written when it moves past acquaintance, none for a new person", () => {
  const pf = life.emptyPeople();
  life.mergeEvents(pf, [ev("c:boris", 1000)]);
  const b = pf.people[0];
  expect(b.lvl).toBe("slight");
  expect(b.marks).toEqual([]);
  life.mergeEvents(pf, Array.from({ length: 4 }, (_, i) => ev("c:boris", 2000 + i, { toMe: 1 })));
  expect(b.lvl).toBe("acquaintance");
  expect(b.marks).toEqual([{ at: 2003, k: "level", v: "acquaintance", up: true }]);
});

test("a feeling that crosses a band is a milestone, once a day at most", () => {
  const pf = life.emptyPeople();
  life.mergeEvents(pf, [ev("c:boris", 1000)]);
  life.mergeEvents(pf, Array.from({ length: 3 }, (_, i) => ev("c:boris", 2000 + i, { tone: 1 })));
  expect(pf.people[0].marks.some((m: any) => m.k === "feel" && m.v === "warm")).toBe(true);
  life.mergeEvents(pf, Array.from({ length: 12 }, (_, i) => ev("c:boris", 3000 + i, { tone: -1 })));
  const feel = pf.people[0].marks.filter((m: any) => m.k === "feel").map((m: any) => m.v);
  expect(feel).toContain("hostile");
  expect(new Set(feel).size).toBe(feel.length);
});

test("a list written before levels existed gets its level worked out on read, with no milestone", () => {
  const h = seed();
  put(h, "life/people/anna.json", { scanned: 5, noteDay: "", failedAt: 0, people: [{ key: "c:boris", name: "Boris", first: 1, last: 2, seen: 9, toMe: 0, fromMe: 0, said: [], note: "", feel: 0 }] });
  const pf = life.readPeople(h.host.fs, "anna");
  expect(pf.people[0].lvl).toBe("acquaintance");
  expect(pf.people[0].marks).toEqual([]);
});

// ---------- setting them by hand ----------

test("a level set by hand is a floor; pinned it holds exactly; the view says why", () => {
  const h = seed();
  put(h, "life/people/anna.json", { scanned: 5, noteDay: "", failedAt: 0, people: [] });
  let r = call(h, "PUT", "/life/people/anna/c:boris", { level: "friend" });
  expect(r.status).toBe(200);
  let x = r.json.people.find((p: any) => p.key === "c:boris");
  expect(x.level).toMatchObject({ id: "friend", manual: "friend", pinned: false });
  // met a lot: the meetings go past the floor
  const pf = life.readPeople(h.host.fs, "anna");
  life.mergeEvents(pf, Array.from({ length: 40 }, (_, i) => ev("c:boris", 5000 + i, { toMe: 1, fromMe: 1, tone: 1 })));
  expect(pf.people[0].lvl).toBe("close");
  put(h, "life/people/anna.json", pf);
  // pinned: exactly this
  r = call(h, "PUT", "/life/people/anna/c:boris", { level: "slight", pinned: true });
  x = r.json.people.find((p: any) => p.key === "c:boris");
  expect(x.level).toMatchObject({ id: "slight", pinned: true });
  // back to automatic
  r = call(h, "PUT", "/life/people/anna/c:boris", { level: "" });
  expect(r.json.people.find((p: any) => p.key === "c:boris").level.manual).toBe("");
});

test("someone not met yet can be added; a stranger key or oneself is refused", () => {
  const h = seed();
  expect(call(h, "PUT", "/life/people/anna/c:boris", { level: "friend" }).status).toBe(200);
  expect(call(h, "PUT", "/life/people/anna/u:me1", { level: "acquaintance" }).status).toBe(200);
  expect(call(h, "PUT", "/life/people/anna/c:nobody", { level: "friend" }).status).toBe(404);
  expect(call(h, "PUT", "/life/people/anna/u:nobody", { level: "friend" }).status).toBe(404);
  expect(call(h, "PUT", "/life/people/anna/c:anna", { level: "friend" }).status).toBe(404);
  expect(call(h, "PUT", "/life/people/anna/c:boris", { level: "king" }).status).toBe(400);
  const list = call(h, "GET", "/life/people/anna").json;
  expect(list.people.map((p: any) => p.key).sort()).toEqual(["c:boris", "u:me1"]);
  expect(list.candidates).toEqual([]);
});

test("the list offers the characters and personas not in it yet, with whether romance may be offered", () => {
  const h = seed(true, false);
  const list = call(h, "GET", "/life/people/anna").json;
  expect(list.candidates).toEqual([
    { key: "c:boris", name: "Boris", kind: "character", romance: false, about: "x" },
    { key: "u:me1", name: "Serhiy", kind: "user", romance: true, about: "" },
  ]);
  expect(list.adult).toBe(true);
});

// ---------- ties ----------

test("ties are cleaned: known types, a label for 'other', no repeats, at most four", () => {
  expect(life.cleanTies([{ type: "spouse" }, { type: "spouse" }, { type: "nope" }, { type: "other" }, { type: "other", label: "old friend <b>" }])).toEqual([{ type: "spouse" }, { type: "other", label: "old friend" }]);
  expect(life.cleanTies(Array.from({ length: 9 }, (_, i) => ({ type: "other", label: "x" + i }))).length).toBe(4);
  expect(life.cleanTies("no")).toEqual([]);
});

test("family and work ties are mirrored to the other character; romantic ones stay on one side", () => {
  const h = seed();
  const r = call(h, "PUT", "/life/people/anna/c:boris", { ties: [{ type: "parent" }, { type: "crush" }, { type: "colleague" }] });
  expect(r.status).toBe(200);
  const other = get(h, "life/people/boris.json").people.find((p: any) => p.key === "c:anna");
  expect(other.ties).toEqual([{ type: "child" }, { type: "colleague" }]);
  // changing it changes the other side, and what only the other side holds is kept
  call(h, "PUT", "/life/people/boris/c:anna", { ties: [{ type: "child" }, { type: "dating" }] });
  call(h, "PUT", "/life/people/anna/c:boris", { ties: [{ type: "sibling" }] });
  const again = get(h, "life/people/boris.json").people.find((p: any) => p.key === "c:anna");
  expect(again.ties).toEqual([{ type: "dating" }, { type: "sibling" }]);
});

test("removing every tie of a person never met removes the entry; the mirrored side too", () => {
  const h = seed();
  call(h, "PUT", "/life/people/anna/c:boris", { ties: [{ type: "spouse" }] });
  call(h, "PUT", "/life/people/anna/c:boris", { ties: [] });
  expect(get(h, "life/people/anna.json").people).toEqual([]);
  expect(get(h, "life/people/boris.json").people).toEqual([]);
});

test("a tie to the user's persona is one-way (a persona has no list) and a tie raises a milestone", () => {
  const h = seed();
  call(h, "PUT", "/life/people/anna/u:me1", { ties: [{ type: "spouse" }] });
  const x = get(h, "life/people/anna.json").people.find((p: any) => p.key === "u:me1");
  expect(x.ties).toEqual([{ type: "spouse" }]);
  expect(x.marks).toEqual([expect.objectContaining({ k: "tie", v: "spouse" })]);
});

test("romance is for adults only: both characters, or the character and the user's persona; a hard rule", () => {
  const h = seed(true, false);
  expect(call(h, "PUT", "/life/people/anna/c:boris", { ties: [{ type: "crush" }] }).status).toBe(409);
  expect(call(h, "PUT", "/life/people/anna/u:me1", { ties: [{ type: "dating" }] }).status).toBe(200);
  const h2 = seed(false, true);
  expect(call(h2, "PUT", "/life/people/anna/u:me1", { ties: [{ type: "dating" }] }).status).toBe(409);
  expect(call(h2, "PUT", "/life/people/boris/c:anna", { ties: [{ type: "ex" }] }).status).toBe(409);
  // family and work do not need it
  expect(call(h2, "PUT", "/life/people/anna/c:boris", { ties: [{ type: "sibling" }] }).status).toBe(200);
});

test("the level can be copied to the other side once, only where it has none", () => {
  const h = seed();
  call(h, "PUT", "/life/people/anna/c:boris", { level: "friend", mirror: true });
  expect(get(h, "life/people/boris.json").people.find((p: any) => p.key === "c:anna").tier).toBe("friend");
  call(h, "PUT", "/life/people/anna/c:boris", { level: "close", mirror: true });
  expect(get(h, "life/people/boris.json").people.find((p: any) => p.key === "c:anna").tier).toBe("friend");
});

// ---------- forgetting ----------

test("forgetting a person keeps a level or a tie set by hand and clears the rest; the others go", () => {
  const h = seed();
  put(h, "life/people/anna.json", {
    scanned: 5,
    noteDay: "",
    failedAt: 0,
    people: [
      { key: "c:boris", name: "Boris", first: 1, last: 2, seen: 9, toMe: 4, fromMe: 3, said: [], note: "Kind.", feel: 5, tier: "friend", ties: [{ type: "sibling" }] },
      { key: "u:me1", name: "Serhiy", first: 1, last: 2, seen: 3, toMe: 1, fromMe: 1, said: [], note: "", feel: 0 },
    ],
  });
  let r = call(h, "DELETE", "/life/people/anna/c:boris");
  let b = r.json.people.find((p: any) => p.key === "c:boris");
  expect(b).toMatchObject({ seen: 0, note: "", tier: "friend", ties: [{ type: "sibling" }] });
  expect(b.level.id).toBe("friend");
  r = call(h, "DELETE", "/life/people/anna/u:me1");
  expect(r.json.people.map((p: any) => p.key)).toEqual(["c:boris"]);
  r = call(h, "DELETE", "/life/people/anna");
  expect(r.json.people.map((p: any) => p.key)).toEqual(["c:boris"]);
});

test("a person with a tie is never dropped by the list cap", () => {
  const pf = life.emptyPeople();
  life.mergeEvents(pf, Array.from({ length: 45 }, (_, i) => ev("c:p" + i, 1000 + i)));
  expect(pf.people.length).toBe(40);
  const h = seed();
  put(h, "life/people/anna.json", { ...pf, people: pf.people.map((p: any) => ({ ...p })) });
  call(h, "PUT", "/life/people/anna/c:boris", { ties: [{ type: "sibling" }] });
  expect(get(h, "life/people/anna.json").people.some((p: any) => p.key === "c:boris")).toBe(true);
});

// ---------- the prompt ----------

const listOf = (h: H, id: string, people: object[]) => put(h, `life/people/${id}.json`, { scanned: 0, noteDay: "", failedAt: 0, people });

test("the four plugins carry the same relation reader", () => {
  const block = (f: string) => /\/\/ <relation-shared>[\s\S]*?\/\/ <\/relation-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n"))?.[0];
  const m = block("plugins/messenger/plugin.js");
  expect(m).toBeTruthy();
  expect(block("plugins/forum/plugin.js")).toBe(m);
  expect(block("plugins/chatter/plugin.js")).toBe(m);
  expect(block("plugins/clubs/plugin.js")).toBe(m);
});

test("metLine tells the level and the ties, with no diary and no meetings", () => {
  const h = seed();
  h.files.set("settings.json", JSON.stringify({ life: { on: false } }));
  listOf(h, "anna", [{ key: "c:boris", name: "Boris", seen: 0, toMe: 0, fromMe: 0, said: [], note: "", feel: 0, lvl: "close", ties: [{ type: "sibling" }, { type: "other", label: "old neighbour" }] }]);
  const line = messenger.metLine(h.host.fs, { id: "anna" }, "c:boris");
  expect(line).toContain("You are close friends");
  expect(line).toContain("Boris is your brother or sister.");
  expect(line).toContain("Your tie with Boris: old neighbour.");
  expect(forum.metLine(h.host.fs, { id: "anna" }, "c:boris")).toBe(line);
  expect(messenger.metLine(h.host.fs, { id: "anna" }, "c:nobody")).toBe("");
});

test("a romantic tie is told only when it is allowed, and between characters the line carries the ceiling", () => {
  const h = seed(true, true);
  listOf(h, "anna", [
    { key: "c:boris", name: "Boris", lvl: "friend", ties: [{ type: "crush" }] },
    { key: "u:me1", name: "Serhiy", lvl: "friend", ties: [{ type: "partner" }] },
  ]);
  const toBoris = messenger.metLine(h.host.fs, { id: "anna" }, "c:boris");
  expect(toBoris).toContain("You have a crush on Boris.");
  expect(toBoris).toContain("never anything explicit");
  const toUser = messenger.metLine(h.host.fs, { id: "anna" }, "u:me1");
  expect(toUser).toContain("Serhiy is your partner.");
  expect(toUser).not.toContain("explicit");
  // the other character is not marked adult any more: no romance, the level stays
  put(h, "profiles/boris.json", prof("boris"));
  const cold = messenger.metLine(h.host.fs, { id: "anna" }, "c:boris");
  expect(cold).not.toContain("crush");
  expect(cold).toContain("You are friends.");
  // this character is not adult: nothing at all
  put(h, "profiles/anna.json", prof("anna"));
  expect(messenger.metLine(h.host.fs, { id: "anna" }, "u:me1")).not.toContain("partner");
});

test("the characters' own chats read the same lines", () => {
  const h = seed();
  listOf(h, "anna", [{ key: "c:boris", name: "Boris", seen: 2, toMe: 1, fromMe: 1, said: [], note: "Dry humour.", feel: 8, lvl: "close", ties: [{ type: "colleague" }] }]);
  const line = chatter.relationLine(h.host.fs, "anna", "boris");
  expect(line).toContain("Dry humour.");
  expect(line).toContain("You are close friends");
  expect(line).toContain("Boris is your colleague.");
});

// ---------- the adult flag ----------

test("a profile keeps adult only when it is exactly true", () => {
  const raw = { name: "Anna", about: "x", source: "manual" };
  expect(profiles.cleanProfile({ ...raw, adult: true }, "anna", 1, null).adult).toBe(true);
  expect(profiles.cleanProfile({ ...raw, adult: "yes" }, "anna", 1, null).adult).toBeUndefined();
  expect(profiles.cleanProfile(raw, "anna", 1, null).adult).toBeUndefined();
});

test("an imported card is adult only by a structured age of 18 or more", () => {
  const doc = (age: unknown) => ({ name: "A", description: "d", extensions: { molfar_profile: { identity: { first: "A", age } } } });
  const m = (age: unknown) => profiles.buildMaterial({ kind: "card", id: "x" }, doc(age));
  expect(m(25).adult).toBe(true);
  expect(m("30 years").adult).toBe(true);
  expect(m("17").adult).toBe(false);
  expect(m("").adult).toBe(false);
  expect(m("ageless").adult).toBe(false);
  expect(profiles.buildMaterial({ kind: "card", id: "x" }, { name: "A", description: "d" }).adult).toBe(false);
});
