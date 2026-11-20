import { expect, test } from "bun:test";
import { SETTINGS_MOCK, type SettingsMock } from "../src/mock/settings";
import { flagsOf, foldSummary, type FoldGroup } from "../src/screens/settings/fold-summary";
import { TABS } from "../src/shell/nav";
import { strings as settingsStrings } from "../src/screens/settings/strings";

// A folded group on a phone says what it is set to: the key is looked up in the real strings.
const en = settingsStrings.en as Record<string, string>;
const t = ((key: string, vars: Record<string, string | number> = {}) => {
  const raw = en[key];
  if (raw === undefined) throw new Error(`missing string ${key}`);
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
}) as never;
const GROUPS: FoldGroup[] = ["forum", "messenger", "life", "community", "members", "pictures"];
const base = (): SettingsMock => structuredClone(SETTINGS_MOCK);

test("a group with one main switch says Off, or what it is set to", () => {
  const s = base();
  s.autonomous = true;
  s.activity = "moderate";
  s.postsPerDay = 30;
  expect(foldSummary(t, s, "forum")).toBe("Moderate · 30 a day");
  s.autonomous = false;
  expect(foldSummary(t, s, "forum")).toBe("Off");
  s.life.on = true;
  expect(foldSummary(t, s, "life")).toBe("On");
  s.life.on = false;
  expect(foldSummary(t, s, "life")).toBe("Off");
  s.images = { on: true, perDay: 2 };
  expect(foldSummary(t, s, "pictures")).toBe("On · 2 a day");
  s.images.on = false;
  expect(foldSummary(t, s, "pictures")).toBe("Off");
});

test("a group of several switches counts the ones that are on", () => {
  const s = base();
  s.messengerFirst = true;
  s.messengerSummary = false;
  s.messengerRecall = false;
  s.messengerPlace = false;
  s.factsShare = true;
  expect(foldSummary(t, s, "messenger")).toBe("2 of 5 on");
  s.messengerFirst = s.factsShare = false;
  expect(foldSummary(t, s, "messenger")).toBe("Off");
  s.community.gossip = true;
  s.community.jealousy = false;
  s.community.reposts = false;
  expect(foldSummary(t, s, "members")).toBe("1 of 3 on");
});

test("every group has at least one switch, and the count never exceeds it", () => {
  const s = base();
  for (const g of GROUPS) {
    expect(flagsOf(s, g).length).toBeGreaterThan(0);
    expect(flagsOf(s, g).every((v) => typeof v === "boolean")).toBe(true);
    expect(foldSummary(t, s, g).length).toBeGreaterThan(0);
  }
});

test("the More page is a tab of its own", () => {
  expect(TABS).toContain("more");
  expect(TABS).toContain("settings");
});
