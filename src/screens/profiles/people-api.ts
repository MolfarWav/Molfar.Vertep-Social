// The "People she has met" list of the Life tab: who a character has run into on the forum and in the messenger, counted by the Life
// plugin (issue #357). The user may reword an impression or forget a person. In the design preview (`?screen=`) the same calls work on
// an in-memory fake.
import { PREVIEW, call } from "@/lib/api";

/** The ladder of familiarity, from the least to the most; romance is a separate axis (ties), not a rung. */
export const LEVELS = ["stranger", "slight", "acquaintance", "penfriend", "friend", "close", "confidant"] as const;
export type Level = (typeof LEVELS)[number];

/** What the other person is to the character. Family and work ties show on both sides; romantic ones belong to one side and need adults. */
export const TIE_GROUPS = {
  family: ["spouse", "parent", "child", "sibling", "relative"],
  work: ["colleague", "boss", "subordinate"],
  other: ["rival", "other"],
  romance: ["crush", "dating", "partner", "ex"],
} as const;
export type TieType = (typeof TIE_GROUPS)[keyof typeof TIE_GROUPS][number];
export interface Tie {
  type: TieType;
  /** Only for "other": the user's own words. */
  label?: string;
}

/** A milestone in the list: a level reached, a feeling that crossed a band, a tie set, a follow started by the rule (#368). */
export interface Mark {
  at: number;
  k: "level" | "feel" | "tie" | "follow";
  v: string;
  up?: boolean;
}

export interface Person {
  /** "c:<profile id>" (a character) or "u:<persona id>" (the user as a persona). */
  key: string;
  name: string;
  kind: "character" | "user";
  first: number;
  last: number;
  /** How many of their posts and messages the character has seen. */
  seen: number;
  /** How often they spoke to the character directly (quoted it, wrote in the chat). */
  toMe: number;
  /** How often the character answered them. */
  fromMe: number;
  said: { at: number; where: "forum" | "messenger"; text: string }[];
  /** The character's own impression, worded by the model once a day (or by the user); "" until there is one. */
  note: string;
  /** How she feels about them, -12 (at odds) to 12 (close), read from the tone of what was said either way; 0 when unknown. */
  feel?: number;
  /** The level the user set ("" = automatic) and whether it is held exactly (else it is a floor). */
  tier?: Level | "";
  pinned?: boolean;
  /** (#368) The user's say on "follows them": "" = the rule decides, "yes" or "no". */
  follow?: Follow;
  /** (#368) Does the character follow them now (the result of the setting and the rule). */
  fol?: boolean;
  /** What counts now, and what it came from: `auto` is what the meetings reached, `talks` and `seen` are the numbers behind it. */
  level?: { id: Level; auto: Level; manual: Level | ""; pinned: boolean; seen: number; talks: number };
  ties?: Tie[];
  marks?: Mark[];
  /** May a romantic tie be offered for this person (both are adults, or this is the user's persona and the character is an adult). */
  romance?: boolean;
}

export type Follow = "" | "yes" | "no";

/** The rule behind an automatic follow, as the Life plugin has it: from this level up, unless the feeling is cold (-3 or less). */
export const FOLLOW_FROM: Level = "penfriend";
export const followByRule = (level: Level, feel = 0): boolean => LEVELS.indexOf(level) >= LEVELS.indexOf(FOLLOW_FROM) && feel > -3;

/** A person who is not in the list yet but may be added by hand. */
export interface Candidate {
  key: string;
  name: string;
  kind: "character" | "user";
  romance: boolean;
}

/** Another character whose list holds this one. */
export interface KnownBy {
  id: string;
  name: string;
  seen: number;
  note: string;
}

export interface People {
  people: Person[];
  /** Only the GET answer has it. */
  knownBy?: KnownBy[];
  candidates?: Candidate[];
  /** The character itself is marked adult (the only way it may have a romantic tie). */
  adult?: boolean;
}

/** What the editor sends for one person; `mirror` copies the level to the other character's list when it has none. */
export interface RelationEdit {
  level: Level | "";
  pinned: boolean;
  ties: Tie[];
  mirror?: boolean;
  /** (#368) Only this character's own follow: never copied to the other side. */
  follow?: Follow;
}

