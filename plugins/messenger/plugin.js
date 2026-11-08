/**
 * Social messenger: one chat per profile, replies written by the profile's own voice, and a status
 * (from the weekly schedule) that decides when a reply comes.
 *
 * Routes (relative to /v1/apps/social):
 *   GET  /messenger/contacts            {contacts: [{id, name, hue, picture, source, status, nextOnline (ms or null), line, unread, lastAt, pending}], now}
 *   GET  /messenger/chat?id=<profile>   {chat: {id, status, nextOnline, messages, pending, failed}}
 *   POST /messenger/send {id, text}     adds the user's message; when the profile is online the reply is written now
 *          ({ok, queued, chat} or {ok: false, error, code?, chat}); otherwise the reply is queued (see below)
 *   POST /messenger/retry {id}          asks again for the reply to the last message (after a failure, or a queued one now)
 *   POST /messenger/read {id}           marks the chat read
 *
 * When a reply comes (the profile's status at the time of the message): online, now; away, after a short
 * delay; do not disturb, unavailable or offline, when the schedule next makes the profile online. A queued reply is
 * written by `onTick` (every minute while the engine runs). A chat keeps `pending` (a reply is owed) until it arrives.
 *
 * A message (`who`: "me" | "them") is {id, who, at (ms), text}. The profile is read from profiles/<id>.json (written
 * by the profiles plugin); a Roleplay card is never read here. Permissions: routes, fs, llm, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const STATUSES = ["online", "away", "dnd", "na", "off"];
const HISTORY = 24;
const TEXT_MAX = 2000;
const KEEP = 500;
const TICK_BATCH = 2;
const SELF = "me";

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
const ok = (json, status) => ({ status: status || 200, json });
const noControls = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 && ch !== "\n" ? " " : ch)).join("");
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};

const profilePath = (id) => "profiles/" + id + ".json";
const chatPath = (id) => "chats/" + id + ".json";

// ---------- status from the schedule ----------

/**
 * The status a profile has at `date`: schedule[band][day], 8 bands of 3 hours by 7 days from Monday, in the user's
 * local time. `tz` is the user's offset as the browser reports it (minutes, UTC minus local: -120 for UTC+2); the
 * sandbox cannot be trusted to know the machine's zone, so the app stores the browser's offset in settings.json.
 */
export function statusAt(schedule, date, tz) {
  const off = Number.isFinite(tz) ? tz : date.getTimezoneOffset();
  const local = new Date(date.getTime() - off * 60000);
  const band = Math.floor(local.getUTCHours() / 3);
  const day = (local.getUTCDay() + 6) % 7;
  const row = Array.isArray(schedule) ? schedule[band] : null;
  const s = Array.isArray(row) ? row[day] : null;
  return STATUSES.includes(s) ? s : "off";
}

/** The next moment (ms) the schedule makes the profile online, searching up to a week ahead in 3-hour bands; null when never. */
export function nextOnline(schedule, from, tz) {
  const off = Number.isFinite(tz) ? tz : new Date(from).getTimezoneOffset();
  const band = 3 * 3600 * 1000;
  const startLocal = Math.floor((from - off * 60000) / band) * band + off * 60000;
  for (let i = 1; i <= 56; i++) {
    const t = startLocal + i * band;
    if (statusAt(schedule, new Date(t), off) === "online") return t;
  }
  return null;
}

/** A small stable delay for an "away" reply: 1 to 4 minutes, from the message time, so a retry does not move it. */
export function awayDelayMs(at) {
  return (1 + (Math.abs(Math.floor(at / 1000)) % 4)) * 60 * 1000;
}

// ---------- profiles and chats ----------

function readProfile(fsx, id) {
  if (!ID.test(String(id))) return null;
  const p = readJson(fsx, profilePath(id), null);
  if (!isObj(p) || !str(p.name)) return null;
  return p;
}

function emptyChat(id) {
  return { id, messages: [], pending: null, failed: null, unread: false };
}

