// The Life tab talks to the `life` plugin: the diary of one profile. Diary changes are saved at once (they do not wait for the
// editor's Save bar). In the design preview (`?screen=`) the same calls work on an in-memory fake.
import { PREVIEW, call } from "@/lib/api";

export interface DiaryEntry {
  id: string;
  at: number;
  /** The local day it was written for, "2026-11-09". */
  day: string;
  text: string;
  /** "model" or "you": the user's own edits and additions are marked. */
  by: "model" | "you";
}

/** The diary as the screen shows it: newest entry first. */
export interface Diary {
  entries: DiaryEntry[];
  mood: string;
  plan: string;
  lastDay: string;
}

/** The switches that decide whether the diary is written and read: the app's (Settings > Life) and the profile's own. */
export interface DiaryFlags {
  on: boolean;
  world: boolean;
  profileOn: boolean;
  profileWorld: boolean;
}

export interface DiaryView {
  diary: Diary;
  flags: DiaryFlags;
}

const DAY = 24 * 3600 * 1000;
const fakes = new Map<string, Diary>();
const fakeOf = (id: string): Diary => {
  let d = fakes.get(id);
  if (!d) {
    const now = Date.now();
    const day = (n: number) => new Date(now - n * DAY).toISOString().slice(0, 10);
    d = {
      entries: [
        { id: "e3", at: now - 2 * 3600 * 1000, day: day(0), text: "Вранці довго стояла біля води, поки туман не зійшов. Потім перебрала сітки, одну лишила на ремонт.", by: "model" },
        { id: "e2", at: now - DAY, day: day(1), text: "Дощ цілий день. Сиділа під навісом і слухала, як він б'є по очерету, нічого не робила, і це було добре.", by: "model" },
        { id: "e1", at: now - 2 * DAY, day: day(2), text: "Знайшла на березі гладенький камінь із білою смужкою. Забрала собі.", by: "you" },
      ],
      mood: "спокійна",
      plan: "Полагодити сітку й вийти на ранкову воду.",
      lastDay: day(0),
    };
    fakes.set(id, d);
  }
  return d;
};
const fakeView = (id: string): DiaryView => ({ diary: { ...fakeOf(id), entries: [...fakeOf(id).entries] }, flags: { on: true, world: true, profileOn: true, profileWorld: true } });

const base = (id: string) => `/life/diary/${encodeURIComponent(id)}`;

export async function loadDiary(id: string): Promise<DiaryView> {
  if (PREVIEW) return fakeView(id);
  return call<DiaryView>("GET", base(id));
}

/** Edits an entry, or adds one when `entryId` is "new". */
export async function saveEntry(id: string, entryId: string, text: string): Promise<DiaryView> {
  if (PREVIEW) {
    const d = fakeOf(id);
    if (entryId === "new") d.entries.unshift({ id: `n${Date.now()}`, at: Date.now(), day: new Date().toISOString().slice(0, 10), text, by: "you" });
    else d.entries = d.entries.map((e) => (e.id === entryId ? { ...e, text, by: "you" as const } : e));
    return fakeView(id);
  }
  return call<DiaryView>("PUT", `${base(id)}/entry/${encodeURIComponent(entryId)}`, { text });
}

export async function deleteEntry(id: string, entryId: string): Promise<DiaryView> {
  if (PREVIEW) {
    const d = fakeOf(id);
    d.entries = d.entries.filter((e) => e.id !== entryId);
    return fakeView(id);
  }
  return call<DiaryView>("DELETE", `${base(id)}/entry/${encodeURIComponent(entryId)}`);
}

export async function saveState(id: string, patch: { mood?: string; plan?: string }): Promise<DiaryView> {
  if (PREVIEW) {
    Object.assign(fakeOf(id), patch);
    return fakeView(id);
  }
  return call<DiaryView>("PUT", `${base(id)}/state`, patch);
}

export async function forgetDiary(id: string): Promise<DiaryView> {
  if (PREVIEW) {
    fakes.set(id, { entries: [], mood: "", plan: "", lastDay: "" });
    return fakeView(id);
  }
  return call<DiaryView>("DELETE", base(id));
}

/** Writes a day now (the model is asked once). `error` and `code` ("no-model") come back when it did not work. */
export async function writeDay(id: string): Promise<DiaryView & { ok: boolean; error?: string; code?: string }> {
  if (PREVIEW) {
    const d = fakeOf(id);
    d.entries.unshift({ id: `m${Date.now()}`, at: Date.now(), day: new Date().toISOString().slice(0, 10), text: "Сьогодні розбирала старі нитки й знайшла моток, який думала, що загубила.", by: "model" });
    return { ok: true, ...fakeView(id) };
  }
  return call<DiaryView & { ok: boolean; error?: string; code?: string }>("POST", `${base(id)}/write`);
}