const now = Date.now();
const lvl = (id: Level, auto: Level, manual: Level | "" = "", pinned = false, seen = 0, talks = 0): NonNullable<Person["level"]> => ({ id, auto, manual, pinned, seen, talks });
let fake: Person[] | null = null;
const fakePeople = (): Person[] =>
  (fake ??= [
    {
      key: "u:you", name: "Сергій", kind: "user", first: now - 6 * 864e5, last: now - 3600e3, seen: 14, toMe: 6, fromMe: 5,
      said: [{ at: now - 3600e3, where: "forum", text: "А ти бачила туман над озером сьогодні вранці?" }],
      note: "Тихий, уважний, пише рідко, але до діла.", feel: 8, tier: "", pinned: false, follow: "", fol: true, level: lvl("friend", "friend", "", false, 14, 11), ties: [{ type: "dating" }],
      marks: [{ at: now - 2 * 864e5, k: "level", v: "friend", up: true }, { at: now - 864e5, k: "feel", v: "close" }, { at: now - 3 * 864e5, k: "tie", v: "dating" }], romance: true,
    },
    {
      key: "c:rp-kolya", name: "Коля", kind: "character", first: now - 3 * 864e5, last: now - 2 * 864e5, seen: 4, toMe: 1, fromMe: 0, said: [], note: "", feel: -8,
      tier: "", pinned: false, follow: "yes", fol: true, level: lvl("acquaintance", "acquaintance", "", false, 4, 1), ties: [{ type: "rival" }], marks: [{ at: now - 2 * 864e5, k: "feel", v: "hostile" }], romance: false,
    },
  ]);
const fakeCandidates = (): Candidate[] =>
  ([
    { key: "c:rp-yaryna", name: "Ярина", kind: "character", romance: true },
    { key: "u:you2", name: "Оксана", kind: "user", romance: true },
  ] as Candidate[]).filter((c) => !fakePeople().some((p) => p.key === c.key));
const fakeKnownBy: KnownBy[] = [{ id: "rp-yaryna", name: "Ярина", seen: 9, note: "Тиха, але завжди відповідає по суті." }];

const base = (id: string) => `/life/people/${encodeURIComponent(id)}`;

export async function loadPeople(id: string): Promise<People> {
  if (PREVIEW) return { people: [...fakePeople()], knownBy: fakeKnownBy, candidates: fakeCandidates(), adult: true };
  return call<People>("GET", base(id));
}

/** Forgets one person (`key`) or, with no key, everyone. */
export async function forgetPeople(id: string, key?: string): Promise<People> {
  if (PREVIEW) {
    const keep = (p: Person) => p.tier || (p.ties?.length ?? 0) > 0 || p.follow;
    fake = key ? fakePeople().flatMap((p) => (p.key !== key ? [p] : keep(p) ? [{ ...p, seen: 0, toMe: 0, fromMe: 0, said: [], note: "", feel: 0, marks: [] }] : [])) : fakePeople().filter(keep);
    return { people: [...fake], candidates: fakeCandidates() };
  }
  return call<People>("DELETE", key ? `${base(id)}/${encodeURIComponent(key)}` : base(id));
}

/** The user's own wording of the impression of one person. */
export async function saveNote(id: string, key: string, note: string): Promise<People> {
  if (PREVIEW) {
    fake = fakePeople().map((p) => (p.key === key ? { ...p, note } : p));
    return { people: [...fake] };
  }
  return call<People>("PUT", `${base(id)}/${encodeURIComponent(key)}`, { note });
}

/** The user's level and ties for one person, someone not yet in the list included; the answer is the new list. */
export async function saveRelation(id: string, key: string, edit: RelationEdit, name = ""): Promise<People> {
  if (PREVIEW) {
    const level = edit.level;
    const auto = fakePeople().find((p) => p.key === key)?.level?.auto ?? "stranger";
    const eff = (level && (edit.pinned || LEVELS.indexOf(level) >= LEVELS.indexOf(auto)) ? level : auto) as Level;
    const rest = fakePeople().find((p) => p.key === key);
    const known = rest ?? { key, name, kind: key.startsWith("c:") ? ("character" as const) : ("user" as const), first: 0, last: 0, seen: 0, toMe: 0, fromMe: 0, said: [], note: "", marks: [] as Mark[] };
    const follow = edit.follow ?? known.follow ?? "";
    const fol = follow === "yes" || (follow !== "no" && followByRule(eff, known.feel ?? 0));
    const next: Person = { ...known, tier: level, pinned: edit.pinned, ties: edit.ties, follow, fol, level: lvl(eff, auto, level, edit.pinned, known.seen, known.toMe + known.fromMe), romance: true };
    fake = [...fakePeople().filter((p) => p.key !== key), ...(level || edit.ties.length || follow || known.seen ? [next] : [])];
    return { people: [...fake], candidates: fakeCandidates() };
  }
  return call<People>("PUT", `${base(id)}/${encodeURIComponent(key)}`, { level: edit.level, pinned: edit.pinned, ties: edit.ties, ...(edit.mirror ? { mirror: true } : {}), ...(edit.follow !== undefined ? { follow: edit.follow } : {}) });
}
