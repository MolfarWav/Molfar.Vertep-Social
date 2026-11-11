/**
 * Social clubs (issue #368, from #367): group chats of three or four characters around an interest. They talk to each other and the
 * user may join and write. Modelled on the chatter plugin (pairs), with a few differences: the user is in the chat, and the Moderator
 * (by rules, no model call) can start a club from characters who share an interest.
 *
 * Off by default (Settings > Community > "Clubs", then a switch per club): one model call per message, on the messenger model (the
 * profile's own wins), so it costs tokens and free models are a risk. At most 3 clubs in all. A club writes at most `clubsPerDay`
 * messages a day (default 12) on its own, a 3 minute gap, only while two members are around by their schedules (online or away).
 * A reply owed to the user (the user wrote last) is not held back by the gap, the cap or the chance: the user asked for it. The
 * character's card is never read; the prompt carries the profile, what each remembers of the others (the Life plugin's list), and
 * what the club said lately.
 *
 * Data: clubs/<id>.json {id, name, interest, by: "user" | "mod", members: [profile ids], on, created, day, today,
 *   messages: [{id, by: profile id | "me", persona?, at, text}] (300), pending, failedAt}; clubs/state.json {lastAuto, removed: {interest: at}}
 *   (the Moderator's: when it last made a club, and the interests of clubs of its making that the user deleted, not proposed again for 14 days).
 *
 * Routes (relative to /v1/apps/social):
 *   GET  /clubs                 {on, max, clubs: [{id, name, interest, by, on, count, last, members: [{id, name, hue, picture}]}]}
 *   GET  /clubs/chat?id=        {club, messages: [{id, by, name, hue, picture, at, text, mine, as?}], multi, pending, failed}
 *   POST /clubs/club {name, interest?, members, on?}        makes a club (3 or 4 existing characters, at most 3 clubs)
 *   POST /clubs/edit {id, name?, interest?, members?, on?}  changes it
 *   POST /clubs/remove {id}     deletes the club and its talk
 *   POST /clubs/send {id, text} the user's message, as the active persona; when members are around the first reply is written now
 *                               (two passes, like the messenger's send), the rest comes from the tick
 *
 * Permissions: routes, fs, llm, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const STATUSES = ["online", "away", "dnd", "na", "off"];
const MAX_CLUBS = 3;
const MIN_MEMBERS = 3;
const MAX_MEMBERS = 4;
const NAME_MAX = 40;
const INTEREST_MAX = 60;
const KEEP = 300;
const CONTEXT = 14;
const CHANCE = 0.12;
const MOD_CHANCE = 0.1;
const FAIL_WAIT_MS = 30 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 3 * 60 * 1000;
const OWED_MS = 3 * 3600 * 1000;
const OWED_MAX = 2;
const AUTO_GAP_MS = 3 * 24 * 3600 * 1000;
const FORGET_MS = 14 * 24 * 3600 * 1000;
const TEXT_MAX = 600;
const USER_TEXT_MAX = 1200;
const STATE = "clubs/state.json";
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
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
const around = (p, now, tz) => ["online", "away"].includes(statusAt(p.schedule, new Date(now), tz));

// ---------- settings, profiles and the persona ----------

export function readSettings(fsx) {
  const r = readJson(fsx, "settings.json", null);
  const raw = isObj(r) ? r : {};
  const c = isObj(raw.community) ? raw.community : {};
  const m = isObj(raw.models) ? raw.models : {};
  const n = c.clubsPerDay;
  return {
    on: c.clubs === true,
    mod: c.clubsMod !== false,
    perDay: Number.isFinite(n) ? Math.min(40, Math.max(1, Math.floor(n))) : 12,
    model: modelRef(m.messenger),
    tz: typeof raw.tzOffset === "number" && Number.isFinite(raw.tzOffset) && Math.abs(raw.tzOffset) <= 840 ? raw.tzOffset : null,
  };
}

function readProfile(fsx, id) {
  if (!ID.test(String(id))) return null;
  const p = readJson(fsx, "profiles/" + id + ".json", null);
  if (!isObj(p) || !str(p.name) || p.source === "persona") return null;
  const f = isObj(p.forum) && Number.isFinite(p.forum.frequency) ? p.forum.frequency : 35;
  return {
    id: String(id),
    name: str(p.name),
    hue: Number.isFinite(p.hue) ? p.hue : 200,
    about: str(p.about),
    interests: (Array.isArray(p.interests) ? p.interests : []).filter((x) => typeof x === "string" && str(x)).map((x) => str(x)),
    voice: isObj(p.voice) ? p.voice : {},
    picture: typeof p.picture === "string" && ASSET.test(p.picture) ? p.picture : "",
    schedule: p.schedule,
    model: modelRef(p.model),
    freq: Math.min(100, Math.max(0, f)),
  };
}

function profileIds(fsx) {
  try {
    return fsx.list("profiles").map((n) => /^([A-Za-z0-9_-]{1,60})\.json$/.exec(n)).filter(Boolean).map((m) => m[1]);
  } catch {
    return [];
  }
}

const who = (p) => ({ id: p.id, name: p.name, hue: p.hue, picture: p.picture });

/** The id of the active persona (else the first), "" when there is none. A copy of the messenger's. */
export function activePersonaId(fsx) {
  const y = readJson(fsx, "you.json", null);
  const list = (isObj(y) && Array.isArray(y.personas) ? y.personas : []).filter((x) => isObj(x) && typeof x.id === "string" && ID.test(x.id) && str(x.name));
  const p = list.find((x) => isObj(y) && x.id === y.active) || list[0];
  return p ? p.id : "";
}

