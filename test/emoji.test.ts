import { expect, test } from "bun:test";
import { dictionary } from "@/i18n/index";
import { EMOJI, GROUPS, GROUP_ICONS, labelOf, withTone } from "@/emoji/data";
import { insertAt } from "@/emoji/insert";
import { RECENT_MAX, loadRecent, loadTone, pushRecent, saveRecent, saveTone } from "@/emoji/recent";
import { searchEmoji } from "@/emoji/search";

const lone = (s: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);

test("the data: nine groups, named in both languages, every emoji has both names", () => {
  expect(GROUPS).toHaveLength(9);
  expect(GROUP_ICONS).toHaveLength(9);
  for (const g of GROUPS) {
    expect(g.en.length).toBeGreaterThan(2);
    expect(g.uk).toMatch(/[Ѐ-ӿ]/);
  }
  expect(EMOJI.length).toBeGreaterThan(1500);
  const seen = new Set<string>();
  for (const e of EMOJI) {
    expect(e.char.length).toBeGreaterThan(0);
    expect(seen.has(e.char), e.char).toBe(false);
    seen.add(e.char);
    expect(e.en.length).toBeGreaterThan(0);
    expect(e.uk.length).toBeGreaterThan(0);
    expect(e.group).toBeGreaterThanOrEqual(0);
    expect(e.group).toBeLessThan(GROUPS.length);
    if (e.skins) expect(e.skins).toHaveLength(5);
  }
  // the tab strip icons are real emoji of the data, one per group, in the order of the groups
  GROUP_ICONS.forEach((icon, i) => {
    const e = EMOJI.find((x) => x.char === icon);
    expect(e, icon).toBeTruthy();
    expect(e!.group).toBe(i);
  });
});

test("the data stops at the version the bundled font covers (nothing from Emoji 16 on)", () => {
  // the first emoji of Emoji 16, 17 and 18 (a face with bags, a cracking face, a distorted face): drawn as boxes by the font
  for (const c of ["\u{1FAE9}", "\u{1FAEA}", "\u{1FAEB}", "\u{1FAC6}"]) expect(EMOJI.some((e) => e.char === c)).toBe(false);
  expect(EMOJI.some((e) => e.char === "\u{1F979}")).toBe(true); // face holding back tears, Emoji 14
  expect(EMOJI.some((e) => e.char === "\u{1FAE8}")).toBe(true); // shaking face, Emoji 15
});

test("skin tones: the variants are the same emoji in five tones; the default stays yellow", () => {
  const wave = EMOJI.find((e) => e.char === "👋")!;
  expect(withTone(wave, 0)).toBe("👋");
  expect(withTone(wave, 3)).toBe("👋🏽");
  expect(withTone(wave, 5)).toBe("👋🏿");
  expect(withTone(wave, 9)).toBe("👋");
  const heart = EMOJI.find((e) => e.char === "❤️")!;
  expect(withTone(heart, 3)).toBe("❤️"); // no tone variants: unchanged
  expect(labelOf("👋🏽", "en")).toBe("waving hand");
  expect(labelOf("👋", "uk")).toMatch(/[Ѐ-ӿ]/);
  expect(labelOf("not an emoji", "en")).toBe("not an emoji");
});

test("search finds by name and by word, in English and in Ukrainian, whatever the UI language", () => {
  const top = (q: string, lang: "en" | "uk", n = 24) => searchEmoji(q, lang).slice(0, n).map((e) => e.char);
  expect(top("red heart", "en")).toContain("❤️");
  expect(top("heart", "en")[0]).toBe("❤️"); // the classic comes first among equal matches
  expect(top("heart", "uk")[0]).toBe("❤️");
  expect(top("серце", "uk")).toContain("❤️");
  expect(top("Серце", "uk")).toContain("❤️"); // case does not matter
  expect(top("heart", "uk")).toContain("❤️"); // English words work in the Ukrainian UI
  expect(top("серце", "en")).toContain("❤️"); // and the other way round
  expect(top("усміх", "uk").length).toBeGreaterThan(0); // a prefix is enough
  expect(top(":smile:", "en").length).toBeGreaterThan(0); // a typed code works
  expect(searchEmoji("   ", "en")).toEqual([]);
  expect(searchEmoji("zzzzqqqq", "en")).toEqual([]);
  // every word has to match
  const both = searchEmoji("red heart", "en");
  expect(both.length).toBeLessThan(searchEmoji("heart", "en").length);
  // a name match ranks before a word match
  expect(searchEmoji("cat", "en")[0].en).toMatch(/cat/);
  expect(searchEmoji("a", "en").length).toBeLessThanOrEqual(240);
});

