// The emoji the picker offers: a generated list (data.json, see scripts/emoji-data.mjs) in two languages.
import type { Lang } from "@/i18n/index";
import raw from "./data.json";

export interface Emoji {
  /** The character as inserted (with its variation selector, if it has one). */
  char: string;
  /** Index into GROUPS. */
  group: number;
  /** Names in the two UI languages. */
  en: string;
  uk: string;
  /** Lower-case search words, space-separated. */
  tagsEn: string;
  tagsUk: string;
  /** The five skin-tone variants, light to dark, for an emoji that has them. */
  skins?: string[];
}

export interface EmojiGroup {
  id: string;
  en: string;
  uk: string;
}

type Row = [number, string, string, string, string, string, string[]?];

export const GROUPS: EmojiGroup[] = raw.groups;

export const EMOJI: Emoji[] = (raw.emoji as unknown as Row[]).map(([group, char, en, uk, tagsEn, tagsUk, skins]) => ({ group, char, en, uk, tagsEn, tagsUk, skins }));

/** One emoji per group for the tab strip, in the order of GROUPS. */
export const GROUP_ICONS = ["😀", "👋", "🐻", "🍔", "🚗", "⚽", "💡", "🔣", "🏳️"];

/** The emoji people reach for most, most used first. Among equally good search matches these come first ("heart" finds the red heart first). */
export const CLASSICS = ["❤️", "😀", "😂", "🤣", "👍", "😭", "🙏", "😘", "🥰", "😍", "😊", "🎉", "😁", "🥺", "😅", "🔥", "☺️", "🤔", "😎", "🙂", "😢", "🙄", "😉", "✨", "👏", "🤗", "💔", "😴", "🐱", "🐶"];

export const nameOf = (e: Emoji, lang: Lang): string => (lang === "uk" ? e.uk : e.en);
export const groupName = (g: EmojiGroup, lang: Lang): string => (lang === "uk" ? g.uk : g.en);

/** The character to insert for a skin tone: 0 is the default (yellow), 1 to 5 light to dark. */
export const withTone = (e: Emoji, tone: number): string => (tone >= 1 && tone <= 5 && e.skins ? e.skins[tone - 1] ?? e.char : e.char);

let names: Map<string, Emoji> | null = null;
/** The name of an emoji given as the inserted character, skin-tone variants included; the character itself when unknown. */
export function labelOf(char: string, lang: Lang): string {
  if (!names) {
    names = new Map();
    for (const e of EMOJI) {
      names.set(e.char, e);
      for (const s of e.skins ?? []) names.set(s, e);
    }
  }
  const e = names.get(char);
  return e ? nameOf(e, lang) : char;
}
