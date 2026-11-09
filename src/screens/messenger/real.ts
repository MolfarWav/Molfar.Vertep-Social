// Pure parts of the Messenger screen in real mode: the engine's answers as the screen shows them,
// the local times and the next-online text. No React and no network here, so
// test/messenger-real.test.ts can drive them directly.
import type { Contact, LogItem } from "@/mock/messenger";
import type { Status } from "@/mock/status";
import type { MsgImage } from "@/pictures/MsgPicture";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** A contact as GET /messenger/contacts answers it (plugins/messenger/plugin.js). */
export interface EngineContact {
  id: string;
  name: string;
  hue: number;
  picture?: string;
  source: string;
  status: Status;
  nextOnline: number | null;
  line: string;
  unread: boolean;
  lastAt: number;
  pending: boolean;
}

export interface EngineMessage {
  id: string;
  who: "me" | "them";
  at: number;
  text: string;
  /** A picture the user attached or a character sent (drawn, or waiting to be). */
  image?: MsgImage;
}

export interface EngineFailure {
  error: string;
  code?: "no-model";
}

/** A chat as GET /messenger/chat and the send and retry answers carry it. */
export interface EngineChat {
  id: string;
  status: Status;
  nextOnline: number | null;
  messages: EngineMessage[];
  pending: { at: number; dueAt: number | null } | null;
  failed: EngineFailure | null;
}

/** The answer of POST /messenger/send and POST /messenger/retry. */
export interface EngineAnswer {
  ok: boolean;
  queued?: boolean;
  error?: string;
  code?: string;
  chat?: EngineChat;
}

/** The open chat as the screen keeps it. */
export interface ChatView {
  items: LogItem[];
  /** Time of the first message (ms), for the day line; null when the log is empty. */
  firstAt: number | null;
  /** A reply is owed (the engine keeps this until the reply arrives or fails). */
  pending: boolean;
  failed: EngineFailure | null;
  /** A send or a retry is in flight. */
  busy: boolean;
  loaded: boolean;
}

export const EMPTY_CHAT: ChatView = { items: [], firstAt: null, pending: false, failed: null, busy: false, loaded: false };

/** Local time as HH:MM. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** The day line of the log: "Today" when the first message is from today, else the date. */
export function dayLabel(firstAt: number | null, now: number, lang: string, t: Translate): string {
  if (firstAt === null || sameDay(firstAt, now)) return t("messenger.today");
  return t("messenger.dateLine", { date: new Date(firstAt).toLocaleDateString(lang) });
}

/** How fast the character answers, by status. */
export function replyText(status: Status, t: Translate): string {
  if (status === "online") return t("messenger.reply.online");
  if (status === "away") return t("messenger.reply.away");
  return t("messenger.reply.later");
}

/** The schedule line of the info card: online now, the next online time, or never this week. */
export function scheduleText(status: Status, nextOnline: number | null, lang: string, t: Translate): string {
  if (status === "online") return t("messenger.schedule.online");
  if (nextOnline === null) return t("messenger.schedule.none");
  const day = new Date(nextOnline).toLocaleDateString(lang, { weekday: "long" });
  return t("messenger.schedule.back", { day, time: clock(nextOnline) });
}

/** An engine contact as the screen's Contact. Real mode has no free-text schedule and no separator note. */
export function contactFromEngine(e: EngineContact, lang: string, t: Translate): Contact {
  return {
    id: e.id,
    name: e.name,
    hue: e.hue,
    ...(e.picture ? { picture: e.picture } : {}),
    status: e.status,
    line: e.line,
    unread: e.unread,
    typing: false,
    note: "",
    to: e.name,
    of: e.name,
    schedule: scheduleText(e.status, e.nextOnline, lang, t),
    reply: replyText(e.status, t),
    first: "",
  };
}

/** The messages of a chat as log lines: the user's as "me", the character's as the contact id. */
export function logItems(messages: EngineMessage[], contactId: string): LogItem[] {
  return messages.map((m) => ({ kind: "msg", who: m.who === "me" ? "me" : contactId, time: clock(m.at), text: m.text, ...(m.image ? { image: m.image } : {}) }));
}

/** An engine chat as the screen's chat view. */
export function chatView(chat: EngineChat, contactId: string): ChatView {
  return {
    items: logItems(chat.messages, contactId),
    firstAt: chat.messages.length ? chat.messages[0].at : null,
    pending: chat.pending !== null,
    failed: chat.failed ?? null,
    busy: false,
    loaded: true,
  };
}