function readChat(fsx, id) {
  const c = readJson(fsx, chatPath(id), null);
  if (!isObj(c)) return emptyChat(id);
  const messages = (Array.isArray(c.messages) ? c.messages : [])
    .filter((m) => isObj(m) && (m.who === SELF || m.who === "them") && typeof m.text === "string" && Number.isFinite(m.at))
    .map((m) => ({ id: String(m.id), who: m.who, at: m.at, text: m.text }));
  const pending = isObj(c.pending) && Number.isFinite(c.pending.at) ? { at: c.pending.at, dueAt: Number.isFinite(c.pending.dueAt) ? c.pending.dueAt : null } : null;
  const failed = isObj(c.failed) ? { error: str(c.failed.error), ...(c.failed.code === "no-model" ? { code: "no-model" } : {}) } : null;
  return { id, messages, pending, failed, unread: c.unread === true };
}

function writeChat(fsx, chat) {
  const messages = chat.messages.slice(-KEEP);
  fsx.write(chatPath(chat.id), JSON.stringify({ ...chat, messages }, null, 2));
}

function newId(at, who) {
  return who + "-" + at + "-" + Math.floor(Math.random() * 1e6);
}

/** The chat as the screen shows it. */
function viewOf(chat, profile, now, tz) {
  return {
    id: chat.id,
    status: statusAt(profile.schedule, new Date(now), tz),
    nextOnline: nextOnline(profile.schedule, now, tz),
    messages: chat.messages,
    pending: chat.pending,
    failed: chat.failed,
  };
}

function allProfileIds(fsx) {
  let names = [];
  try {
    names = fsx.list("profiles");
  } catch {
    return [];
  }
  return names.map((n) => /^([A-Za-z0-9_-]{1,60})\.json$/.exec(n)).filter(Boolean).map((m) => m[1]);
}

// ---------- the reply ----------

const LENGTH_WORDS = ["Short: one or two sentences.", "Medium: two to four sentences.", "Long: a short paragraph when the topic asks for it."];
const EMOJI_WORDS = ["Never use emoji.", "Use an emoji only now and then.", "Use emoji often."];
const MAX_TOKENS = [200, 400, 800];

/** The system prompt that makes the model write as this profile. */
export function systemPromptFor(p, userName) {
  const v = isObj(p.voice) ? p.voice : {};
  const length = [0, 1, 2].includes(v.length) ? v.length : 1;
  const emoji = [0, 1, 2].includes(v.emoji) ? v.emoji : 0;
  const formality = Number.isFinite(v.formality) ? v.formality : 30;
  const lines = [
    "You are " + str(p.name) + ", a character chatting in a messenger with " + (userName || "the user") + ". Stay in character at all times.",
  ];
  if (str(p.about)) lines.push("Who you are: " + cut(str(p.about), 1500));
  if (Array.isArray(p.interests) && p.interests.length) lines.push("Your interests: " + p.interests.slice(0, 12).join(", ") + ".");
  if (Array.isArray(p.habits) && p.habits.length) lines.push("Your habits: " + p.habits.slice(0, 10).map((h) => str(h && h.text)).filter(Boolean).join("; ") + ".");
  if (str(v.text)) lines.push("How you write: " + cut(str(v.text), 800));
  lines.push(LENGTH_WORDS[length] + " " + EMOJI_WORDS[emoji] + " " + (formality >= 66 ? "Formal, polite address." : formality <= 33 ? "Informal, on first-name terms." : "Neutral tone."));
  if (Array.isArray(v.never) && v.never.length) lines.push("Never write: " + v.never.slice(0, 12).join(", ") + ".");
  lines.push("Write only your next message, as plain chat text: no quotation marks around it, no stage directions or narration, no name label.");
  lines.push("Answer in the language the user writes in. If you do not know something about the real world, say so in your own voice instead of inventing facts.");
  return lines.join("\n");
}

/** The model's history: the last messages, in order, the user's as "user" and the profile's as "assistant". */
export function historyFor(messages) {
  const tail = messages.slice(-HISTORY);
  return tail.map((m) => ({ role: m.who === SELF ? "user" : "assistant", content: m.text }));
}

