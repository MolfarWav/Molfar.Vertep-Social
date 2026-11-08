import { expect, test } from "bun:test";
import path from "node:path";
import { chipHue } from "../src/screens/profiles/ui";
import { filterProfiles, countBySource } from "../src/screens/profiles/search";
import { PROFILES } from "../src/mock/profiles";

const profiles = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

test("tags are kept short: at most 8, 24 characters each, plain text, no empty ones", () => {
  const p = profiles.cleanProfile({ name: "A", tags: ["  мовчазна ", "<b>тиха</b>", "", "x".repeat(40), 5, ...Array.from({ length: 12 }, (_, i) => "t" + i)] }, "a", 1, null);
  expect(p.tags).toHaveLength(8);
  expect(p.tags.slice(0, 3)).toEqual(["мовчазна", "тиха", "x".repeat(24)]);
  expect(profiles.cleanProfile({ name: "A" }, "a", 1, null).tags).toEqual([]);
  expect(profiles.cleanProfile({ name: "A", tags: "not a list" }, "a", 1, null).tags).toEqual([]);
});

test("a chip colour comes from its text: the same everywhere, case and spaces aside, always a hue", () => {
  expect(chipHue("очерет")).toBe(chipHue(" Очерет "));
  expect(chipHue("a")).not.toBe(chipHue("b"));
  for (const w of ["", "озеро", "тиха", "стара знайома", "🙂"]) {
    const h = chipHue(w);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  }
});

test("the source filter counts and picks profiles by where they came from", () => {
  const c = countBySource(PROFILES);
  expect(c.all).toBe(PROFILES.length);
  expect(c.roleplay + c.own + c.persona).toBe(PROFILES.length);
  expect(filterProfiles(PROFILES, "", "own").every((p) => p.source === "own")).toBe(true);
});
