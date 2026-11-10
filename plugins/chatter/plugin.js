/**
 * Social chatter (issue #358): characters write to each other in the messenger, and the user may read it.
 *
 * Off by default (Settings > Community > "Characters talk to each other": about twice the tokens of a normal chat, so free models are
 * a risk), and each pair needs its own switch: the user picks two characters and lets them talk. A pair writes at most `chatsPerDay`
 * messages a day, one model call each, only when both are around by their schedule, on the messenger model (the profile's own wins).
 * What they remember of each other (the Life plugin's list: the impression and how it stands between them) goes into the prompt, so
 * the talk follows the relationship. A character's card is never read here.
 *
 * Data: chatter/<a>__<b>.json {a, b, on, day, today, messages: [{id, by, at, text}], pending, failedAt} with a < b by id.
 *
 * Routes (relative to /v1/apps/social):
 *   GET    /chatter                      {on, max, pairs: [{key, a, b, on, count, last}]} (a and b are {id, name, hue, picture})
 *   GET    /chatter/chat?key=            {pair, messages: [{id, by, at, text}]}
 *   POST   /chatter/pair {a, b, on?}     makes a pair (on by default) or switches it
 *   POST   /chatter/remove {key}         deletes the pair and its talk
 *
 * Permissions: routes, fs, llm, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const KEY = /^([A-Za-z0-9_-]{1,60})__([A-Za-z0-9_-]{1,60})$/;
const STATUSES = ["online", "away", "dnd", "na", "off"];
const MAX_PAIRS_ON = 8;
const KEEP = 200;
const CONTEXT = 12;
const CHANCE = 0.12;
const FAIL_WAIT_MS = 30 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 5 * 60 * 1000;
const TEXT_MAX = 600;
const ASSET = /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ok = (json, status) => ({ status: status || 200, json });
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const cut = (s, n) => {
  if (s.length <= n) return s;
  let out = s.slice(0, n);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.replace(/[‍️]+$/, "");
};
const noControls = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 && ch !== "\n" ? " " : ch)).join("");
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const modelRef = (v) => {
  const m = str(v);
  return m && m !== "default" && /^[^\s]{1,200}$/.test(m) ? m : "";
};

const offsetOf = (now, tz) => (Number.isFinite(tz) ? tz : new Date(now).getTimezoneOffset());
export const localDay = (now, tz) => new Date(now - offsetOf(now, tz) * 60000).toISOString().slice(0, 10);

/** The status a profile has at `date`: schedule[band][day] (8 bands of 3 hours by 7 days from Monday), in the user's time. */
export function statusAt(schedule, date, tz) {
  const off = Number.isFinite(tz) ? tz : date.getTimezoneOffset();
  const local = new Date(date.getTime() - off * 60000);
  const band = Math.floor(local.getUTCHours() / 3);
  const day = (local.getUTCDay() + 6) % 7;
  const row = Array.isArray(schedule) ? schedule[band] : null;
  const s = Array.isArray(row) ? row[day] : null;
  return STATUSES.includes(s) ? s : "off";
}

// ---------- settings and profiles ----------

export function readSettings(fsx) {
  const r = readJson(fsx, "settings.json", null);
  const raw = isObj(r) ? r : {};
  const c = isObj(raw.community) ? raw.community : {};
  const m = isObj(raw.models) ? raw.models : {};
  return {
    on: c.chats === true,
    perDay: Number.isInteger(c.chatsPerDay) && c.chatsPerDay >= 0 && c.chatsPerDay <= 30 ? c.chatsPerDay : 4,
    model: modelRef(m.messenger),
    tz: typeof raw.tzOffset === "number" && Number.isFinite(raw.tzOffset) && Math.abs(raw.tzOffset) <= 840 ? raw.tzOffset : null,
  };
}

function readProfile(fsx, id) {
  if (!ID.test(String(id))) return null;
  const p = readJson(fsx, "profiles/" + id + ".json", null);
  if (!isObj(p) || !str(p.name) || p.source === "persona") return null;
  return {
    id: String(id),
    name: str(p.name),
    hue: Number.isFinite(p.hue) ? p.hue : 200,
    about: str(p.about),
    voice: isObj(p.voice) ? p.voice : {},
    picture: typeof p.picture === "string" && ASSET.test(p.picture) ? p.picture : "",
    schedule: p.schedule,
    model: modelRef(p.model),
  };
}

const who = (p) => ({ id: p.id, name: p.name, hue: p.hue, picture: p.picture });

// ---------- the pair files ----------

export const keyOf = (a, b) => (a < b ? a + "__" + b : b + "__" + a);
const pairPath = (key) => "chatter/" + key + ".json";