/** A reply cleaned for the chat: no thinking notes, no leading name label, no wrapping quotes. */
export function cleanReply(text, name) {
  let s = String(text || "").replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "");
  s = noControls(s.replace(/<[^>]*>/g, " ")).replace(/[ \t]{2,}/g, " ").trim();
  const label = new RegExp("^\\s*" + String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:\\-—]\\s*", "i");
  if (name) s = s.replace(label, "");
  if (/^["«“].*["»”]$/s.test(s) && !/["«“]/.test(s.slice(1, -1))) s = s.slice(1, -1);
  return cut(s.trim(), TEXT_MAX);
}

/** An engine error as the screen's reply: "no model" gets its own code. */
export function failure(error) {
  const e = String(error || "the model returned nothing");
  return { error: e, ...(/no model providers|is not available|connection is missing/i.test(e) ? { code: "no-model" } : {}) };
}

/** The user's UTC offset in minutes as the app last stored it in settings.json; null when it has not. */
const tzOf = (fsx) => {
  const s = readJson(fsx, "settings.json", null);
  return isObj(s) && Number.isFinite(s.tzOffset) && Math.abs(s.tzOffset) <= 840 ? s.tzOffset : null;
};

const modelRef = (v) => {
  const m = str(v);
  return m && m !== "default" && /^[^\s]{1,200}$/.test(m) ? m : "";
};

/** The profile's picture: an engine asset URL, or "". */
const pictureOf = (p) => (isObj(p) && typeof p.picture === "string" && /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/.test(p.picture) ? p.picture : "");

/** The model for a reply: the profile's own (Profiles > Model), else the messenger's in Settings, else "" (the engine's). */
const messengerModel = (fsx, profile) => {
  const own = isObj(profile) ? modelRef(profile.model) : "";
  if (own) return own;
  const s = readJson(fsx, "settings.json", null);
  return modelRef(isObj(s) && isObj(s.models) ? s.models.messenger : "");
};

/** Asks the model for the reply to the chat's last user message. */
function requestReply(host, key, profile, chat) {
  const model = messengerModel(host.fs, profile);
  const length = isObj(profile.voice) && [0, 1, 2].includes(profile.voice.length) ? profile.voice.length : 1;
  host.llm.request(key, {
    ...(model ? { model } : {}),
    systemPrompt: systemPromptFor(profile),
    messages: historyFor(chat.messages),
    presetParams: { temperature: 0.85, max_tokens: MAX_TOKENS[length] },
  });
}

/** Files the model's answer: the reply message, or the failure. Returns an error string or "". */
function fileReply(chat, profile, result, now) {
  const r = isObj(result) ? result : {};
  const text = r.error ? "" : cleanReply(r.text, profile.name);
  if (!text) {
    chat.failed = failure(r.error || "the model returned nothing");
    return chat.failed;
  }
  chat.messages.push({ id: newId(now, "them"), who: "them", at: now, text });
  chat.pending = null;
  chat.failed = null;
  return null;
}

// ---------- routes ----------

function lineOf(chat) {
  const last = chat.messages[chat.messages.length - 1];
  return last ? cut(last.text.replace(/\s+/g, " "), 80) : "";
}

function contactsRoute(host) {
  const fsx = host.fs;
  const now = Date.now();
  const tz = tzOf(fsx);
  const contacts = [];
  for (const id of allProfileIds(fsx)) {
    const p = readProfile(fsx, id);
    if (!p) continue;
    const chat = readChat(fsx, id);
    const last = chat.messages[chat.messages.length - 1];
    contacts.push({
      id,
      name: str(p.name),
      hue: Number.isFinite(p.hue) ? p.hue : 200,
      picture: pictureOf(p),
      source: str(p.source) || "own",
      status: statusAt(p.schedule, new Date(now), tz),
      nextOnline: nextOnline(p.schedule, now, tz),
      line: lineOf(chat),
      unread: chat.unread,
      lastAt: last ? last.at : 0,
      pending: !!chat.pending,
    });
  }
  contacts.sort((a, b) => a.name.localeCompare(b.name));
  return ok({ contacts, now });
}

function chatRoute(req, host) {
  const id = String((isObj(req.query) ? req.query.id : "") || "");
  const p = readProfile(host.fs, id);
  if (!p) return ok({ error: "no such profile" }, 404);
  return ok({ chat: viewOf(readChat(host.fs, id), p, Date.now()) });
}

function sendRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const id = String(b.id || "");
  const p = readProfile(fsx, id);
  if (!p) return ok({ error: "no such profile" }, 404);
  const stash = isObj(req.stash) ? req.stash : null;
  const result = host.llm.results.reply;
  const now = Date.now();
  const chat = readChat(fsx, id);

  if (!stash) {
    const text = cut(noControls(String(typeof b.text === "string" ? b.text : "")).trim(), TEXT_MAX);
    if (!text) return ok({ error: "a message needs text" }, 400);
    chat.messages.push({ id: newId(now, SELF), who: SELF, at: now, text });
    chat.failed = null;
    const status = statusAt(p.schedule, new Date(now), tzOf(fsx));
    if (status === "online") {
      chat.pending = { at: now, dueAt: now };
      writeChat(fsx, chat);
      requestReply(host, "reply", p, chat);
      return { __llmPending: true, stash: { sent: true } };
    }
    chat.pending = { at: now, dueAt: status === "away" ? now + awayDelayMs(now) : null };
    writeChat(fsx, chat);
    return ok({ ok: true, queued: true, chat: viewOf(chat, p, now, tzOf(fsx)) });
  }

  // second pass: the model has answered
  const err = fileReply(chat, p, result, now);
  writeChat(fsx, chat);
  if (err) return ok({ ok: false, error: err.error, ...(err.code ? { code: err.code } : {}), chat: viewOf(chat, p, now, tzOf(fsx)) });
  return ok({ ok: true, chat: viewOf(chat, p, now, tzOf(fsx)) });
}

function retryRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const id = String(b.id || "");
  const p = readProfile(fsx, id);
  if (!p) return ok({ error: "no such profile" }, 404);
  const chat = readChat(fsx, id);
  const now = Date.now();
  const stash = isObj(req.stash) ? req.stash : null;
  if (!stash) {
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.who !== SELF) return ok({ error: "nothing to reply to" }, 400);
    chat.pending = chat.pending || { at: last.at, dueAt: now };
    requestReply(host, "reply", p, chat);
    return { __llmPending: true, stash: { retry: true } };
  }
  const err = fileReply(chat, p, host.llm.results.reply, now);
  writeChat(fsx, chat);
  if (err) return ok({ ok: false, error: err.error, ...(err.code ? { code: err.code } : {}), chat: viewOf(chat, p, now, tzOf(fsx)) });
  return ok({ ok: true, chat: viewOf(chat, p, now, tzOf(fsx)) });
}

function readRoute(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const id = String(b.id || "");
  if (!readProfile(host.fs, id)) return ok({ error: "no such profile" }, 404);
  const chat = readChat(host.fs, id);
  if (chat.unread) {
    chat.unread = false;
    writeChat(host.fs, chat);
  }
  return ok({ ok: true });
}

// ---------- onTick: replies that were waiting for the profile ----------

/** The chats whose reply is due now: a reply is owed, its time has come, the profile is online (or away and the delay passed). */
export function dueChats(fsx, now) {
  const tz = tzOf(fsx);
  const out = [];
  for (const id of allProfileIds(fsx)) {
    const chat = readChat(fsx, id);
    if (!chat.pending) continue;
    const p = readProfile(fsx, id);
    if (!p) continue;
    const status = statusAt(p.schedule, new Date(now), tz);
    const dueAt = chat.pending.dueAt;
    const due = dueAt !== null ? now >= dueAt : status === "online";
    if (due && (status === "online" || status === "away")) out.push({ id, chat, profile: p });
  }
  return out;
}

export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !host.llm) return;
  const now = Date.now();
  const results = host.llm.results || {};
  const done = Object.keys(results).filter((k) => k.startsWith("rep:"));
  if (done.length) {
    for (const key of done) {
      const id = key.slice(4);
      const p = readProfile(fsx, id);
      if (!p) continue;
      const chat = readChat(fsx, id);
      if (!chat.pending) continue;
      const err = fileReply(chat, p, results[key], now);
      if (!err) chat.unread = true;
      // a failed background reply is not retried every minute: the chat keeps `failed` and `pending` until the user retries
      writeChat(fsx, chat);
    }
    return;
  }
  let asked = 0;
  for (const d of dueChats(fsx, now)) {
    if (d.chat.failed) continue;
    requestReply(host, "rep:" + d.id, d.profile, d.chat);
    if (++asked >= TICK_BATCH) break;
  }
}

// ---------- routing ----------

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  const method = req && req.method;
  if (!path.startsWith("/messenger/") && path !== "/messenger") return null;
  if (path === "/messenger/contacts" && method === "GET") return contactsRoute(host);
  if (path === "/messenger/chat" && method === "GET") return chatRoute(req, host);
  if (path === "/messenger/send" && method === "POST") return sendRoute(req, host);
  if (path === "/messenger/retry" && method === "POST") return retryRoute(req, host);
  if (path === "/messenger/read" && method === "POST") return readRoute(req, host);
  return ok({ error: "not found" }, 404);
}
