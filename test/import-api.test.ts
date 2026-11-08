import { expect, test } from "bun:test";
import { ImportRunner, cardDateLabel, makeDiff, readEntry, readScan, type RunStatus } from "../src/screens/profiles/import-api";
import { PROFILES, type MockProfile, type ProfileForm } from "../src/mock/profiles";
import type { ImportEntry } from "../src/mock/profiles-import";

const row = (id: string, extra: object = {}) => ({ id, name: id.toUpperCase(), card: "Card " + id, soul: true, hue: 10, kind: "character", ref: { kind: "card", id }, ...extra });

test("a scan answer becomes entries; bad rows and a lost narrator are dropped", () => {
  const scan = readScan({
    state: "ready",
    characters: [row("a"), row("b", { parent: "gone" }), { id: "x" }, row("n", { kind: "narrator", ref: undefined }), row("m", { parent: "n" })],
    personas: [row("p", { kind: "persona", ref: { kind: "persona", id: "p" } }), row("bad", { ref: { kind: "other", id: "z" } })],
    hidden: { group: 2, assistant: 1, unreadable: -3 },
    truncated: true,
  });
  expect(scan.state).toBe("ready");
  if (scan.state !== "ready") return;
  expect(scan.entries.map((e) => e.id)).toEqual(["a", "b", "n", "m", "p"]);
  expect(scan.entries.find((e) => e.id === "b")?.parent).toBeUndefined();
  expect(scan.entries.find((e) => e.id === "m")?.parent).toBe("n");
  expect(scan.hidden).toEqual({ group: 2, assistant: 1, unreadable: 0 });
  expect(scan.truncated).toBe(true);
  expect(readScan({ state: "closed" })).toEqual({ state: "closed" });
  expect(readScan(null)).toEqual({ state: "closed" });
  expect(readEntry({ ...row("a"), kind: "alien" })).toBeNull();
});

const entry = (id: string): ImportEntry => ({ id, name: id, card: "", soul: true, hue: 0, kind: "character", ref: { kind: "card", id } });
const prof = (id: string): MockProfile => ({ ...PROFILES[1]!, id, name: id });
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(r: ImportRunner) {
  for (let i = 0; i < 50 && !r.finished; i++) await tick();
}

test("the runner imports one card at a time, in order, and reports each profile", async () => {
  const order: string[] = [];
  let running = 0;
  let overlap = false;
  const got: string[] = [];
  const r = new ImportRunner(
    ["a", "b", "c"].map(entry),
    async (e) => {
      running++;
      if (running > 1) overlap = true;
      order.push(e.id);
      await tick();
      running--;
      return prof(e.id);
    },
    (p) => void got.push(p.id),
  );
  const seen: RunStatus[][] = [];
  r.subscribe(() => seen.push(Object.values(r.snapshot().status)));
  r.start();
  expect(r.finished).toBe(false);
  await settle(r);
  expect(order).toEqual(["a", "b", "c"]);
  expect(overlap).toBe(false);
  expect(got).toEqual(["a", "b", "c"]);
  expect(r.doneIds()).toEqual(["a", "b", "c"]);
  expect(r.finished).toBe(true);
  expect(r.profileOf("b")?.id).toBe("b");
  // some moment had one card reading and the rest queued
  expect(seen.some((s) => s.join() === "reading,queued,queued")).toBe(true);
});

test("a failing card stops only itself; Try again runs it later and keeps the others", async () => {
  let fail = true;
  const r = new ImportRunner(["a", "b", "c"].map(entry), async (e) => {
    await tick();
    if (e.id === "b" && fail) throw new Error("the model did not answer");
    return prof(e.id);
  });
  r.start();
  await settle(r);
  expect(r.snapshot().status).toEqual({ a: "done", b: "failed", c: "done" });
  expect(r.snapshot().errors.b).toBe("the model did not answer");
  expect(r.finished).toBe(true);
  fail = false;
  r.retry("b");
  expect(r.snapshot().status.b).not.toBe("failed");
  await settle(r);
  expect(r.snapshot().status).toEqual({ a: "done", b: "done", c: "done" });
  expect(r.snapshot().errors.b).toBeUndefined();
  r.retry("a"); // only a failed card can be retried
  expect(r.snapshot().status.a).toBe("done");
});

