// Clubs in the messenger (issue #368): the types of the clubs plugin's answers and the pure parts of the screen (the member picker's
// rules, the line under a club's name). No React and no network here, so test/clubs-ui.test.ts can drive them directly.
import type { Status } from "@/mock/status";

export const MIN_MEMBERS = 3;
export const MAX_MEMBERS = 4;
export const NAME_MAX = 40;
export const INTEREST_MAX = 60;

export interface ClubPerson {
  id: string;
  name: string;
  hue: number;
  picture: string;
}

/** A club as GET /clubs lists it (plugins/clubs/plugin.js). */
export interface Club {
  id: string;
  name: string;
  interest: string;
  by: "user" | "mod";
  on: boolean;
  count: number;
  last: { by: string; name: string; at: number; text: string } | null;
  members: ClubPerson[];
}

export interface ClubList {
  /** The global switch (Settings > Community > Clubs). */
  on: boolean;
  /** The most clubs there can be. */
  max: number;
  clubs: Club[];
}

export interface ClubMessage {
  id: string;
  by: string;
  name: string;
  hue: number;
  picture: string;
  at: number;
  text: string;
  mine: boolean;
  /** The persona the user wrote as, only when there is more than one. */
  as?: string;
}

/** GET /clubs/chat, and the answer of a send. */
export interface ClubChat {
  club: Club;
  messages: ClubMessage[];
  multi: boolean;
  /** A reply is being written. */
  pending: boolean;
  /** The last request failed lately; the club waits half an hour. */
  failed: boolean;
}

/** A character a club can be made of (a messenger contact). */
export interface Pickable {
  id: string;
  name: string;
  hue: number;
  picture?: string;
  status?: Status;
}

/** Ticks or unticks a member: at most four, and a tick past the limit does nothing. */
export function toggleMember(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= MAX_MEMBERS ? selected : [...selected, id];
}

/** The characters whose name has the text in it, in any case; an empty search keeps all. */
export function filterPeople<T extends { name: string }>(people: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
}

/** What the picker says about the count: too few, enough, or the limit reached. */
export function pickState(n: number): "few" | "ok" | "full" {
  return n < MIN_MEMBERS ? "few" : n >= MAX_MEMBERS ? "full" : "ok";
}

/** Whether the dialog may save: a name, and three or four members. */
export function canSave(name: string, members: string[]): boolean {
  return name.trim().length > 0 && members.length >= MIN_MEMBERS && members.length <= MAX_MEMBERS;
}

/** The line under a club's name in the list: "Name: text", or "" when nothing was said. */
export function clubLine(c: Pick<Club, "last">, me: string): string {
  const l = c.last;
  if (!l) return "";
  return `${l.by === "me" ? me : l.name}: ${l.text}`;
}

/** The members' names for a header: "Anna, Boris, Clara". */
export const memberNames = (c: Pick<Club, "members">): string => c.members.map((m) => m.name).join(", ");

/** Whether a new club may be made: the limit, and enough characters to pick from. */
export function newClubBlock(clubCount: number, max: number, people: number): "limit" | "few" | "" {
  if (clubCount >= max) return "limit";
  return people < MIN_MEMBERS ? "few" : "";
}
