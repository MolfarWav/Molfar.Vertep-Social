// Search over the emoji names and words, in both languages (the UI language ranks first).
import type { Lang } from "@/i18n/index";
import { CLASSICS, EMOJI, nameOf, type Emoji } from "./data";

const MAX_RESULTS = 240;

interface Hay {
  /** How many words the name has: "red heart" is a more basic answer to "heart" than "heart with arrow". */
  size: number;
  /** The name and words in the UI language, then in the other one. */
  main: string[];
  name: string[];
  other: string[];
}

const hays = new Map<Lang, Hay[]>();
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}+-]+/u).filter(Boolean);

function hayFor(lang: Lang): Hay[] {
  let list = hays.get(lang);
  if (!list) {
    list = EMOJI.map((e) => {
      const mine = lang === "uk" ? [e.uk, e.tagsUk] : [e.en, e.tagsEn];
      const theirs = lang === "uk" ? [e.en, e.tagsEn] : [e.uk, e.tagsUk];
      const name = words(nameOf(e, lang));
      return { size: name.length, name, main: words(mine.join(" ")), other: words(theirs.join(" ")) };
    });
    hays.set(lang, list);
  }
  return list;
}

/** Lower is better; -1 means the word is nowhere in this emoji. */
function wordScore(w: string, h: Hay): number {
  if (h.name.includes(w)) return 0;
  if (h.name.some((x) => x.startsWith(w))) return 1;
  if (h.main.some((x) => x.startsWith(w))) return 2;
  if (h.other.some((x) => x.startsWith(w))) return 3;
  if (w.length >= 3 && (h.main.some((x) => x.includes(w)) || h.other.some((x) => x.includes(w)))) return 4;
  return -1;
}

/** Every word of the query must match. Best matches first, then the classics, then shorter names, then the list's own order. Empty query: nothing. */
export function searchEmoji(query: string, lang: Lang): Emoji[] {
  const ws = words(query.replace(/:/g, " ")).slice(0, 6);
  if (ws.length === 0) return [];
  const hay = hayFor(lang);
  const hits: { e: Emoji; score: number; size: number; i: number }[] = [];
  for (let i = 0; i < EMOJI.length; i++) {
    let total = 0;
    let all = true;
    for (const w of ws) {
      const s = wordScore(w, hay[i]);
      if (s < 0) {
        all = false;
        break;
      }
      total += s;
    }
    if (all) hits.push({ e: EMOJI[i], score: total, size: hay[i].size, i });
  }
  const rank = (e: Emoji) => {
    const at = CLASSICS.indexOf(e.char);
    return at < 0 ? CLASSICS.length : at;
  };
  hits.sort((a, b) => a.score - b.score || rank(a.e) - rank(b.e) || a.size - b.size || a.i - b.i);
  return hits.slice(0, MAX_RESULTS).map((h) => h.e);
}
