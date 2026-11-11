// Settings mock: the values the approved boards show on open, and the option ids of the
// model pickers (their labels are in the screen's strings.ts). Nothing is saved.
export type Activity = "quiet" | "moderate" | "lively" | "chaotic";
export type Writers = "profile" | "equal";
export type ChatHours = "same" | "own";
/** How well a character knows the person writing (issue #333). */
export type Knows = "knows" | "name" | "stranger";
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
  /** Subjects the feed keeps (issue #358): ids of the plugin's list and the user's own. Empty = every category. */
  topics: { on: string[]; custom: { id: string; label: string; words: string[] }[] };
}

export const LIFE_DEFAULTS: LifeSettings = {
  on: true,
  world: true,
  cats: { news: true, politics: true, games: true, film: true, anime: true, science: true, culture: true, weather: true, reddit: true },
  place: "",
  topics: { on: [], custom: [] },
};

export type EventsRate = "off" | "daily" | "weekly";
export type ModComments = "off" | "rare" | "often";
export type CommunityTone = "none" | "warm" | "flirty";

/** The community around the posts (issue #358). Every cap counts per character per day. */
export interface CommunitySettings {
  /** Characters react to posts by rules (no model call). */
  reactions: boolean;
  reactionsPerDay: number;
  /** How often one event gets several characters talking on the forum. */
  events: EventsRate;
  /** How often the Moderator comments in a lively topic. */
  modComments: ModComments;
  /** The Moderator closes topics that went quiet or ran too long, and ends events. */
  modCloses: boolean;
  /** Once a day the Moderator posts a digest of what happened between the members (issue #367); one model request, only when there is something to tell. */
  chronicle: boolean;
  /** A story: a short post with a picture that vanishes after a day. */
  stories: boolean;
  storiesPerDay: number;
  /** Characters chat with each other in the messenger (about twice the tokens of a normal chat). */
  chats: boolean;
  chatsPerDay: number;
  /** Clubs: group chats of three or four characters (issue #368); one model call per message, off by default. */
  clubs: boolean;
  clubsPerDay: number;
  /** Answers to your own messages, a day in each club; 0 = members never answer you. On top of `clubsPerDay`. */
  clubsAnswers: number;
  /** The Moderator starts a club from characters who share an interest (by rules, no model call). */
  clubsMod: boolean;
  /** The ceiling for what characters write to each other (issue #366): no romance, affection only, or hints and teasing. Never explicit. */
  tone: CommunityTone;
  /** Characters sometimes open a topic about what they noticed between two others (issue #367); by rules, no model call. */
  gossip: boolean;
  gossipPerDay: number;
  /** A rival's post draws an argument, a jealous character goes cool (issue #367); by rules, no model call. */
  jealousy: boolean;
  /** A character passes a post it likes on, by rules (issue #367); no model call. */
  reposts: boolean;
  repostsPerDay: number;
}

export const COMMUNITY_DEFAULTS: CommunitySettings = { reactions: true, reactionsPerDay: 8, events: "weekly", modComments: "rare", modCloses: true, chronicle: true, stories: false, storiesPerDay: 1, chats: false, chatsPerDay: 4, clubs: false, clubsPerDay: 12, clubsAnswers: 20, clubsMod: true, tone: "warm", gossip: true, gossipPerDay: 2, jealousy: true, reposts: true, repostsPerDay: 2 };

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
  /** How many of the latest messages of a chat go to the model with each reply. */
  messengerContext: number;
  /** Older messages are folded into a short note that goes with the latest ones (one model call each time). */
  messengerSummary: boolean;
  /** The few older messages closest in meaning to the talk are quoted to the model word for word (off by default). */
  messengerRecall: boolean;
  /** The default for characters that have no choice of their own. */
  messengerKnows: Knows;
  /** Model choices: preview uses the four ids below; real mode uses "provider/model" or "" (engine default). */
  models: { messenger: string; forum: string; import: string; image: string };
  notify: { tab: boolean; system: boolean; sound: boolean };
  roleplayAccess: boolean;
  life: LifeSettings;
  community: CommunitySettings;
  /** Pictures in messages: characters may send generated pictures, at most `perDay` each (messenger and forum separately). */
  images: { on: boolean; perDay: number };
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
  messengerContext: 24,
  messengerSummary: true,
  messengerRecall: false,
  messengerKnows: "knows",
  models: { messenger: "default", forum: "default", import: "default", image: "" },
  notify: { tab: true, system: true, sound: false },
  roleplayAccess: true,
  life: { ...LIFE_DEFAULTS, place: "Kyiv, Ukraine" },
  community: { ...COMMUNITY_DEFAULTS, stories: true, chats: true },
  images: { on: true, perDay: 2 },
  usedToday: 12,
};

export const MODEL_IDS: ModelId[] = ["default", "fast", "large", "local"];

/** Min and max for the steppers; the screen clamps to these. */
export const LIMITS = {
  postsPerDay: { min: 0, max: 200 },
  postsPerAuthor: { min: 1, max: 50 },
  messengerPerDay: { min: 0, max: 50 },
  imagesPerDay: { min: 0, max: 20 },
  reactionsPerDay: { min: 0, max: 50 },
  storiesPerDay: { min: 0, max: 10 },
  chatsPerDay: { min: 0, max: 30 },
  clubsPerDay: { min: 1, max: 40 },
  clubsAnswers: { min: 0, max: 100 },
  gossipPerDay: { min: 0, max: 20 },
  repostsPerDay: { min: 0, max: 20 },
  messengerContext: { min: 4, max: 500 },
} as const;

/** Quiet-hour choices, every half hour. */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 ? "30" : "00"}`;
});
