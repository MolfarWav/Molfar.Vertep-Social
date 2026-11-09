import { expect, test } from "bun:test";
import path from "node:path";
import { REAL_DEFAULTS, adoptEngine, applyPatch, fromEngine, mergePatch, modelOptions } from "@/screens/settings/real";

// The plugin is plain JS; its DEFAULT_SETTINGS is the shape the screen's defaults must match.
const plugin = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

test("the screen's defaults are the plugin's defaults (plus usedToday, which the forum fills later)", () => {
  const { usedToday, ...rest } = REAL_DEFAULTS;
  expect(usedToday).toBe(0);
  // tzOffset is stored by the app shell (the browser's offset), not edited on this screen
  const { tzOffset, ...engine } = plugin.DEFAULT_SETTINGS;
  expect(tzOffset).toBeNull();
  expect(rest).toEqual(engine);
});

test("fromEngine adds usedToday as 0", () => {
  const { usedToday: _, ...engine } = REAL_DEFAULTS;
  expect(fromEngine(engine).usedToday).toBe(0);
});

test("mergePatch keeps the earlier edits and merges nested models and notify key by key", () => {
  const a = mergePatch(null, { postsPerDay: 10, models: { messenger: "x/a", forum: "", import: "" } });
  const b = mergePatch(a, { postsPerDay: 12, models: { forum: "y/b" } as never, notify: { sound: true } as never });
  expect(b.postsPerDay).toBe(12);
  expect(b.models).toEqual({ messenger: "x/a", forum: "y/b", import: "" } as never);
  expect(b.notify).toEqual({ sound: true } as never);
});

test("mergePatch with no earlier patch returns a copy of the new one; no nested keys appear unless set", () => {
  const p = { autonomous: false };
  const m = mergePatch(null, p);
  expect(m).toEqual({ autonomous: false });
  expect(m).not.toBe(p);
  expect("models" in mergePatch({ autonomous: true }, { autonomous: false })).toBe(false);
  expect(mergePatch(null, null)).toEqual({});
});

test("applyPatch changes only the given keys", () => {
  const s = applyPatch(REAL_DEFAULTS, { activity: "lively", models: { messenger: "x/a" } as never });
  expect(s.activity).toBe("lively");
  expect(s.models).toEqual({ messenger: "x/a", forum: "", import: "", image: "" });
  expect(s.postsPerDay).toBe(REAL_DEFAULTS.postsPerDay);
});

test("adoptEngine takes the engine's clamped value for a key the screen still holds", () => {
  const sent = { postsPerDay: 500 };
  const local = applyPatch(REAL_DEFAULTS, sent);
  const after = adoptEngine(local, sent, { postsPerDay: 200 });
  expect(after.postsPerDay).toBe(200);
});

test("adoptEngine keeps an edit made after the save started, even when the engine changed that key", () => {
  const sent = { postsPerDay: 500 };
  const local = applyPatch(applyPatch(REAL_DEFAULTS, sent), { postsPerDay: 7 });
  const after = adoptEngine(local, sent, { postsPerDay: 200 });
  expect(after.postsPerDay).toBe(7);
});

test("adoptEngine corrects nested keys and leaves keys the save did not send alone", () => {
  const sent = { notify: { tab: true, system: true, sound: 3 } as never };
  const local = applyPatch(REAL_DEFAULTS, { ...sent, activity: "chaotic" });
  const after = adoptEngine(local, sent, { notify: { tab: true, system: true, sound: false } });
  expect(after.notify.sound).toBe(false);
  expect(after.activity).toBe("chaotic");
});

test("adoptEngine ignores engine keys that are missing", () => {
  const sent = { postsPerDay: 5 };
  const local = applyPatch(REAL_DEFAULTS, sent);
  expect(adoptEngine(local, sent, {}).postsPerDay).toBe(5);
});

test("model options: the engine default first, then the switched-on models", () => {
  const choices = [
    { ref: "a/one", label: "One", provider: "Alpha" },
    { ref: "b/two", label: "Two", provider: "Beta" },
  ];
  expect(modelOptions(choices, "", "Engine default")).toEqual([
    { value: "", label: "Engine default" },
    { value: "a/one", label: "One", group: "Alpha", sub: "one" },
    { value: "b/two", label: "Two", group: "Beta", sub: "two" },
  ]);
});

test("a saved model that is not in the list shows as its own text, once", () => {
  const choices = [{ ref: "a/one", label: "One" }];
  expect(modelOptions(choices, "gone/model", "Engine default").slice(-1)).toEqual([{ value: "gone/model", label: "gone/model" }]);
  expect(modelOptions(choices, "a/one", "Engine default").filter((o) => o.value === "a/one")).toHaveLength(1);
});

test("with no list yet, the picker still offers the engine default and the saved value", () => {
  expect(modelOptions([], "", "Engine default")).toEqual([{ value: "", label: "Engine default" }]);
  expect(modelOptions([], "x/y", "Engine default")).toEqual([
    { value: "", label: "Engine default" },
    { value: "x/y", label: "x/y" },
  ]);
});