export function readPair(fsx, key, now, tz) {
  const m = KEY.exec(String(key));
  if (!m || m[1] >= m[2]) return null;
  const d = readJson(fsx, pairPath(key), null);
  if (!isObj(d)) return null;
  const day = localDay(now, tz);
  return {
    a: m[1],
    b: m[2],
    on: d.on === true,
    day,
    today: d.day === day ? Math.max(0, Math.floor(num(d.today))) : 0,
    messages: (Array.isArray(d.messages) ? d.messages : [])
      .filter((x) => isObj(x) && typeof x.id === "string" && ID.test(x.id) && (x.by === m[1] || x.by === m[2]) && typeof x.text === "string" && str(x.text) && Number.isFinite(x.at))
      .map((x) => ({ id: x.id, by: x.by, at: x.at, text: cut(noControls(x.text).trim(), TEXT_MAX) }))
      .slice(-KEEP),
    pending: num(d.pending),
    failedAt: num(d.failedAt),
  };
}

const writePair = (fsx, key, p) => fsx.write(pairPath(key), JSON.stringify({ a: p.a, b: p.b, on: p.on, day: p.day, today: p.today, messages: p.messages.slice(-KEEP), pending: p.pending, failedAt: p.failedAt }));

function pairKeys(fsx) {
  try {
    return fsx.list("chatter").map((n) => /^(.+)\.json$/.exec(n)).filter(Boolean).map((m) => m[1]).filter((k) => KEY.test(k));
  } catch {
    return [];
  }
}

// <relation-shared>
// What the user set between two people: a level of familiarity and ties (the Life plugin writes them, "levels, ties and milestones" there).
// Read only here: a few lines for the prompt. Romance is told only when the profile and the other character are marked adult (the user's
// persona counts as the user's own choice), and between characters the prompt states the ceiling. A copy lives in each plugin that needs it.
const LEVEL_LINE = {
  stranger: "You do not really know them.",
  slight: "You know them only in passing.",
  acquaintance: "You are acquaintances: you know each other a little.",
  penfriend: "You are pen friends: you chat now and then and enjoy it.",
  friend: "You are friends.",
  close: "You are close friends and trust them.",
  confidant: "They are one of your closest people: you confide in them.",
};
const TIE_LINE = {
  spouse: "is your spouse.",
  parent: "is your parent.",
  child: "is your child.",
  sibling: "is your brother or sister.",
  relative: "is a relative of yours.",
  colleague: "is your colleague.",
  boss: "is your boss.",
  subordinate: "works under you.",
  rival: "is your rival.",
};
const ROMANCE_LINE = { crush: "You have a crush on NAME.", dating: "You are dating NAME.", partner: "NAME is your partner.", ex: "NAME is your ex." };
const ROMANCE_CEILING = "Keep anything romantic between you light: warmth, hints and teasing are fine, never anything explicit.";

/** The lines for one person of the character `p`'s list (`x`, key "c:<profile>" or "u:<persona>"): the level, the ties, and a romantic tie when it is allowed. */
export function relationBits(fsx, p, key, x) {
  const bits = [];
  const name = cut(str(x.name), 80) || "They";
  if (typeof x.lvl === "string" && LEVEL_LINE[x.lvl]) bits.push(LEVEL_LINE[x.lvl]);
  const mine = readJson(fsx, "profiles/" + p.id + ".json", null);
  const theirs = key.startsWith("c:") ? readJson(fsx, "profiles/" + key.slice(2) + ".json", null) : null;
  const may = isObj(mine) && mine.adult === true && (key.startsWith("u:") || (isObj(theirs) && theirs.adult === true));
  let romance = false;
  for (const t of Array.isArray(x.ties) ? x.ties.slice(0, 4) : []) {
    if (!isObj(t)) continue;
    if (typeof t.type === "string" && TIE_LINE[t.type]) bits.push(name + " " + TIE_LINE[t.type]);
    else if (t.type === "other" && typeof t.label === "string" && str(t.label)) bits.push("Your tie with " + name + ": " + cut(str(t.label), 40).replace(/[<>]/g, "") + ".");
    else if (may && typeof t.type === "string" && ROMANCE_LINE[t.type]) {
      bits.push(ROMANCE_LINE[t.type].replace("NAME", name));
      romance = true;
    }
  }
  if (romance && key.startsWith("c:")) bits.push(ROMANCE_CEILING);
  return bits;
}
// </relation-shared>

// ---------- the prompt ----------

