// Subjects of the outside feed (#358): the plugin's matching and filtering, the settings it reads, and the screen's pure edits.
import { expect, test } from "bun:test";
import path from "node:path";
import { addCustom, inUse, NO_TOPICS, parseWords, removeCustom, toggleTopic } from "../src/screens/settings/topics";

const root = path.resolve(import.meta.dir, "..");
const life = await import(path.join(root, "plugins/life/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const base = () => life.readSettings({ read: () => JSON.stringify({ tzOffset: 0 }) });
const withTopics = (topics: unknown) => life.readSettings({ read: () => JSON.stringify({ tzOffset: 0, life: { topics } }) });
const rss = (items: [string, string][]) => `<rss><channel>${items.map(([t, d]) => `<item><title>${t}</title><description>${d}</description></item>`).join("")}</channel></rss>`;

test("the list: about fifty subjects, unique ids, every feed it names exists, words are lower case", () => {
  expect(life.TOPICS.length).toBeGreaterThanOrEqual(40);
  expect(life.TOPICS.length).toBeLessThanOrEqual(55);
  expect(new Set(life.TOPICS.map((t: any) => t.id)).size).toBe(life.TOPICS.length);
  const groups = life.TOPIC_GROUPS.map((g: any) => g.id);
  const feeds = new Set([...life.SOURCES, ...life.TOPIC_SOURCES].map((s: any) => s.id));
  for (const t of life.TOPICS) {
    expect(groups).toContain(t.group);
    expect(t.en && t.uk).toBeTruthy();
    expect(t.words.length).toBeGreaterThan(1);
    for (const w of t.words) expect(w).toBe(w.toLowerCase());
    for (const f of t.feeds) expect(feeds.has(f)).toBe(true);
  }
  for (const s of life.TOPIC_SOURCES) expect(new URL(s.url).hostname).toBe("feeds.bbci.co.uk");
});

test("topicHit: a feed the topic brings, a stem at the start of a word, a short stem only as a whole word", () => {
  const space = life.TOPICS.find((t: any) => t.id === "space");
  expect(life.topicHit(space, { from: "nasa", title: "Anything", text: "" })).toBe(true);
  expect(life.topicHit(space, { from: "bbc-world", title: "A rocket launch on Friday", text: "" })).toBe(true);
  expect(life.topicHit(space, { from: "pravda", title: "Запуск ракети до Місяця", text: "" })).toBe(true);
  expect(life.topicHit(space, { from: "bbc-world", title: "Tax rules change", text: "" })).toBe(false);
  const ai = life.TOPICS.find((t: any) => t.id === "ai");
  expect(life.topicHit(ai, { from: "x", title: "AI that writes", text: "" })).toBe(true);
  expect(life.topicHit(ai, { from: "x", title: "Aid arrives, said the aide", text: "" })).toBe(false);
});

test("the settings keep known ids only, at most twelve, and clean the user's own subjects", () => {
  const s = withTopics({ on: ["space", "nonsense", "space", ...life.TOPICS.slice(0, 20).map((t: any) => t.id)], custom: [{ label: "Foxes", words: "fox, red fox; vixen" }, { label: "", words: ["x"] }, { label: "No words", words: [] }, "bad"] });
  expect(s.topics.on.length).toBe(12);
  expect(s.topics.on).not.toContain("nonsense");
  expect(s.topics.custom).toHaveLength(1);
  expect(s.topics.custom[0].words).toEqual(["fox", "red fox", "vixen"]);
  expect(s.topics.custom[0].id).toMatch(/^c[a-z0-9]{1,12}$/);
  expect(base().topics).toEqual({ on: [], custom: [] });
  // the profiles plugin keeps them when it saves, and a patch without topics keeps the earlier ones
  const saved = profiles.mergeSettings(profiles.DEFAULT_SETTINGS, { life: { topics: { on: ["space"], custom: [{ id: "cfox", label: "Foxes", words: ["fox"] }] } } });
  expect(saved.life.topics).toEqual({ on: ["space"], custom: [{ id: "cfox", label: "Foxes", words: ["fox"] }] });
  expect(profiles.mergeSettings(saved, { life: { on: false } }).life.topics).toEqual(saved.life.topics);
  expect(profiles.mergeSettings(saved, { life: { topics: { on: [], custom: [] } } }).life.topics).toEqual({ on: [], custom: [] });
});

test("sourcesFor adds the section feeds of the chosen subjects, only in a category that is on", () => {
  const ids = (s: any) => life.sourcesFor(s, null).map((x: any) => x.id);
  expect(ids(base())).not.toContain("bbc-tech");
  expect(ids(withTopics({ on: ["tech", "europe"] }))).toEqual(expect.arrayContaining(["bbc-tech", "bbc-europe"]));
  const noNews = life.readSettings({ read: () => JSON.stringify({ tzOffset: 0, life: { cats: { news: false }, topics: { on: ["tech"] } } }) });
  expect(ids(noNews)).not.toContain("bbc-tech");
});

test("buildWorld keeps only what is about a chosen subject, counts them, and a changed choice makes a fetch due", () => {
  const s = withTopics({ on: ["space"], custom: [{ id: "cfox", label: "Foxes", words: ["fox"] }] });
  const results: Record<string, any> = {
    "w:bbc-world": { ok: true, text: rss([["A rocket reaches orbit", "x"], ["Tax rules change", "y"], ["A fox in the city", "z"]]) },
    "w:nasa": { ok: true, text: rss([["Moon update", "m"]]) },
  };
  const w = life.buildWorld(s, null, results, NOW, () => 0);
  const titles = w.items.map((i: any) => i.title).sort();
  expect(titles).toEqual(["A fox in the city", "A rocket reaches orbit", "Moon update"]);
  expect(w.byTopic).toEqual({ space: 2, cfox: 1 });
  expect(w.topicsKey).toBe(life.topicsKey(s));
  expect(w.items.every((i: any) => typeof i.from === "string")).toBe(true);
  // with no subject on nothing is dropped, as before
  expect(life.buildWorld(base(), null, results, NOW, () => 0).items).toHaveLength(4);
  // a feed saved under another choice is out of date; under the same one it is not
  const stale = { ...w, topicsKey: "other" };
  expect(life.worldDue(s, stale, null, NOW + 1000, 0)).toBe(true);
  expect(life.worldDue(s, { ...w, day: "2026-11-10", cats: life.CATS.filter((c: string) => c !== "weather") }, null, NOW + 1000, 0)).toBe(false);
});

test("GET /life/topics lists the subjects with their groups and today's counts", () => {
  const files = new Map<string, string>([[".cache/life/world.json", JSON.stringify({ day: "d", items: [], byTopic: { space: 3 } })]]);
  const fsx = { read: (p: string) => { if (!files.has(p)) throw new Error("ENOENT"); return files.get(p)!; }, write: () => {}, remove: () => {}, list: () => [] };
  const r = life.handleRoute({ path: "/life/topics", method: "GET" }, { fs: fsx } as any).json;
  expect(r.topics.length).toBe(life.TOPICS.length);
  expect(r.topics[0]).toEqual({ id: expect.any(String), group: expect.any(String), en: expect.any(String), uk: expect.any(String) });
  expect(r.groups.length).toBe(life.TOPIC_GROUPS.length);
  expect(r.max).toBe(12);
  expect(r.byTopic).toEqual({ space: 3 });
});

test("the screen's edits: words as typed, a cap on the subjects on, adding and removing the user's own", () => {
  expect(parseWords("Fox, red fox;  hare\nx, fox")).toEqual(["fox", "red fox", "hare"]);
  expect(parseWords("")).toEqual([]);
  let t = NO_TOPICS;
  t = toggleTopic(t, "space", 2);
  t = toggleTopic(t, "tech", 2);
  expect(toggleTopic(t, "ai", 2)).toBe(t); // full
  expect(toggleTopic(t, "space", 2).on).toEqual(["tech"]);
  const a = addCustom(NO_TOPICS, " Foxes ", "fox, vixen", 12, 6, () => "cone");
  expect(a).toEqual({ ok: { on: [], custom: [{ id: "cone", label: "Foxes", words: ["fox", "vixen"] }] } });
  // no words typed: the name itself is the word
  expect(addCustom(NO_TOPICS, "Hares", "", 12, 6, () => "ctwo")).toEqual({ ok: { on: [], custom: [{ id: "ctwo", label: "Hares", words: ["hares"] }] } });
  expect(addCustom(NO_TOPICS, "  ", "x", 12, 6)).toEqual({ error: "label" });
  expect(addCustom(NO_TOPICS, "A", ",", 12, 6)).toEqual({ error: "words" });
  expect(addCustom(t, "Foxes", "fox", 2, 6)).toEqual({ error: "full" });
  const one = (addCustom(NO_TOPICS, "Foxes", "fox", 12, 6, () => "cone") as any).ok;
  expect(addCustom(one, "Foxes", "fox", 12, 6, () => "cone")).toMatchObject({ ok: { custom: [{ id: "cone" }, { id: "conex" }] } });
  expect(removeCustom(one, "cone")).toEqual(NO_TOPICS);
  expect(inUse({ on: ["a", "b"], custom: one.custom })).toBe(3);
});