test("Stop lets the running card finish and starts no more", async () => {
  const started: string[] = [];
  const r = new ImportRunner(["a", "b", "c"].map(entry), async (e) => {
    started.push(e.id);
    await tick();
    return prof(e.id);
  });
  r.start();
  r.stop();
  await settle(r);
  expect(started).toEqual(["a"]);
  expect(r.snapshot().status).toEqual({ a: "done", b: "queued", c: "queued" });
  expect(r.finished).toBe(true);
});

test("a frozen run (design preview) executes nothing until a failed card is retried", async () => {
  let calls = 0;
  const frozen: Record<string, RunStatus> = { a: "done", b: "failed", c: "reading" };
  const r = new ImportRunner(["a", "b", "c"].map(entry), async (e) => {
    calls++;
    return prof(e.id);
  }, undefined, frozen);
  r.start();
  await tick();
  expect(calls).toBe(0);
  expect(r.finished).toBe(false);
  r.retry("b");
  await tick();
  expect(calls).toBeGreaterThan(0);
});

const form = (over: Partial<ProfileForm> = {}): ProfileForm => ({
  nick: "N",
  about: "Old about.",
  interests: ["вода", "очерет"],
  habits: [{ id: "h1", text: "habit", by: "you" }],
  habitsAuto: true,
  voice: { text: "Old voice", length: 1, emoji: 0, formality: 30, never: ["x"] },
  forum: { rank: "r", signature: "s", frequency: 35, opensOwn: true, repliesYou: true, repliesOthers: true, favourites: [] },
  schedule: PROFILES[0]!.schedule,
  ...over,
});

test("the update diff lists what changes and never touches habits, forum or schedule", () => {
  const f = form();
  const d = makeDiff(f, { about: "New about.", interests: ["вода", "Чутки", "чутки", "тин"], voiceText: "New voice" });
  expect(d).not.toBeNull();
  expect(d!.rows.map((r) => r.field)).toEqual(["about", "voice", "interests"]);
  expect(d!.rows[0]).toEqual({ field: "about", removed: ["Old about."], added: ["New about."] });
  expect(d!.rows[2]).toEqual({ field: "interests", removed: [], added: ["Чутки", "тин"] });
  expect(d!.patch.about).toBe("New about.");
  expect(d!.patch.voice).toEqual({ ...f.voice, text: "New voice" });
  expect(d!.patch.interests).toEqual(["вода", "очерет", "Чутки", "тин"]);
  expect(Object.keys(d!.patch).sort()).toEqual(["about", "interests", "voice"]);
});

test("no diff when the reading says what the profile already says", () => {
  const f = form();
  expect(makeDiff(f, { about: "  Old   about. ", interests: ["Вода"], voiceText: "Old voice" })).toBeNull();
  // an empty answer never wipes a field
  expect(makeDiff(f, { about: "", interests: [], voiceText: "" })).toBeNull();
  // an empty About gets filled, with nothing struck
  const d = makeDiff(form({ about: "" }), { about: "Fresh", interests: [], voiceText: "" });
  expect(d!.rows).toEqual([{ field: "about", removed: [], added: ["Fresh"] }]);
});

test("the card date reads in the UI language, and a ready text stays as it is", () => {
  expect(cardDateLabel("2026-11-09", "uk")).toContain("листопада");
  expect(cardDateLabel("2026-11-09", "en")).toContain("November");
  expect(cardDateLabel("8 листопада", "uk")).toBe("8 листопада");
  expect(cardDateLabel(undefined, "en")).toBe("");
  expect(cardDateLabel("2026-13-45", "en")).not.toContain("undefined");
});