/** What `speaker` remembers of `other` (the Life plugin's list, life/people/<speaker>.json): their impression, and how it stands between them. */
export function relationLine(fsx, speakerId, otherId) {
  const d = readJson(fsx, "life/people/" + speakerId + ".json", null);
  const x = isObj(d) && Array.isArray(d.people) ? d.people.find((q) => isObj(q) && q.key === "c:" + otherId) : null;
  if (!x) return "";
  const bits = [];
  if (typeof x.note === "string" && str(x.note)) bits.push("Your impression of them: " + cut(str(x.note), 160));
  const feel = typeof x.feel === "number" && Number.isFinite(x.feel) ? x.feel : 0;
  if (feel >= 7) bits.push("You are close to them and warm with them.");
  else if (feel >= 3) bits.push("You get on well with them.");
  else if (feel <= -7) bits.push("You are in open conflict with them: you may be sharp or pointed with them, in your own way.");
  else if (feel <= -3) bits.push("You do not get on with them: you tend to be cool with them.");
  return bits.concat(relationBits(fsx, { id: speakerId }, "c:" + otherId, x)).join(" ");
}

export function chatSystem(me, other, relation) {
  const lines = ["You are " + me.name + ", a character. You are writing in a private messenger chat with " + other.name + ", another character you know from the forum. Stay in your own voice."];
  if (me.about) lines.push("Who you are: " + cut(me.about, 800));
  if (str(me.voice.text)) lines.push("How you write: " + cut(str(me.voice.text), 400));
  if (relation) lines.push(relation);
  lines.push("Write one chat message: plain text, one to three sentences, no name label, no stage directions. Write in the language of the chat so far; when there is none, in the language of your description above. Do not invent big events.");
  return lines.join("\n");
}

export function chatUser(me, other, messages, seed) {
  if (!messages.length) return "Start the conversation with " + other.name + ": a short opening line" + (seed ? ", for example about this from your day: " + cut(seed, 240) : ", about anything on your mind") + ".";
  const lines = messages.slice(-CONTEXT).map((m) => (m.by === me.id ? me.name : other.name) + ": " + cut(m.text, 300));
  return "The chat so far:\n" + lines.join("\n") + "\n\nWrite your next message to " + other.name + ".";
}

/** A line of today's diary to open with: the last entry written by the character itself, or "". */
function diarySeed(fsx, id, day) {
  const d = readJson(fsx, "life/diary/" + id + ".json", null);
  const list = isObj(d) && Array.isArray(d.entries) ? d.entries : [];
  const e = list.filter((x) => isObj(x) && x.day === day && x.by !== "you" && str(x.text)).pop();
  return e ? str(e.text) : "";
}

// ---------- choosing ----------

/** The pair that may write now: on, under its daily cap, both around by their schedules, not asked or failed lately, the gap kept. Returns {key, pair, speaker, other} or null. */
export function pickPair(fsx, settings, now, rand) {
  if (!settings.on || settings.perDay <= 0) return null;
  const date = new Date(now);
  const cands = [];
  for (const key of pairKeys(fsx)) {
    const p = readPair(fsx, key, now, settings.tz);
    if (!p || !p.on || p.today >= settings.perDay) continue;
    if (now - p.failedAt < FAIL_WAIT_MS || now - p.pending < PENDING_MS) continue;
    const last = p.messages[p.messages.length - 1];
    if (last && now - last.at < MIN_GAP_MS) continue;
    const a = readProfile(fsx, p.a);
    const b = readProfile(fsx, p.b);
    if (!a || !b || !["online", "away"].includes(statusAt(a.schedule, date, settings.tz)) || !["online", "away"].includes(statusAt(b.schedule, date, settings.tz))) continue;
    // the other one answers; a first line is from either
    const speaker = last ? (last.by === a.id ? b : a) : rand() < 0.5 ? a : b;
    cands.push({ key, pair: p, speaker, other: speaker === a ? b : a });
  }
  return cands.length ? cands[Math.floor(rand() * cands.length)] : null;
}

