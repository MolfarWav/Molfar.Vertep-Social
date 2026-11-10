// Stories and characters talking to each other (issue #358): the calls to the `stories` and `chatter` plugins. In the design preview
// (`?screen=`) the same calls answer from a small fake, so the screen can be drawn and checked.
import { PREVIEW, call } from "@/lib/api";
import type { MsgImage } from "@/pictures/MsgPicture";

export interface Story {
  id: string;
  /** The character's profile id. */
  by: string;
  name: string;
  hue: number;
  picture: string;
  at: number;
  /** When it disappears. */
  until: number;
  text: string;
  image?: MsgImage;
  seen: boolean;
}

export interface PairPerson {
  id: string;
  name: string;
  hue: number;
  picture: string;
}
export interface Pair {
  key: string;
  a: PairPerson;
  b: PairPerson;
  on: boolean;
  count: number;
  last: { by: string; at: number; text: string } | null;
}
export interface PairMessage {
  id: string;
  by: string;
  at: number;
  text: string;
}

const NOW = Date.now();
const H = 3600e3;
let fakeStories: Story[] | null = null;
const stories = (): Story[] =>
  (fakeStories ??= [
    { id: "s1", by: "mavka", name: "Мавка", hue: 150, picture: "", at: NOW - 2 * H, until: NOW + 22 * H, text: "Озеро сьогодні таке спокійне, що небо в ньому видно краще, ніж над головою.", seen: false },
    { id: "s2", by: "mavka", name: "Мавка", hue: 150, picture: "", at: NOW - 5 * H, until: NOW + 19 * H, text: "Латала сітку біля очерету.", seen: false },
    { id: "s3", by: "pereles", name: "Перелесник", hue: 30, picture: "", at: NOW - 9 * H, until: NOW + 15 * H, text: "Вітер змінився. Буде гроза.", seen: true },
    { id: "s4", by: "horpyna", name: "Горпина", hue: 280, picture: "", at: NOW - 12 * H, until: NOW + 12 * H, text: "Зварила таке, що аж сусіди прийшли питати рецепт.", seen: false },
  ]);
let fakePairs: Pair[] | null = null;
const P = (id: string, name: string, hue: number): PairPerson => ({ id, name, hue, picture: "" });
const pairs = (): Pair[] =>
  (fakePairs ??= [
    { key: "horpyna__mavka", a: P("horpyna", "Горпина", 280), b: P("mavka", "Мавка", 150), on: true, count: 6, last: { by: "mavka", at: NOW - 3 * H, text: "Горпино, приходь до озера, покажу, де водяник сховав весло." } },
    { key: "mavka__pereles", a: P("mavka", "Мавка", 150), b: P("pereles", "Перелесник", 30), on: false, count: 0, last: null },
  ]);
const fakeChat: PairMessage[] = [
  { id: "c1", by: "horpyna", at: NOW - 5 * H, text: "Мавко, ти бачила, що водяник знову кудись подів весло?" },
  { id: "c2", by: "mavka", at: NOW - 4 * H, text: "Бачила. Він клянеться, що його вкрали, а сам сидить на ньому." },
  { id: "c3", by: "horpyna", at: NOW - 3.5 * H, text: "Ха! Тоді ввечері заходь, налию тобі чаю з материнки." },
];

export async function loadStories(): Promise<{ on: boolean; stories: Story[] }> {
  if (PREVIEW) return { on: true, stories: stories() };
  try {
    return await call<{ on: boolean; stories: Story[] }>("GET", "/stories");
  } catch {
    return { on: false, stories: [] };
  }
}

export async function markSeen(id: string): Promise<void> {
  if (PREVIEW) {
    fakeStories = stories().map((s) => (s.id === id ? { ...s, seen: true } : s));
    return;
  }
  await call("POST", "/stories/seen", { id }).catch(() => undefined);
}

/** Removes a story; resolves to an error text or "". */
export async function removeStory(id: string): Promise<string> {
  if (PREVIEW) {
    fakeStories = stories().filter((s) => s.id !== id);
    return "";
  }
  try {
    await call("POST", "/stories/remove", { id });
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function loadPairs(): Promise<{ on: boolean; max: number; pairs: Pair[] }> {
  if (PREVIEW) return { on: true, max: 8, pairs: pairs() };
  try {
    return await call<{ on: boolean; max: number; pairs: Pair[] }>("GET", "/chatter");
  } catch {
    return { on: false, max: 8, pairs: [] };
  }
}

export async function loadPairChat(key: string): Promise<PairMessage[]> {
  if (PREVIEW) return fakeChat;
  try {
    return (await call<{ messages: PairMessage[] }>("GET", `/chatter/chat?key=${encodeURIComponent(key)}`)).messages;
  } catch {
    return [];
  }
}

/** Makes a pair or switches it; resolves to an error text or "". */
export async function setPair(a: string, b: string, on: boolean): Promise<string> {
  if (PREVIEW) {
    const list = pairs();
    const key = a < b ? `${a}__${b}` : `${b}__${a}`;
    const hit = list.find((p) => p.key === key);
    if (hit) fakePairs = list.map((p) => (p.key === key ? { ...p, on } : p));
    return "";
  }
  try {
    await call("POST", "/chatter/pair", { a, b, on });
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function removePair(key: string): Promise<string> {
  if (PREVIEW) {
    fakePairs = pairs().filter((p) => p.key !== key);
    return "";
  }
  try {
    await call("POST", "/chatter/remove", { key });
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
