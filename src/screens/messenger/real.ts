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

/** The memory note of a chat as the engine shows it (plugins/messenger: `chat.summary`). */
export interface EngineNote {
  text: string;
  at: number;
  edited: boolean;
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
  /** The memory note and the "new conversation" dividers (absent in an answer of an older plugin). */
  summary?: EngineNote | null;
  breaks?: number[];
}

/** The answer of POST /messenger/send and POST /messenger/retry (and, with `warn`, of /messenger/new). */
export interface EngineAnswer {
  ok: boolean;
  queued?: boolean;
  error?: string;
  code?: string;
  /** "note": the note could not be updated for a new conversation (the divider was made anyway). */
  warn?: string;
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
  /** The memory note of the chat ("" when there is none), and whether the user wrote it. */
  note: string;
  noteEdited: boolean;
  /** How many messages the chat holds (the Clear chat question names it). */
  count: number;
}

export const EMPTY_CHAT: ChatView = { items: [], firstAt: null, pending: false, failed: null, busy: false, loaded: false, note: "", noteEdited: false, count: 0 };

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

/** The messages of a chat as log lines: the user's as "me", the character's as the contact id. A "new conversation" divider sits before the first message that came after it. */
export function logItems(messages: EngineMessage[], contactId: string, breaks: number[] = []): LogItem[] {
  const out: LogItem[] = [];
  const dividers = [...breaks].sort((a, b) => a - b);
  let next = 0;
  for (const m of messages) {
    while (next < dividers.length && dividers[next] <= m.at) out.push({ kind: "break", at: dividers[next++] });
    out.push({ kind: "msg", who: m.who === "me" ? "me" : contactId, time: clock(m.at), text: m.text, ...(m.image ? { image: m.image } : {}) });
  }
  while (next < dividers.length) out.push({ kind: "break", at: dividers[next++] });
  return out;
}

/** The date and time of a divider in the user's language: "12 Nov, 14:20". */
export function breakLabel(at: number, lang: string): string {
  return new Date(at).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** An engine chat as the screen's chat view. */
export function chatView(chat: EngineChat, contactId: string): ChatView {
  return {
    items: logItems(chat.messages, contactId, chat.breaks ?? []),
    firstAt: chat.messages.length ? chat.messages[0].at : null,
    pending: chat.pending !== null,
    failed: chat.failed ?? null,
    busy: false,
    loaded: true,
    note: chat.summary?.text ?? "",
    noteEdited: chat.summary?.edited === true,
    count: chat.messages.length,
  };
}