/** Files the model's message ("ch:<key>:<speaker>"). Returns {message} or {error}. */
export function fileChatResult(fsx, key, result, now, tz) {
  const m = /^ch:([A-Za-z0-9_-]{1,60}__[A-Za-z0-9_-]{1,60}):([A-Za-z0-9_-]{1,60})$/.exec(String(key));
  if (!m) return { error: "bad key" };
  const pair = readPair(fsx, m[1], now, tz);
  if (!pair) return { error: "no such pair" };
  pair.pending = 0;
  const fail = (error) => {
    pair.failedAt = now;
    writePair(fsx, m[1], pair);
    return { error };
  };
  if (m[2] !== pair.a && m[2] !== pair.b) return fail("bad speaker");
  const r = isObj(result) ? result : {};
  if (r.error || !str(r.text)) return fail(r.error || "the model returned nothing");
  const me = readProfile(fsx, m[2]);
  let text = noControls(r.text.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").replace(/<[^>]*>/g, " ")).replace(/[ \t]{2,}/g, " ").trim();
  if (me) text = text.replace(new RegExp("^\\s*" + me.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:\\-—]\\s*", "i"), "");
  text = cut(text, TEXT_MAX).trim();
  if (!text) return fail("the model returned nothing");
  if (!pair.on) {
    writePair(fsx, m[1], pair);
    return { error: "the pair was switched off" };
  }
  const message = { id: "c-" + now + "-" + rid(), by: m[2], at: now, text };
  pair.messages.push(message);
  pair.today += 1;
  pair.failedAt = 0;
  writePair(fsx, m[1], pair);
  return { message };
}

// ---------- routes ----------

function view(fsx, key, now, tz) {
  const p = readPair(fsx, key, now, tz);
  const a = p ? readProfile(fsx, p.a) : null;
  const b = p ? readProfile(fsx, p.b) : null;
  if (!p || !a || !b) return null;
  const last = p.messages[p.messages.length - 1];
  return { key, a: who(a), b: who(b), on: p.on, count: p.messages.length, last: last ? { by: last.by, at: last.at, text: cut(last.text, 120) } : null };
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/chatter" && !path.startsWith("/chatter/")) return null;
  const fsx = host.fs;
  const now = Date.now();
  const settings = readSettings(fsx);
  const b = isObj(req.body) ? req.body : {};
  if (path === "/chatter" && req.method === "GET") {
    const pairs = pairKeys(fsx).map((k) => view(fsx, k, now, settings.tz)).filter(Boolean).sort((x, y) => (y.last ? y.last.at : 0) - (x.last ? x.last.at : 0));
    return ok({ on: settings.on, max: MAX_PAIRS_ON, pairs });
  }
  if (path === "/chatter/chat" && req.method === "GET") {
    const key = String(isObj(req.query) ? req.query.key : "");
    const v = view(fsx, key, now, settings.tz);
    if (!v) return ok({ error: "no such pair" }, 404);
    return ok({ pair: v, messages: readPair(fsx, key, now, settings.tz).messages });
  }
  if (path === "/chatter/pair" && req.method === "POST") {
    const a = String(b.a || "");
    const c = String(b.b || "");
    if (!ID.test(a) || !ID.test(c) || a === c || !readProfile(fsx, a) || !readProfile(fsx, c)) return ok({ error: "two different characters are needed" }, 400);
    const key = keyOf(a, c);
    const want = b.on !== false;
    const existing = readPair(fsx, key, now, settings.tz);
    const onCount = pairKeys(fsx).filter((k) => k !== key && (readPair(fsx, k, now, settings.tz) || {}).on).length;
    if (want && onCount >= MAX_PAIRS_ON) return ok({ error: "the most pairs at once is " + MAX_PAIRS_ON }, 409);
    const pair = existing || { a: key.split("__")[0], b: key.split("__")[1], on: false, day: localDay(now, settings.tz), today: 0, messages: [], pending: 0, failedAt: 0 };
    pair.on = want;
    writePair(fsx, key, pair);
    return ok({ ok: true, pair: view(fsx, key, now, settings.tz) });
  }
  if (path === "/chatter/remove" && req.method === "POST") {
    const key = String(b.key || "");
    if (!KEY.test(key)) return ok({ error: "no such pair" }, 404);
    try {
      fsx.remove(pairPath(key));
    } catch {
      // nothing to remove
    }
    return ok({ ok: true });
  }
  return ok({ error: "not found" }, 404);
}

// ---------- onTick ----------

export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !host.llm) return;
  const now = Date.now();
  const settings = readSettings(fsx);
  const results = host.llm.results || {};
  const keys = Object.keys(results).filter((k) => k.startsWith("ch:"));
  if (keys.length) {
    for (const k of keys) fileChatResult(fsx, k, results[k], now, settings.tz);
    return;
  }
  if (!settings.on || Math.random() >= CHANCE) return;
  const pick = pickPair(fsx, settings, now, Math.random);
  if (!pick) return;
  pick.pair.pending = now;
  writePair(fsx, pick.key, pick.pair);
  const model = pick.speaker.model || settings.model;
  const seed = pick.pair.messages.length ? "" : diarySeed(fsx, pick.speaker.id, pick.pair.day);
  host.llm.request("ch:" + pick.key + ":" + pick.speaker.id, {
    ...(model ? { model } : {}),
    systemPrompt: chatSystem(pick.speaker, pick.other, relationLine(fsx, pick.speaker.id, pick.other.id)),
    messages: [{ role: "user", content: chatUser(pick.speaker, pick.other, pick.pair.messages, seed) }],
    presetParams: { temperature: 0.9, max_tokens: 220 },
  });
}
