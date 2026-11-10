// Subjects the outside feed keeps (issue #358): the pure part. The list itself lives in the Life plugin (`TOPICS`) and arrives with
// `GET /life/topics`; the user's choice is `life.topics` in the settings: `on` (ids from the list) and `custom` (their own subjects,
// each a name and a few words). Tested in test/topics.test.ts.

export interface TopicInfo {
  id: string;
  group: string;
  en: string;
  uk: string;
}
export interface TopicGroup {
  id: string;
  en: string;
  uk: string;
}
/** GET /life/topics. */
export interface TopicsCatalog {
  groups: TopicGroup[];
  topics: TopicInfo[];
  /** The most subjects on at once (the list's and the user's together). */
  max: number;
  customMax: number;
  /** How many of today's items each subject matched; empty until a fetch ran with it on. */
  byTopic: Record<string, number>;
}
export interface CustomTopic {
  id: string;
  label: string;
  words: string[];
}
export interface TopicSetting {
  on: string[];
  custom: CustomTopic[];
}

export const NO_TOPICS: TopicSetting = { on: [], custom: [] };

/** How many subjects are on. */
export const inUse = (t: TopicSetting): number => t.on.length + t.custom.length;

/** The words as typed ("fox, red fox; hare") to a list: split on commas, semicolons and new lines, trimmed, lower case, no repeats, at most six. */
export function parseWords(text: string): string[] {
  const out: string[] = [];
  for (const w of text.split(/[,;\n]/)) {
    const x = w.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30);
    if (x.length >= 2 && !out.includes(x)) out.push(x);
  }
  return out.slice(0, 6);
}

/** Switches a subject of the list on or off; one more than `max` is refused (the same value comes back). */
export function toggleTopic(t: TopicSetting, id: string, max: number): TopicSetting {
  if (t.on.includes(id)) return { ...t, on: t.on.filter((x) => x !== id) };
  return inUse(t) >= max ? t : { ...t, on: [...t.on, id] };
}

export type AddResult = { ok: TopicSetting } | { error: "label" | "words" | "full" };

/** Adds a subject of the user's own. The id is made here (`c` and letters) so the screen and the plugin agree on it. */
export function addCustom(t: TopicSetting, label: string, wordsText: string, max: number, customMax: number, makeId: () => string = () => "c" + Math.floor(Math.random() * 1e9).toString(36)): AddResult {
  const name = label.replace(/\s+/g, " ").trim().slice(0, 40);
  const words = parseWords(wordsText.trim() ? wordsText : name);
  if (!name) return { error: "label" };
  if (!words.length) return { error: "words" };
  if (inUse(t) >= max || t.custom.length >= customMax) return { error: "full" };
  let id = makeId();
  while (t.custom.some((c) => c.id === id)) id += "x";
  return { ok: { ...t, custom: [...t.custom, { id, label: name, words }] } };
}

export const removeCustom = (t: TopicSetting, id: string): TopicSetting => ({ ...t, custom: t.custom.filter((c) => c.id !== id) });

/** The label of a subject in a language ("uk" or anything else = English). */
export const topicLabel = (t: { en: string; uk: string }, lang: string): string => (lang === "uk" ? t.uk : t.en);
