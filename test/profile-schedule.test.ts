import { expect, test } from "bun:test";
import path from "node:path";
import { scheduleFor as clientScheduleFor } from "../src/mock/schedule";

// A week of its own for each character: the same profile always gets the same week, text hints pick the kind of day, and
// profiles with nothing to go on still differ. The client builds the week of a new profile with a twin of the engine's code.
const plugin = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
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
    llm: { results: {}, request: () => {} },
  };
  return { host, files };
}
const route = (host: any, method: string, p: string, body?: unknown) => plugin.handleRoute({ method, path: p, body }, host);

const STATUSES = ["online", "away", "dnd", "na", "off"];
const key = (w: string[][]) => JSON.stringify(w);
const onlineBands = (w: string[][]) => w.flat().filter((s) => s === "online").length;

test("a week is valid, deterministic per seed, and never the old shared one", () => {
  const flat = key(plugin.defaultSchedule());
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const w = plugin.scheduleFor("own-" + i, "");
    expect(w).toHaveLength(8);
    for (const row of w) {
      expect(row).toHaveLength(7);
      for (const s of row) expect(STATUSES).toContain(s);
    }
    // somebody is online every day, so the messenger and the forum always have someone to show
    for (let d = 0; d < 7; d++) expect(w.some((row: string[]) => row[d] === "online")).toBe(true);
    expect(key(w)).not.toBe(flat);
    expect(key(plugin.scheduleFor("own-" + i, ""))).toBe(key(w));
    seen.add(key(w));
  }
  expect(seen.size).toBeGreaterThan(280); // nearly every profile has its own week
});

test("profiles with no text at all spread over several kinds of day", () => {
  // when 'online' lands in the small hours the character is a night owl, in the evening only an evening person
  const kinds = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const w = plugin.scheduleFor("x" + i, "");
    const first = w[0].filter((s: string) => s === "online").length; // Monday 00-03
    const noon = w[4].filter((s: string) => s === "online").length; // Monday-Sunday 12-15
    kinds.add(first + ":" + noon);
  }
  expect(kinds.size).toBeGreaterThan(6);
});

test("hints in the text pick the kind of day", () => {
  const night = (w: string[][]) => w[0].filter((s) => s === "online").length + w[1].filter((s) => s === "online").length;
  let owlNights = 0;
  let officeNights = 0;
  for (let i = 0; i < 60; i++) {
    owlNights += night(plugin.scheduleFor("s" + i, "A night owl and a vampire: she is awake all night."));
    officeNights += night(plugin.scheduleFor("s" + i, "An accountant in an office, a clerk."));
  }
  expect(owlNights).toBeGreaterThan(officeNights * 3);
  // Ukrainian text works the same way
  let ukOwl = 0;
  for (let i = 0; i < 60; i++) ukOwl += night(plugin.scheduleFor("s" + i, "Нічна сова, безсоння, вампірка."));
  expect(ukOwl).toBeGreaterThan(officeNights * 3);
  // a word that only contains a hint does not count: "knight" is not "night", "нічого" is not "ніч"
  expect(key(plugin.scheduleFor("k", "A knight."))).toBe(key(plugin.scheduleFor("k", "")));
  expect(key(plugin.scheduleFor("k", "Нічого."))).toBe(key(plugin.scheduleFor("k", "")));
});

test("the same text on two ids still gives two weeks", () => {
  const a = plugin.scheduleFor("rp-a", "A student who plays games.");
  const b = plugin.scheduleFor("rp-b", "A student who plays games.");
  expect(key(a)).not.toBe(key(b));
  expect(onlineBands(a)).toBeGreaterThan(5);
});

test("the text of a profile comes from its About, interests, tags and habits", () => {
  const t = plugin.scheduleText({ about: "A", interests: ["B"], tags: ["C"], habits: [{ text: "D" }, 5], voice: { text: "never read" } });
  expect(t).toBe("A B C D");
  expect(plugin.scheduleText({})).toBe("");
});

test("a new profile saved without a week gets one of its own; two profiles differ", () => {
  const { host } = makeHost();
  const a = route(host, "PUT", "/profiles/own-1", { name: "A" }).json.profile.schedule;
  const b = route(host, "PUT", "/profiles/own-2", { name: "B" }).json.profile.schedule;
  expect(key(a)).not.toBe(key(b));
  expect(key(a)).not.toBe(key(plugin.defaultSchedule()));
  // saved again with no schedule it keeps being the same week, and a week the user sent is kept
  expect(key(route(host, "PUT", "/profiles/own-1", { name: "A" }).json.profile.schedule)).toBe(key(a));
  const mine = plugin.defaultSchedule();
  mine[0][0] = "online";
  expect(route(host, "PUT", "/profiles/own-3", { name: "C", schedule: mine }).json.profile.schedule[0][0]).toBe("online");
});

test("an imported profile gets a week from the digest, not the shared one", () => {
  const digest = { about: "A night owl who writes at dawn.", interests: ["tea"], habits: ["stays up"], voiceText: "", length: 1, formality: 30, never: [], rank: "", signature: "" };
  const a = plugin.profileFromDigest({ kind: "card", id: "a" }, { name: "A", title: "A v1" }, digest, 1);
  const b = plugin.profileFromDigest({ kind: "card", id: "b" }, { name: "B", title: "B v1" }, digest, 1);
  expect(key(a.schedule)).not.toBe(key(plugin.defaultSchedule()));
  expect(key(a.schedule)).not.toBe(key(b.schedule));
});

test("a stored profile with the old shared week gets its own once, an edited week is left alone", () => {
  const { host, files } = makeHost();
  const flat = plugin.defaultSchedule();
  const edited = plugin.defaultSchedule();
  edited[2][0] = "online";
  for (const [id, schedule] of [["old-1", flat], ["old-2", flat], ["mine", edited]] as const) {
    files.set("profiles/" + id + ".json", JSON.stringify({ id, name: id, about: "", schedule, createdAt: 1, updatedAt: 5 }));
  }
  const first = route(host, "GET", "/profiles").json.profiles;
  const by = (id: string) => first.find((p: any) => p.id === id);
  expect(key(by("old-1").schedule)).not.toBe(key(flat));
  expect(key(by("old-1").schedule)).not.toBe(key(by("old-2").schedule));
  expect(key(by("mine").schedule)).toBe(key(edited));
  // written to the file (the messenger and the forum read the file), with the stamps kept
  const stored = JSON.parse(files.get("profiles/old-1.json")!);
  expect(key(stored.schedule)).toBe(key(by("old-1").schedule));
  expect(stored.updatedAt).toBe(5);
  expect(stored.createdAt).toBe(1);
  // reading again changes nothing
  expect(plugin.migrateSchedules(host.fs)).toBe(0);
  expect(key(route(host, "GET", "/profiles").json.profiles.find((p: any) => p.id === "old-1").schedule)).toBe(key(stored.schedule));
});

test("the client's twin builds exactly the engine's week", () => {
  const texts = ["", "A night owl.", "Нічна сова", "Студент, геймер", "An accountant in an office.", "Письменник-самітник, a writer", "King of the forest, a warrior.", "Early bird, a baker at dawn."];
  for (let i = 0; i < 40; i++) {
    for (const t of texts) expect(key(clientScheduleFor("own-" + i, t))).toBe(key(plugin.scheduleFor("own-" + i, t)));
  }
});