/** The persona `pid` (or the active one) as {id, name}, null when there is none. */
function personaOf(fsx, pid) {
  const y = readJson(fsx, "you.json", null);
  const list = (isObj(y) && Array.isArray(y.personas) ? y.personas : []).filter((x) => isObj(x) && typeof x.id === "string" && ID.test(x.id) && str(x.name));
  const p = (pid && list.find((x) => x.id === pid)) || list.find((x) => isObj(y) && x.id === y.active) || list[0];
  return p ? { id: p.id, name: cut(str(p.name), 80) } : null;
}
const personaCount = (fsx) => {
  const y = readJson(fsx, "you.json", null);
  return (isObj(y) && Array.isArray(y.personas) ? y.personas : []).filter((x) => isObj(x) && typeof x.id === "string" && ID.test(x.id) && str(x.name)).length;
};

// ---------- the club files ----------

const clubPath = (id) => "clubs/" + id + ".json";

function clubIds(fsx) {
  try {
    return fsx
      .list("clubs")
      .map((n) => /^(.+)\.json$/.exec(n))
      .filter(Boolean)
      .map((m) => m[1])
      .filter((k) => ID.test(k) && k !== "state");
  } catch {
    return [];
  }
}

/**
 * A club as stored, with the members that no longer exist dropped; under three members it is switched off (`dirty`: the file should be
 * written again, see `saveIfDirty`). `today` is today's count of messages the members wrote.
 */
export function readClub(fsx, id, now, tz) {
  if (!ID.test(String(id)) || id === "state") return null;
  const d = readJson(fsx, clubPath(id), null);
  if (!isObj(d)) return null;
  const day = localDay(now, tz);
  const stored = [...new Set((Array.isArray(d.members) ? d.members : []).filter((x) => typeof x === "string" && ID.test(x)))].slice(0, MAX_MEMBERS);
  const members = stored.filter((x) => readProfile(fsx, x));
  const enough = members.length >= MIN_MEMBERS;
  const dirty = members.length !== stored.length || (d.on === true && !enough);
  return {
    id: String(id),
    name: cut(str(d.name), NAME_MAX) || "Club",
    interest: cut(str(d.interest), INTEREST_MAX),
    by: d.by === "mod" ? "mod" : "user",
    members,
    on: d.on === true && enough,
    created: num(d.created),
    day,
    today: d.day === day ? Math.max(0, Math.floor(num(d.today))) : 0,
    messages: (Array.isArray(d.messages) ? d.messages : [])
      .filter((x) => isObj(x) && typeof x.id === "string" && ID.test(x.id) && typeof x.by === "string" && (x.by === "me" || ID.test(x.by)) && typeof x.text === "string" && str(x.text) && Number.isFinite(x.at))
      .map((x) => ({ id: x.id, by: x.by, ...(x.by === "me" && typeof x.persona === "string" && ID.test(x.persona) ? { persona: x.persona } : {}), at: x.at, text: cut(noControls(x.text).trim(), x.by === "me" ? USER_TEXT_MAX : TEXT_MAX) }))
      .slice(-KEEP),
    pending: num(d.pending),
    failedAt: num(d.failedAt),
    dirty,
  };
}

function writeClub(fsx, c) {
  fsx.write(clubPath(c.id), JSON.stringify({ id: c.id, name: c.name, interest: c.interest, by: c.by, members: c.members, on: c.on, created: c.created, day: c.day, today: c.today, messages: c.messages.slice(-KEEP), pending: c.pending, failedAt: c.failedAt }));
}

/** Reads a club and, when its members changed (a character was deleted), writes the cleaned file back. */
function loadClub(fsx, id, now, tz) {
  const c = readClub(fsx, id, now, tz);
  if (c && c.dirty) {
    writeClub(fsx, c);
    c.dirty = false;
  }
  return c;
}

