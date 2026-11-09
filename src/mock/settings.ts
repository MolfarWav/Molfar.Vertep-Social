// Settings mock: the values the approved boards show on open, and the option ids of the
// model pickers (their labels are in the screen's strings.ts). Nothing is saved.
export type Activity = "quiet" | "moderate" | "lively" | "chaotic";
export type Writers = "profile" | "equal";
export type ChatHours = "same" | "own";
export type ModelId = "default" | "fast" | "large" | "local";

/** Categories of the world feed (plugins/life); the labels are in the Settings strings. */
export const LIFE_CATS = ["news", "politics", "games", "film", "anime", "science", "culture", "weather", "reddit"] as const;
export type LifeCat = (typeof LIFE_CATS)[number];

/** Life (issue #311): characters keep a diary, and may follow the outside world through one shared daily feed. */
export interface LifeSettings {
  on: boolean;
  world: boolean;
  cats: Record<LifeCat, boolean>;
  /** The place the user typed for the weather ("" = no weather). */
  place: string;
}

export const LIFE_DEFAULTS: LifeSettings = {
  on: true,
  world: true,
  cats: { news: true, politics: true, games: true, film: true, anime: true, science: true, culture: true, weather: true, reddit: true },
  place: "",
};

export interface SettingsMock {
  autonomous: boolean;
  activity: Activity;
  postsPerDay: number;
  postsPerAuthor: number;
  newTopicShare: number;
  quietFrom: string;
  quietTo: string;
  writers: Writers;
  messengerFirst: boolean;
  messengerPerDay: number;
  messengerQuiet: ChatHours;
  /** Model choices: preview uses the four ids below; real mode uses "provider/model" or "" (engine default). */
  models: { messenger: string; forum: string; import: string };
  notify: { tab: boolean; system: boolean; sound: boolean };
  roleplayAccess: boolean;
  life: LifeSettings;
  /** Forum model requests already made today (a count from the server in the real app). */
  usedToday: number;
}

export const SETTINGS_MOCK: SettingsMock = {
  autonomous: true,
  activity: "moderate",
  postsPerDay: 30,
  postsPerAuthor: 6,
  newTopicShare: 20,
  quietFrom: "01:00",
  quietTo: "08:00",
  writers: "profile",
  messengerFirst: true,
  messengerPerDay: 5,
  messengerQuiet: "same",
  models: { messenger: "default", forum: "default", import: "default" },
  notify: { tab: true, system: true, sound: false },
  roleplayAccess: true,
  life: { ...LIFE_DEFAULTS, place: "Kyiv, Ukraine" },
  usedToday: 12,
};

export const MODEL_IDS: ModelId[] = ["default", "fast", "large", "local"];

/** Min and max for the steppers; the screen clamps to these. */
export const LIMITS = {
  postsPerDay: { min: 0, max: 200 },
  postsPerAuthor: { min: 1, max: 50 },
  messengerPerDay: { min: 0, max: 50 },
} as const;

/** Quiet-hour choices, every half hour. */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 ? "30" : "00"}`;
});
