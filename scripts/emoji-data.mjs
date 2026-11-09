// Builds src/emoji/data.json (the emoji list the picker draws) from the Emojibase data sets (MIT, https://emojibase.dev).
//
//   npm pack emojibase-data@18 && mkdir -p /tmp/emojibase && tar xzf emojibase-data-*.tgz -C /tmp/emojibase
//   node scripts/emoji-data.mjs /tmp/emojibase/package
//
// The package is not an app dependency: all its languages weigh 52 MB, and the picker needs two (English and
// Ukrainian, the app's UI languages). The result is committed, so a normal install never needs the package.
//
// Output shape (keys are short on purpose, the file is bundled into the app):
//   groups: [{ id, en, uk }]                   the nine groups of the picker, in order
//   emoji:  [[group, emoji, labelEn, labelUk, tagsEn, tagsUk, skins?]]
//     tags are space-separated lower-case words; skins (only when present) are the five single-tone variants,
//     light to dark. Emoji with two people and two tones are left in their neutral form.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/emoji-data.mjs <path to the emojibase-data package>");
  process.exit(1);
}
const read = (lang, file) => JSON.parse(fs.readFileSync(path.join(dir, lang, file), "utf8"));
const en = read("en", "data.json");
const uk = read("uk", "data.json");
const ukBy = new Map(uk.map((e) => [e.hexcode, e]));
const messagesEn = read("en", "messages.json").groups;
const messagesUk = read("uk", "messages.json").groups;

// Emojibase numbers its groups; "component" (hair and skin swatches) is not drawn, and entries without a
// group are the regional indicator letters, which only make sense inside a flag.
const KEEP = new Map();
for (const g of messagesEn) if (g.key !== "component") KEEP.set(g.order, g.key);
// The Ukrainian data has a Latin "c" at the start of "символи"; map Latin look-alikes that touch Cyrillic letters.
const fixCyr = (s) => s.replace(/[cC](?=[\u0400-\u04ff])/g, (m) => (m === "c" ? "\u0441" : "\u0421"));
const upper = (s) => fixCyr(s).charAt(0).toUpperCase() + fixCyr(s).slice(1);
const groups = [...KEEP.entries()].map(([order, key]) => ({
  id: key,
  en: upper(messagesEn.find((g) => g.order === order).message),
  uk: upper(messagesUk.find((g) => g.order === order).message),
}));
const slot = new Map([...KEEP.keys()].map((order, i) => [order, i]));

// The emoji font (src/emoji/font.css) covers Emoji 15.1. A newer emoji would draw as an empty box, so it is left out.
// Raise this together with the font.
const MAX_VERSION = 15.1;

const words = (arr) => [...new Set((arr || []).map((w) => String(w).toLowerCase().trim()).filter(Boolean))].join(" ");
const out = [];
for (const e of en) {
  if (e.group === undefined || !slot.has(e.group) || e.version > MAX_VERSION) continue;
  const u = ukBy.get(e.hexcode);
  const skins = (e.skins || []).filter((s) => typeof s.tone === "number").sort((a, b) => a.tone - b.tone);
  const row = [slot.get(e.group), e.emoji, e.label, u ? u.label : e.label, words(e.tags), words(u ? u.tags : [])];
  if (skins.length === 5 && skins.every((s) => s.version <= MAX_VERSION)) row.push(skins.map((s) => s.emoji));
  out.push(row);
}

const target = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src", "emoji", "data.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ groups, emoji: out }) + "\n");
console.log(`${out.length} emoji in ${groups.length} groups -> ${path.relative(process.cwd(), target)}`);