function readState(fsx, now) {
  const d = readJson(fsx, STATE, null);
  const removed = {};
  if (isObj(d) && isObj(d.removed)) for (const [k, v] of Object.entries(d.removed)) if (Number.isFinite(v) && now - v < FORGET_MS && typeof k === "string" && k) removed[k] = v;
  return { lastAuto: isObj(d) ? num(d.lastAuto) : 0, removed };
}
const writeState = (fsx, s) => fsx.write(STATE, JSON.stringify({ lastAuto: s.lastAuto, removed: s.removed }));

// <relation-shared>
// What the user set between two people: a level of familiarity and ties (the Life plugin writes them, "levels, ties and milestones" there).
// Read only here: a few lines for the prompt. Romance is told only when the profile and the other character are marked adult (the user's
// persona counts as the user's own choice), and between characters the prompt states the ceiling of the level in Settings > Community (`tone`:
// none = no romance told between characters, warm = affection only, flirty = hints and teasing; never anything explicit). A copy lives in each plugin that needs it.
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
const ROMANCE_CEILING = {
  warm: "Keep anything romantic between you gentle: affection and warmth are fine, no flirting and no innuendo, nothing suggestive and never anything explicit.",
  flirty: "Keep anything romantic between you light: warmth, hints and teasing are fine, never anything explicit.",
};

/** The tone between characters the user chose (Settings > Community): "none", "warm" (the default) or "flirty". */
export function communityLevel(fsx) {
  const s = readJson(fsx, "settings.json", null);
  const c = isObj(s) && isObj(s.community) ? s.community : {};
  return c.tone === "none" || c.tone === "flirty" ? c.tone : "warm";
}

/** The lines for one person of the character `p`'s list (`x`, key "c:<profile>" or "u:<persona>"): the level, the ties, and a romantic tie when it is allowed. */
export function relationBits(fsx, p, key, x) {
  const bits = [];
  const name = cut(str(x.name), 80) || "They";
  if (typeof x.lvl === "string" && LEVEL_LINE[x.lvl]) bits.push(LEVEL_LINE[x.lvl]);
  const mine = readJson(fsx, "profiles/" + p.id + ".json", null);
  const theirs = key.startsWith("c:") ? readJson(fsx, "profiles/" + key.slice(2) + ".json", null) : null;
  // the level only limits what characters write to each other; toward the user's persona the profile's own rules stand
  const level = key.startsWith("c:") ? communityLevel(fsx) : "flirty";
  const may = level !== "none" && isObj(mine) && mine.adult === true && (key.startsWith("u:") || (isObj(theirs) && theirs.adult === true));
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
  if (romance && key.startsWith("c:")) bits.push(ROMANCE_CEILING[level]);
  return bits;
}
// </relation-shared>

// <ceiling-shared>
// Between characters the app asks for nothing explicit (Settings > Community, #366). A post that is plainly explicit is not filed: a check by
// word stems in English and Ukrainian, like the OOC and sticker markers. The prompt line is the hint, this is the net; it does not catch
// innuendo and a weak model may slip past it. The sandbox has no Unicode property escapes, so the Cyrillic stems carry no word boundary.
const EXPLICIT_EN = /\b(blowjob|handjob|orgasm|masturbat\w*|cumshot|cum|cumming|clit|(?:had|having|have) sex|(?:fucking|fucked) (?:me|you|her|him|them)|penetrat\w* (?:her|him|me|you|them))\b/i;
const EXPLICIT_UK = /(мінет|оргазм|орґазм|мастурб|сперм|статев[^\s]* акт|займа[^\s]* сексом|трахн|трахал|їбат|їбал|єбат|єбал)/i;
export const overCeiling = (text) => EXPLICIT_EN.test(String(text)) || EXPLICIT_UK.test(String(text));
// </ceiling-shared>

// ---------- the prompt ----------

/** What `speaker` remembers of `other` (the Life plugin's list, life/people/<speaker>.json): their impression, and how it stands between them. A copy of the chatter's. */
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

/**
 * Jealousy toward the member `b` that `a` is answering (#367): `a` has an allowed romantic tie to someone (not `b`) and `b` has been getting close to them
 * (a romantic tie of its own, or a friend or closer that it feels warm toward). A line for `a`'s prompt, or "". Both must be adult, the tone not "none";
 * the ceiling of the level is stated. A rival tie is already told by `relationBits`. A copy of the chatter's.
 */