test("insert: at the caret, over a selection, at both ends", () => {
  expect(insertAt("hello world", 5, 5, "😀")).toEqual({ value: "hello😀 world", caret: 7 });
  expect(insertAt("hello world", 6, 11, "😀")).toEqual({ value: "hello 😀", caret: 8 }); // replaces the selected word
  expect(insertAt("hello", 0, 0, "👋")).toEqual({ value: "👋hello", caret: 2 });
  expect(insertAt("hello", 5, 5, "👋")).toEqual({ value: "hello👋", caret: 7 });
  expect(insertAt("", 0, 0, "❤️")).toEqual({ value: "❤️", caret: 2 });
  expect(insertAt("a\nb", 1, 2, "🌿")).toEqual({ value: "a🌿b", caret: 3 }); // a selected line break is replaced too
});

test("insert: odd positions are fixed, a surrogate pair is never torn", () => {
  expect(insertAt("abc", 3, 1, "x")).toEqual({ value: "ax", caret: 2 }); // reversed selection: "bc" is replaced
  expect(insertAt("abc", -5, 99, "x")).toEqual({ value: "x", caret: 1 }); // out of range
  expect(insertAt("abc", NaN, NaN, "x")).toEqual({ value: "abcx", caret: 4 }); // no selection reported: the end
  const text = "a😀b"; // the pair sits at 1..3
  const mid = insertAt(text, 2, 2, "👋"); // a caret in the middle of the pair moves to its front
  expect(lone(mid.value)).toBe(false);
  expect(mid.value).toBe("a👋😀b");
  const over = insertAt(text, 0, 2, "x"); // a selection that ends in the middle of the pair takes the whole pair
  expect(lone(over.value)).toBe(false);
  expect(over.value).toBe("xb");
});

test("recent: newest first, no duplicates, capped; damaged storage is survived", () => {
  expect(pushRecent([], "😀")).toEqual(["😀"]);
  expect(pushRecent(["😀", "👋"], "👋")).toEqual(["👋", "😀"]);
  const many = Array.from({ length: RECENT_MAX }, (_, i) => String.fromCodePoint(0x1f600 + i));
  const next = pushRecent(many, "🫶");
  expect(next).toHaveLength(RECENT_MAX);
  expect(next[0]).toBe("🫶");
  expect(next).not.toContain(many[RECENT_MAX - 1]);

  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  expect(loadRecent(store)).toEqual([]);
  saveRecent(["👋", "😀"], store);
  expect(loadRecent(store)).toEqual(["👋", "😀"]);
  mem.set("social:emoji:recent", "{not json");
  expect(loadRecent(store)).toEqual([]);
  mem.set("social:emoji:recent", JSON.stringify([1, null, "x".repeat(99), "🙂"]));
  expect(loadRecent(store)).toEqual(["🙂"]);
  // storage that refuses to write or to read
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  expect(() => saveRecent(["x"], broken)).not.toThrow();
  expect(loadRecent(broken)).toEqual([]);
  expect(loadRecent(null)).toEqual([]);
});

test("the skin tone is kept as 0 to 5 and anything else reads as the default", () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  expect(loadTone(store)).toBe(0);
  saveTone(4, store);
  expect(loadTone(store)).toBe(4);
  mem.set("social:emoji:tone", "9");
  expect(loadTone(store)).toBe(0);
  mem.set("social:emoji:tone", "2.5");
  expect(loadTone(store)).toBe(0);
});

test("every picker string exists in both languages", () => {
  const keys = Object.keys(dictionary.en).filter((k) => k.startsWith("emoji."));
  expect(keys.length).toBeGreaterThanOrEqual(14);
  for (const k of keys) expect(dictionary.uk[k], k).toBeTruthy();
});
