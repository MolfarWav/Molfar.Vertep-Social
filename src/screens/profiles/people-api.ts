// The "People she has met" list of the Life tab: who a character has run into on the forum and in the messenger, counted by the Life
// plugin (issue: Known people). Read-only except forgetting. In the design preview (`?screen=`) the same calls work on an in-memory fake.
import { PREVIEW, call } from "@/lib/api";

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
  /** The character's own impression, worded by the model once a day; "" until there is one. */
  note: string;
}

export interface People {
  people: Person[];
}

const now = Date.now();
let fake: Person[] | null = null;
const fakePeople = (): Person[] =>
  (fake ??= [
    { key: "u:you", name: "Сергій", kind: "user", first: now - 6 * 864e5, last: now - 3600e3, seen: 14, toMe: 6, fromMe: 5, said: [{ at: now - 3600e3, where: "forum", text: "А ти бачила туман над озером сьогодні вранці?" }], note: "Тихий, уважний, пише рідко, але до діла." },
    { key: "c:rp-kolya", name: "Коля", kind: "character", first: now - 3 * 864e5, last: now - 2 * 864e5, seen: 4, toMe: 1, fromMe: 0, said: [], note: "" },
  ]);

const base = (id: string) => `/life/people/${encodeURIComponent(id)}`;

export async function loadPeople(id: string): Promise<People> {
  if (PREVIEW) return { people: [...fakePeople()] };
  return call<People>("GET", base(id));
}

/** Forgets one person (`key`) or, with no key, everyone. */
export async function forgetPeople(id: string, key?: string): Promise<People> {
  if (PREVIEW) {
    fake = key ? fakePeople().filter((p) => p.key !== key) : [];
    return { people: [...fake] };
  }
  return call<People>("DELETE", key ? `${base(id)}/${encodeURIComponent(key)}` : base(id));
}
