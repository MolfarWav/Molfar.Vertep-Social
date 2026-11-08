// Mock profiles for the Profiles screen. In the real app a name comes from the
// character's Soul, not from the card; `hue` is the avatar colour. Only Мавка has
// the full data the boards show; the others get a short About and a default week.
import type { Status } from "@/mock/status";
import type { ImportRef } from "@/mock/profiles-import";

export type ProfileSource = "roleplay" | "own" | "persona";

export interface Habit {
  id: string;
  text: string;
  /** "self": the profile wrote it; "you": the user added it. */
  by: "self" | "you";
  date?: string;
}

export interface VoiceForm {
  text: string;
  /** 0 short, 1 medium, 2 long */
  length: number;
  /** 0 never, 1 sometimes, 2 often */
  emoji: number;
  /** 0 informal ("на «ти»") .. 100 formal ("церемонно") */
  formality: number;
  never: string[];
}

export interface ForumForm {
  rank: string;
  signature: string;
  /** 0..100 rarely .. often */
  frequency: number;
  opensOwn: boolean;
  repliesYou: boolean;
  repliesOthers: boolean;
  favourites: { name: string; on: boolean }[];
}

/** Everything the editor changes. Saved on the phone with the save bar. */
export interface ProfileForm {
  nick: string;
  about: string;
  interests: string[];
  habits: Habit[];
  voice: VoiceForm;
  forum: ForumForm;
  /** The profile may add habits itself (the switch in the Habits tab). */
  habitsAuto: boolean;
  /** schedule[band][day]: 8 time bands (00-03 .. 21-24) by 7 days (Mon..Sun). */
  schedule: Status[][];
}

export interface MockProfile extends ProfileForm {
  id: string;
  name: string;
  hue: number;
  source: ProfileSource;
  /** Roleplay profiles only: the card title and the day the vignette was taken. */
  card?: string;
  /** The day the profile was made or last updated from the card: "2026-11-09" (real) or a ready text (mock). */
  cardDate?: string;
  /** Imported profiles: the card or persona it was made from (the "Update from Roleplay" button reads it again). */
  from?: ImportRef;
}

const BANDS = 8;
const DAYS = 7;

/** Build a schedule from one day pattern for Mon-Fri and separate Sat and Sun patterns. */
function week(weekday: Status[], sat: Status[], sun: Status[]): Status[][] {
  return Array.from({ length: BANDS }, (_, r) =>
    Array.from({ length: DAYS }, (_, d) => (d < 5 ? weekday[r] : d === 5 ? sat[r] : sun[r])),
  );
}

const MAVKA_WEEKDAY: Status[] = ["off", "off", "off", "na", "na", "away", "online", "online"];
const MAVKA_SAT: Status[] = ["off", "off", "off", "away", "online", "online", "online", "dnd"];
const MAVKA_SUN: Status[] = ["off", "off", "off", "away", "away", "online", "online", "online"];
const DEFAULT_DAY: Status[] = ["off", "off", "off", "na", "online", "online", "online", "online"];

const DEFAULT_VOICE: VoiceForm = { text: "", length: 1, emoji: 0, formality: 30, never: [] };
const DEFAULT_FORUM: ForumForm = {
  rank: "",
  signature: "",
  frequency: 35,
  opensOwn: true,
  repliesYou: true,
  repliesOthers: true,
  favourites: [],
};

export function plain(id: string, name: string, hue: number, source: ProfileSource, about: string): MockProfile {
  return {
    id,
    name,
    hue,
    source,
    card: source === "roleplay" ? `${name} v2` : undefined,
    cardDate: source === "roleplay" ? "3 листопада" : undefined,
    nick: name,
    about,
    interests: [],
    habits: [],
    habitsAuto: true,
    voice: { ...DEFAULT_VOICE, never: [] },
    forum: { ...DEFAULT_FORUM, favourites: [] },
    schedule: week(DEFAULT_DAY, DEFAULT_DAY, DEFAULT_DAY),
  };
}

export const PROFILES: MockProfile[] = [
  {
    id: "mavka",
    name: "Мавка",
    hue: 150,
    source: "roleplay",
    card: "Мавка з озера v3",
    cardDate: "8 листопада",
    nick: "Мавка",
    about: "Мешканка озера. Говорить повільно, любить тишу й дрібні новини з берега.",
    interests: ["очерет", "вода", "чутки"],
    habits: [
      { id: "h1", text: "Пише вечорами, коротко", by: "self", date: "2 листопада" },
      { id: "h2", text: "Часто згадує Лісовика", by: "self", date: "5 листопада" },
      { id: "h3", text: "Не любить, коли її перебивають", by: "you" },
    ],
    habitsAuto: true,
    voice: {
      text: "Повільна, тиха, ставить крапки замість окликів. Рідко питає про себе.",
      length: 1,
      emoji: 0,
      formality: 30,
      never: ["капслок", "«ну типу»"],
    },
    forum: {
      rank: "Мешканка озера",
      signature: "очерет, вода, чутки",
      frequency: 35,
      opensOwn: true,
      repliesYou: true,
      repliesOthers: true,
      favourites: [
        { name: "Гостьова хата", on: true },
        { name: "Береги й води", on: true },
        { name: "Базар", on: false },
      ],
    },
    schedule: week(MAVKA_WEEKDAY, MAVKA_SAT, MAVKA_SUN),
  },
  plain("yaryna", "Ярина", 330, "roleplay", "Господиня хутора, тримає все в голові."),
  plain("lisovyk", "Лісовик", 100, "roleplay", "Говорить мало, але чує все в лісі."),
  plain("pereles", "Перелесник", 20, "roleplay", "Любить обманювати і любить, коли його ловлять."),
  plain("berehynia", "Берегиня", 190, "roleplay", "Береже човни й рибалок на переправі."),
  plain("domovyk", "Домовик", 40, "roleplay", "Сердиться, коли в хаті безладно."),
  plain("chuhaister", "Чугайстер", 260, "roleplay", "Ходить горами, ночами, з великим кроком."),
  plain("horpyna", "Горпина", 290, "roleplay", "Торгує на базарі й знає ціни всім."),
  plain("vodianyk", "Водяник", 210, "own", "Мій власний персонаж для тестів."),
  plain("motrya", "Мотря", 60, "own", "Сусідка з другої вулиці."),
  plain("panas", "Панас", 230, "own", "Старий дід, що пам’ятає всі повені."),
  plain("mandrivnyk", "Мандрівник", 210, "persona", "Твоя персона: мандрівник без дому."),
];

/** The profile's source label key suffix, used by the list and the editor. */
export const SOURCE_KEY: Record<ProfileSource, string> = {
  roleplay: "profiles.source.roleplay",
  own: "profiles.source.own",
  persona: "profiles.source.persona",
};