export function jealousChatLine(fsx, a, b) {
  const level = communityLevel(fsx);
  if (level === "none") return "";
  const profile = (id) => readJson(fsx, "profiles/" + id + ".json", null);
  const list = (id) => {
    const d = readJson(fsx, "life/people/" + id + ".json", null);
    return isObj(d) && Array.isArray(d.people) ? d.people.filter(isObj) : [];
  };
  const pa = profile(a);
  const pb = profile(b);
  if (!isObj(pa) || pa.adult !== true || !isObj(pb)) return "";
  const romantic = (x) => (Array.isArray(x.ties) ? x.ties : []).some((t) => isObj(t) && ["crush", "dating", "partner"].includes(t.type));
  const mineB = list(b);
  for (const x of list(a)) {
    if (typeof x.key !== "string" || !x.key.startsWith("c:") || !romantic(x)) continue;
    const id = x.key.slice(2);
    const loved = profile(id);
    if (id === a || id === b || !isObj(loved) || loved.adult !== true) continue;
    const theirs = mineB.find((y) => y.key === "c:" + id);
    if (!theirs) continue;
    const feel = typeof theirs.feel === "number" && Number.isFinite(theirs.feel) ? theirs.feel : 0;
    const close = (pb.adult === true && romantic(theirs)) || (["friend", "close", "confidant"].includes(theirs.lvl) && feel >= 3);
    if (!close) continue;
    const name = cut(str(loved.name) || str(x.name), 80);
    return "You are a little jealous: " + str(pb.name) + " has been getting close to " + name + ", whom you care about. Let it show a little, in your own way: a cooler tone or a dry remark, never cruel. " + ROMANCE_CEILING[level === "flirty" ? "flirty" : "warm"];
  }
  return "";
}

// Real Unicode emoji only: the app draws them with its own emoji font. Same words as the messenger's.
const EMOJI_WORDS = [
  "Never use emoji.",
  "Use an emoji now and then (in about one message of three), as the character would, written as the emoji character itself.",
  "Use emoji often, one to three in most messages, as the character would, written as the emoji characters themselves, never as :codes:.",
];
const OOC_HINT = "A message in double parentheses, like ((this)), or one that starts with OOC, is the person speaking as themselves, out of character: answer it briefly and plainly as yourself, then carry on as before.";
const CEILING_LINE = {
  none: "Keep this chat friendly: nothing romantic between the members.",
  warm: ROMANCE_CEILING.warm,
  flirty: ROMANCE_CEILING.flirty,
};

/**
 * The system prompt of one member's message. `others` is [{name, relation}] (what `me` remembers of each other member, "" when nothing),
 * `userName` the persona that wrote lately ("" when nobody did), `jealous` the jealousy line toward the member being answered, `level` the tone.
 * The character's card is not in it: only the profile.
 */
export function clubSystem(me, club, others, opts) {
  const o = isObj(opts) ? opts : {};
  const names = others.map((x) => x.name).join(", ");
  const lines = ["You are " + me.name + ", a character, in a group chat called \"" + cut(club.name, NAME_MAX) + "\"" + (club.interest ? " about " + cut(club.interest, INTEREST_MAX) : "") + ". The other members are " + names + ". Stay in your own voice."];
  if (me.about) lines.push("Who you are: " + cut(me.about, 800));
  if (me.interests && me.interests.length) lines.push("Your interests: " + me.interests.slice(0, 6).join(", ") + ".");
  if (str(me.voice.text)) lines.push("How you write: " + cut(str(me.voice.text), 400));
  for (const x of others) if (x.relation) lines.push("About " + x.name + ": " + x.relation);
  if (o.jealous) lines.push(o.jealous);
  if (o.userName) lines.push(o.userName + " is a real person who has joined the club and writes here too: treat them as one of the group and answer them when they write to you.");
  lines.push(CEILING_LINE[o.level === "none" || o.level === "flirty" ? o.level : "warm"]);
  const emoji = [0, 1, 2].includes(me.voice.emoji) ? me.voice.emoji : 1;
  lines.push(EMOJI_WORDS[emoji]);
  if (Array.isArray(me.voice.never) && me.voice.never.length) lines.push("Never write: " + me.voice.never.slice(0, 12).join(", ") + ".");
  lines.push("Write one short message in your voice for the club chat: one to three sentences, plain text, no name label, no stage directions. Stay near the interest, but talk like people do: react to what was just said, ask, joke, disagree. Do not repeat what was said. Write in the language of the chat so far; when there is none, in the language of your description above. Do not invent big events.");
  if (o.userName) lines.push(OOC_HINT);
  return lines.join("\n");
}

/** The user's turn: the club's last messages with the speakers' names, then what to write. `nameOf(m)` gives the name shown for a message. */
export function clubUser(club, messages, nameOf, userName, asked) {
  if (!messages.length) return "Open the chat of the club with a short first message" + (club.interest ? " about " + cut(club.interest, INTEREST_MAX) : "") + ".";
  const lines = messages.slice(-CONTEXT).map((m) => nameOf(m) + ": " + cut(m.text, 300));
  const last = messages[messages.length - 1];
  return "The club chat so far:\n" + lines.join("\n") + "\n\nWrite your next message" + (last.by === "me" && userName ? ", answering " + userName : asked ? ", answering " + asked : "") + ".";
}

