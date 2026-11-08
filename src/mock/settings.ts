// Settings mock: the values the approved boards show on open, and the option ids of the
// model pickers (their labels are in the screen's strings.ts). Nothing is saved.
export type Activity = "quiet" | "moderate" | "lively" | "chaotic";
export type Writers = "profile" | "equal";
export type ChatHours = "same" | "own";
export type ModelId = "default" | "fast" | "large" | "local";

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
  models: { messenger: ModelId; forum: ModelId; import: ModelId };
  notify: { tab: boolean; system: boolean; sound: boolean };
  roleplayAccess: boolean;
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