/** Builds the request for `speaker` in `club` from what is stored: {model?, systemPrompt, messages, presetParams}. */
export function buildRequest(fsx, settings, club, speaker) {
  const profiles = new Map();
  for (const id of club.members) {
    const p = readProfile(fsx, id);
    if (p) profiles.set(id, p);
  }
  const others = club.members.filter((id) => id !== speaker.id && profiles.has(id)).map((id) => ({ id, name: profiles.get(id).name, relation: relationLine(fsx, speaker.id, id) }));
  const userMsgs = club.messages.slice(-CONTEXT).filter((m) => m.by === "me");
  const lastUser = userMsgs[userMsgs.length - 1];
  const userName = lastUser ? (personaOf(fsx, lastUser.persona) || { name: "The user" }).name : "";
  const nameOf = (m) => (m.by === "me" ? (personaOf(fsx, m.persona) || { name: "The user" }).name : profiles.has(m.by) ? profiles.get(m.by).name : (readProfile(fsx, m.by) || { name: "Someone" }).name);
  const last = club.messages[club.messages.length - 1];
  const answered = last && last.by !== "me" && last.by !== speaker.id ? last.by : "";
  const jealous = answered ? jealousChatLine(fsx, speaker.id, answered) : "";
  const asked = answered && profiles.has(answered) ? profiles.get(answered).name : "";
  const model = speaker.model || settings.model;
  return {
    ...(model ? { model } : {}),
    systemPrompt: clubSystem(speaker, club, others, { userName, jealous, level: communityLevel(fsx) }),
    messages: [{ role: "user", content: clubUser(club, club.messages, nameOf, userName, asked) }],
    presetParams: { temperature: 0.9, max_tokens: 220 },
  };
}

// ---------- choosing ----------

function weightedPick(items, weight, rand) {
  const total = items.reduce((n, x) => n + Math.max(0, weight(x)), 0);
  let r = rand() * total;
  for (const x of items) {
    r -= Math.max(0, weight(x));
    if (r < 0) return x;
  }
  return items[items.length - 1];
}
const weightOf = (p) => 5 + p.freq;

/** How many members wrote since the user's last message, and that message (null when the user has not written, or not lately enough to be owed). */
export function owedState(club, now) {
  let at = -1;
  for (let i = club.messages.length - 1; i >= 0; i--) {
    if (club.messages[i].by === "me") {
      at = i;
      break;
    }
  }
  if (at < 0) return null;
  const m = club.messages[at];
  if (now - m.at >= OWED_MS) return null;
  const answered = club.messages.length - 1 - at;
  return answered < OWED_MAX ? { message: m, answered } : null;
}

/**
 * Who writes next, or null. A reply owed to the user comes first and ignores the gap, the cap and the chance; otherwise a club on, under
 * its cap, not asked or failed lately, with the gap kept and at least two members around, writes with the chance `CHANCE` a tick.
 * Returns {club, speaker, owed}; `speaker` is a profile (see `readProfile`) that is around and is not the last speaker.
 */
export function pickTurn(fsx, settings, now, rand) {
  if (!settings.on) return null;
  const owed = [];
  const idle = [];
  for (const id of clubIds(fsx)) {
    const c = loadClub(fsx, id, now, settings.tz);
    if (!c || !c.on) continue;
    if (now - c.failedAt < FAIL_WAIT_MS || now - c.pending < PENDING_MS) continue;
    const members = c.members.map((x) => readProfile(fsx, x)).filter(Boolean);
    const here = members.filter((p) => around(p, now, settings.tz));
    const last = c.messages[c.messages.length - 1];
    const pool = here.filter((p) => !last || p.id !== last.by);
    if (!pool.length) continue;
    if (owedState(c, now)) {
      owed.push({ club: c, speaker: weightedPick(pool, weightOf, rand), owed: true });
      continue;
    }
    if (c.today >= settings.perDay || here.length < 2) continue;
    if (last && now - last.at < MIN_GAP_MS) continue;
    idle.push({ club: c, speaker: weightedPick(pool, weightOf, rand), owed: false });
  }
  if (owed.length) return owed[Math.floor(rand() * owed.length)];
  if (idle.length && rand() < CHANCE) return idle[Math.floor(rand() * idle.length)];
  return null;
}

/** Files the model's message ("cl:<club>:<speaker>"). Returns {message} or {error}. */
export function fileClubResult(fsx, key, result, now, tz) {
  const m = /^cl:([A-Za-z0-9_-]{1,60}):([A-Za-z0-9_-]{1,60})$/.exec(String(key));
  if (!m) return { error: "bad key" };
  const club = readClub(fsx, m[1], now, tz);
  if (!club) return { error: "no such club" };
  club.pending = 0;
  const fail = (error) => {
    club.failedAt = now;
    writeClub(fsx, club);
    return { error };
  };
  if (!club.members.includes(m[2])) return fail("bad speaker");
  const r = isObj(result) ? result : {};
  if (r.error || !str(r.text)) return fail(r.error || "the model returned nothing");
  const me = readProfile(fsx, m[2]);
  let text = noControls(String(r.text).replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").replace(/<[^>]*>/g, " ")).replace(/[ \t]{2,}/g, " ").trim();
  if (me) text = text.replace(new RegExp("^\\s*" + escRe(me.name) + "\\s*[:\\-—]\\s*", "i"), "");
  text = cut(text, TEXT_MAX).trim();
  if (!text) return fail("the model returned nothing");
  // between characters nothing explicit is filed (#367)
  if (overCeiling(text)) return fail("the message went past the ceiling between characters and was not filed");
  if (!club.on) {
    writeClub(fsx, club);
    return { error: "the club was switched off" };
  }
  const message = { id: "m-" + now + "-" + rid(), by: m[2], at: now, text };
  club.messages.push(message);
  club.today += 1;
  club.failedAt = 0;
  writeClub(fsx, club);
  return { message };
}

// ---------- the Moderator starts a club ----------

const STOP = new Set([
  "with", "from", "that", "this", "they", "them", "about", "into", "over", "like", "love", "many", "make", "some", "such", "very", "what", "when", "your", "also", "more", "most", "other",
  "який", "яка", "яке", "які", "коли", "щоб", "дуже", "його", "між", "після", "перед", "через", "тому", "також", "понад", "тільки", "більше", "завжди",
]);
const WORD_SPLIT = /[\s.,!?;:'"«»“”()[\]{}<>…—–\-_/\\|]+/;
const norm = (s) => String(s).toLowerCase().split(WORD_SPLIT).filter(Boolean).join(" ");
const wordsOf = (s) => String(s).toLowerCase().split(WORD_SPLIT).filter((w) => w.length >= 4 && !STOP.has(w));
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const CYRILLIC = /[Ѐ-ӿ]/;
const LEVEL_ORDER = ["stranger", "slight", "acquaintance", "penfriend", "friend", "close", "confidant"];

/** The name of a club the Moderator makes: "<Interest> club", or «Клуб «interest»» when the interest is in Cyrillic. At most 40 characters. */
export function autoName(label) {
  const l = str(label);
  if (CYRILLIC.test(l)) return "Клуб «" + cut(capFirst(l), NAME_MAX - 8) + "»";
  return cut(capFirst(l), NAME_MAX - 5) + " club";
}

/** The interests (a whole phrase, or a whole word of four letters or more) held by at least three of the profiles: Map key -> {label, ids}. */
export function interestGroups(profiles) {
  const map = new Map();
  const add = (key, label, id) => {
    if (!key) return;
    const g = map.get(key) || { label, ids: new Set() };
    g.ids.add(id);
    map.set(key, g);
  };
  for (const p of profiles) {
    for (const raw of p.interests.slice(0, 12)) {
      const phrase = norm(raw);
      if (phrase.length >= 4 && !STOP.has(phrase)) add(phrase, str(raw), p.id);
      for (const w of wordsOf(raw)) add(w, w, p.id);
    }
  }
  const groups = [...map.entries()].filter(([, g]) => g.ids.size >= MIN_MEMBERS);
  // a word held by the same people as a phrase that contains it is the phrase's: the phrase is the more exact name
  return groups.filter(([k, g]) => !groups.some(([k2, g2]) => k2 !== k && k2.includes(" ") && !k.includes(" ") && k2.split(" ").includes(k) && g2.ids.size === g.ids.size));
}

/** Up to four of the ids, those who know each other best (the Life lists: a level of acquaintance or more, or a meeting), ties broken by `rand`. */
function closest(fsx, ids, rand) {
  if (ids.length <= MAX_MEMBERS) return ids;
  const score = (id) => {
    const d = readJson(fsx, "life/people/" + id + ".json", null);
    const list = isObj(d) && Array.isArray(d.people) ? d.people : [];
    return ids.filter((o) => o !== id).filter((o) => {
      const x = list.find((q) => isObj(q) && q.key === "c:" + o);
      return !!x && (LEVEL_ORDER.indexOf(x.lvl) >= 2 || num(x.seen) > 0);
    }).length;
  };
  return ids
    .map((id) => ({ id, s: score(id) + rand() * 0.5 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_MEMBERS)
    .map((x) => x.id);
}

/**
 * The Moderator's club, by rules and no model call: with the switches on, fewer than three clubs, none made by it in the last three days, and
 * three or more characters sharing an interest that no club has and that was not forgotten (a club of its making the user deleted: 14 days).
 * Makes the club (on) and returns it, else null.
 */
export function modClub(fsx, settings, now, rand) {
  if (!settings.on || !settings.mod) return null;
  const ids = clubIds(fsx);
  if (ids.length >= MAX_CLUBS) return null;
  const state = readState(fsx, now);
  if (state.lastAuto && now - state.lastAuto < AUTO_GAP_MS) return null;
  const profiles = profileIds(fsx).map((id) => readProfile(fsx, id)).filter(Boolean);
  if (profiles.length < MIN_MEMBERS) return null;
  const clubs = ids.map((id) => readClub(fsx, id, now, settings.tz)).filter(Boolean);
  const taken = (key) => clubs.some((c) => norm(c.interest) === key || wordsOf(c.interest).includes(key)) || Object.prototype.hasOwnProperty.call(state.removed, key);
  const groups = interestGroups(profiles).filter(([key]) => !taken(key));
  if (!groups.length) return null;
  const g = groups[Math.floor(rand() * groups.length)][1];
  const members = closest(fsx, [...g.ids], rand);
  const club = { id: "cl-" + now.toString(36) + "-" + rid(), name: autoName(g.label), interest: cut(g.label, INTEREST_MAX), by: "mod", members, on: true, created: now, day: localDay(now, settings.tz), today: 0, messages: [], pending: 0, failedAt: 0 };
  writeClub(fsx, club);
  writeState(fsx, { lastAuto: now, removed: state.removed });
  return club;
}

// ---------- routes ----------

function view(fsx, c) {
  const last = c.messages[c.messages.length - 1];
  const lastWho = last ? (last.by === "me" ? null : readProfile(fsx, last.by)) : null;
  const members = c.members.map((id) => readProfile(fsx, id)).filter(Boolean).map(who);
  return {
    id: c.id,
    name: c.name,
    interest: c.interest,
    by: c.by,
    on: c.on,
    count: c.messages.length,
    last: last ? { by: last.by, name: last.by === "me" ? ((personaOf(fsx, last.persona) || {}).name || "") : lastWho ? lastWho.name : "", at: last.at, text: cut(last.text.replace(/\s+/g, " "), 120) } : null,
    members,
  };
}

function chatView(fsx, c, now) {
  const multi = personaCount(fsx) > 1;
  const cache = new Map();
  const person = (id) => {
    if (!cache.has(id)) cache.set(id, readProfile(fsx, id));
    return cache.get(id);
  };
  const messages = [];
  for (const m of c.messages) {
    if (m.by === "me") {
      const pe = personaOf(fsx, m.persona);
      messages.push({ id: m.id, by: "me", name: pe ? pe.name : "", hue: 210, picture: "", at: m.at, text: m.text, mine: true, ...(multi && pe && m.persona ? { as: pe.name } : {}) });
      continue;
    }
    const p = person(m.by);
    if (!p) continue;
    messages.push({ id: m.id, by: m.by, name: p.name, hue: p.hue, picture: p.picture, at: m.at, text: m.text, mine: false });
  }
  return { club: view(fsx, c), messages, multi, pending: now - c.pending < PENDING_MS && c.pending > 0, failed: now - c.failedAt < FAIL_WAIT_MS && c.failedAt > 0 };
}

const cleanMembers = (fsx, raw) => {
  const list = Array.isArray(raw) ? [...new Set(raw.filter((x) => typeof x === "string" && ID.test(x)))] : [];
  return list.length >= MIN_MEMBERS && list.length <= MAX_MEMBERS && list.length === (Array.isArray(raw) ? raw.length : -1) && list.every((x) => readProfile(fsx, x)) ? list : null;
};

function sendRoute(req, host, settings, now) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const id = String(b.id || "");
  const stash = isObj(req.stash) ? req.stash : null;
  const club = readClub(fsx, id, now, settings.tz);
  if (!club) return ok({ error: "no such club" }, 404);
  if (stash) {
    // second pass: the model has answered the first reply
    const res = fileClubResult(fsx, "cl:" + id + ":" + String(stash.speaker || ""), host.llm && host.llm.results ? host.llm.results.reply : null, now, settings.tz);
    const after = readClub(fsx, id, now, settings.tz) || club;
    return ok({ ok: !res.error, ...(res.error ? { error: res.error } : {}), chat: chatView(fsx, after, now) });
  }
  const text = cut(noControls(String(typeof b.text === "string" ? b.text : "")).trim(), USER_TEXT_MAX);
  if (!text) return ok({ error: "a message needs text" }, 400);
  club.messages.push({ id: "u-" + now + "-" + rid(), by: "me", ...(activePersonaId(fsx) ? { persona: activePersonaId(fsx) } : {}), at: now, text });
  // the user is trying again: an old failure no longer holds the club back
  club.failedAt = 0;
  const members = club.members.map((x) => readProfile(fsx, x)).filter(Boolean);
  const here = members.filter((p) => around(p, now, settings.tz));
  if (!settings.on || !club.on || !here.length || (club.pending && now - club.pending < PENDING_MS) || !host.llm) {
    writeClub(fsx, club);
    return ok({ ok: true, queued: true, chat: chatView(fsx, club, now) });
  }
  const speaker = weightedPick(here, weightOf, Math.random);
  club.pending = now;
  writeClub(fsx, club);
  host.llm.request("reply", buildRequest(fsx, settings, club, speaker));
  return { __llmPending: true, stash: { sent: true, speaker: speaker.id } };
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/clubs" && !path.startsWith("/clubs/")) return null;
  const fsx = host.fs;
  const now = Date.now();
  const settings = readSettings(fsx);
  const b = isObj(req.body) ? req.body : {};
  const q = isObj(req.query) ? req.query : {};
  if (path === "/clubs" && req.method === "GET") {
    const clubs = clubIds(fsx).map((k) => loadClub(fsx, k, now, settings.tz)).filter(Boolean).map((c) => view(fsx, c)).sort((x, y) => (y.last ? y.last.at : 0) - (x.last ? x.last.at : 0) || x.name.localeCompare(y.name));
    return ok({ on: settings.on, max: MAX_CLUBS, clubs });
  }
  if (path === "/clubs/chat" && req.method === "GET") {
    const c = loadClub(fsx, String(q.id || ""), now, settings.tz);
    if (!c) return ok({ error: "no such club" }, 404);
    return ok(chatView(fsx, c, now));
  }
  if (path === "/clubs/club" && req.method === "POST") {
    const name = cut(noControls(str(b.name)).trim(), NAME_MAX);
    if (!name) return ok({ error: "a club needs a name" }, 400);
    const members = cleanMembers(fsx, b.members);
    if (!members) return ok({ error: "pick three or four different characters" }, 400);
    if (clubIds(fsx).length >= MAX_CLUBS) return ok({ error: "the most clubs at once is " + MAX_CLUBS }, 409);
    const club = { id: "cl-" + now.toString(36) + "-" + rid(), name, interest: cut(noControls(str(b.interest)).trim(), INTEREST_MAX), by: "user", members, on: b.on !== false, created: now, day: localDay(now, settings.tz), today: 0, messages: [], pending: 0, failedAt: 0 };
    writeClub(fsx, club);
    return ok({ ok: true, club: view(fsx, club) });
  }
  if (path === "/clubs/edit" && req.method === "POST") {
    const club = loadClub(fsx, String(b.id || ""), now, settings.tz);
    if (!club) return ok({ error: "no such club" }, 404);
    if ("name" in b) {
      const name = cut(noControls(str(b.name)).trim(), NAME_MAX);
      if (!name) return ok({ error: "a club needs a name" }, 400);
      club.name = name;
    }
    if ("interest" in b) club.interest = cut(noControls(str(b.interest)).trim(), INTEREST_MAX);
    if ("members" in b) {
      const members = cleanMembers(fsx, b.members);
      if (!members) return ok({ error: "pick three or four different characters" }, 400);
      club.members = members;
    }
    if ("on" in b) club.on = b.on === true && club.members.length >= MIN_MEMBERS;
    writeClub(fsx, club);
    return ok({ ok: true, club: view(fsx, club) });
  }
  if (path === "/clubs/remove" && req.method === "POST") {
    const id = String(b.id || "");
    if (!ID.test(id) || id === "state") return ok({ error: "no such club" }, 404);
    const club = readClub(fsx, id, now, settings.tz);
    if (!club) return ok({ error: "no such club" }, 404);
    // a club the Moderator made is not proposed again for a while
    if (club.by === "mod" && club.interest) {
      const st = readState(fsx, now);
      st.removed[norm(club.interest)] = now;
      writeState(fsx, st);
    }
    try {
      fsx.remove(clubPath(id));
    } catch {
      // nothing to remove
    }
    return ok({ ok: true });
  }
  if (path === "/clubs/send" && req.method === "POST") return sendRoute(req, host, settings, now);
  return ok({ error: "not found" }, 404);
}

// ---------- onTick ----------

export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !host.llm) return;
  const now = Date.now();
  const settings = readSettings(fsx);
  const results = host.llm.results || {};
  const keys = Object.keys(results).filter((k) => k.startsWith("cl:"));
  if (keys.length) {
    for (const k of keys) fileClubResult(fsx, k, results[k], now, settings.tz);
    return;
  }
  if (!settings.on) return;
  // the Moderator may start a club (rules only, now and then)
  if (settings.mod && Math.random() < MOD_CHANCE && modClub(fsx, settings, now, Math.random)) return;
  const pick = pickTurn(fsx, settings, now, Math.random);
  if (!pick) return;
  pick.club.pending = now;
  writeClub(fsx, pick.club);
  host.llm.request("cl:" + pick.club.id + ":" + pick.speaker.id, buildRequest(fsx, settings, pick.club, pick.speaker));
}
