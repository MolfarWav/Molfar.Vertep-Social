/**
 * Social forum: boards, topics and posts, and characters who write on their own.
 *
 * Data (the app's data folder):
 *   forum/boards.json          {categories: [{id, name, boards: [{id, name, desc}]}]}
 *   forum/topics/<id>.json     {id, board, title, by, name, hue, createdAt, lastAt, locked, unread, owe, posts: [...]}
 *   forum/log.json             {day, posts, byAuthor, lastAutoAt, nextAt, lastAuthor, recent, error}
 * A post is {id, by ("me" or a profile id), name, hue, at (ms), text, quote?: {by, name, text}}. The name and
 * the hue are copied into the post, so a deleted profile's posts still read. Profiles come from
 * profiles/<id>.json (the profiles plugin); a Roleplay card is never read here.
 *
 * Routes (relative to /v1/apps/social):
 *   GET  /forum/home                  boards with counts, the autonomy strip, who is online, statistics
 *   GET  /forum/board?id=             the board's topics, ordered by the last post (a new post bumps a topic to the top)
 *   GET  /forum/topic?id=&page=       one page of the topic (PAGE_SIZE posts) with the authors' facts of that page;
 *          page is a number or "last"; the answer says which page it is, how many there are and the number of the first post
 *   GET  /forum/search?q=             topics whose title or posts hold every word of q (at most SEARCH_MAX, titles first):
 *          the first matching post, a snippet around the match and the page that post is on
 *   GET  /forum/unread                {unread}: the number of topics with posts the user has not seen (the tab badge)
 *   POST /forum/boards {categories}   adds categories and boards (merged by name)
 *   POST /forum/topic {board, title, text}    the user opens a topic
 *   POST /forum/reply {topic, text, quoteOf?} the user replies
 *   POST /forum/read {topic}          clears the topic's unread mark
 *   POST /forum/lock {topic, locked}  the user closes (locked: true) or reopens a topic; a closed topic takes no
 *          new posts (the user's or the characters'), keeps its place by its last post and shows a lock
 *   POST /forum/force {board?, topic?, count?}  "Write now": characters write at once (1 to 3 posts), ignoring the
 *          daily limit, the quiet hours, the schedule and the gaps; the posts still count toward the day
 *
 * Autonomy (`onTick`, every minute while the engine runs): one tick is at most one post. A post waits for the
 * slot `nextAt` (the average gap, jittered), and never breaks the safety net: a hard minimum gap between two
 * autonomous posts, at most CAP_COUNT in any 10 minutes in every activity mode, the daily limit, the limit
 * per author, and the quiet hours. The counters live in forum/log.json, so a restart does not reset them and the
 * engine does not catch up after being off. Only "Write now" ignores the gap, and it still counts toward the day.
 *
 * Permissions: routes, fs, llm, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const SELF = "me";
const STATUSES = ["online", "away", "dnd", "na", "off"];

export const MIN_GAP_MS = 2 * 60 * 1000;
export const CAP_WINDOW_MS = 10 * 60 * 1000;
export const CAP_COUNT = 3;
const FAIL_WAIT_MS = 10 * 60 * 1000;
const ACTIVITY_SCALE = { quiet: 2, moderate: 1, lively: 0.5, chaotic: 0.25 };
const MAX_POSTS_PER_TOPIC = 500;
/** Posts on one page of a topic. */
export const PAGE_SIZE = 25;
const SEARCH_MAX = 50;
const SEARCH_MIN_CHARS = 2;
const SNIPPET_CHARS = 140;
const MAX_TOPICS = 1000;
const CONTEXT_POSTS = 8;
const LIVE_MS = 7 * 24 * 3600 * 1000;
const TEXT_MAX = 4000;
const TITLE_MAX = 120;
const FORCE_MAX = 3;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
const ok = (json, status) => ({ status: status || 200, json });
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const noControls = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 && ch !== "\n" ? " " : ch)).join("");
const oneLine = (v, n) => cut(noControls(String(typeof v === "string" ? v : "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), n);
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

// ---------- time ----------

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

const offsetOf = (now, tz) => (Number.isFinite(tz) ? tz : new Date(now).getTimezoneOffset());
const hm = (t) => {
  const m = /^(\d\d):(\d\d)$/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** Minutes since local midnight. */
export function minutesOfDay(now, tz) {
  const local = new Date(now - offsetOf(now, tz) * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** The user's calendar day as YYYY-MM-DD. */
export function localDay(now, tz) {
  return new Date(now - offsetOf(now, tz) * 60000).toISOString().slice(0, 10);
}

/** Is `now` inside the quiet hours (they may wrap past midnight); equal ends mean no quiet hours. */
export function inQuiet(now, tz, from, to) {
  const f = hm(from);
  const t = hm(to);
  if (f === t) return false;
  const m = minutesOfDay(now, tz);
  return f < t ? m >= f && m < t : m >= f || m < t;
}

/** Minutes of the day that are not quiet hours. */
export function awakeMinutes(from, to) {
  const f = hm(from);
  const t = hm(to);
  if (f === t) return 1440;
  const quiet = f < t ? t - f : 1440 - f + t;
  return Math.max(30, 1440 - quiet);
}

// ---------- settings and the log ----------

const DEFAULTS = {
  autonomous: true,
  activity: "moderate",
  postsPerDay: 30,
  postsPerAuthor: 6,
  newTopicShare: 20,
  quietFrom: "01:00",
  quietTo: "08:00",
  writers: "profile",
};
const clampInt = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** A model reference ("provider/model"), or "" for the engine's default. */
const modelRef = (v) => {
  const m = typeof v === "string" ? v.trim() : "";
  return m && m !== "default" && /^[^\s]{1,200}$/.test(m) ? m : "";
};

/** The settings the forum reads from settings.json (the profiles plugin writes them), with the defaults. */
export function readSettings(fsx) {
  const raw = readJson(fsx, "settings.json", null);
  const r = isObj(raw) ? raw : {};
  const time = (v, d) => (typeof v === "string" && /^([01]\d|2[0-3]):[03]0$/.test(v) ? v : d);
  const model = isObj(r.models) ? str(r.models.forum) : "";
  return {
    autonomous: typeof r.autonomous === "boolean" ? r.autonomous : DEFAULTS.autonomous,
    activity: Object.keys(ACTIVITY_SCALE).includes(r.activity) ? r.activity : DEFAULTS.activity,
    postsPerDay: clampInt(r.postsPerDay, 0, 200, DEFAULTS.postsPerDay),
    postsPerAuthor: clampInt(r.postsPerAuthor, 1, 50, DEFAULTS.postsPerAuthor),
    newTopicShare: clampInt(r.newTopicShare, 0, 100, DEFAULTS.newTopicShare),
    quietFrom: time(r.quietFrom, DEFAULTS.quietFrom),
    quietTo: time(r.quietTo, DEFAULTS.quietTo),
    writers: r.writers === "equal" ? "equal" : "profile",
    tzOffset: typeof r.tzOffset === "number" && Number.isFinite(r.tzOffset) && Math.abs(r.tzOffset) <= 840 ? r.tzOffset : null,
    model: modelRef(model),
  };
}

/** The average gap between two autonomous posts: the waking day divided by the daily limit, scaled by the activity. Never below the hard minimum. */
export function avgGapMs(s) {
  const perDay = Math.max(1, s.postsPerDay);
  return Math.max(MIN_GAP_MS, ((awakeMinutes(s.quietFrom, s.quietTo) * 60000) / perDay) * (ACTIVITY_SCALE[s.activity] || 1));
}

/** The wait until the next autonomous slot: the average gap with jitter (0.5x to 1.5x), never below the hard minimum. */
export function nextGapMs(s, rand) {
  return Math.max(MIN_GAP_MS, Math.round(avgGapMs(s) * (0.5 + rand())));
}

/** The log as of `now`: today's counters (zero on a new day), the slot, the posts of the last 10 minutes, the last error. */
export function readLog(fsx, now, tz) {
  const raw = readJson(fsx, "forum/log.json", null);
  const l = isObj(raw) ? raw : {};
  const day = localDay(now, tz);
  const same = l.day === day;
  const byAuthor = {};
  if (same && isObj(l.byAuthor)) for (const [k, v] of Object.entries(l.byAuthor)) if (ID.test(k) && num(v) > 0) byAuthor[k] = Math.floor(num(v));
  const e = isObj(l.error) ? l.error : null;
  return {
    day,
    posts: same ? Math.max(0, Math.floor(num(l.posts))) : 0,
    byAuthor,
    lastAutoAt: num(l.lastAutoAt),
    nextAt: num(l.nextAt),
    lastAuthor: ID.test(String(l.lastAuthor)) ? String(l.lastAuthor) : "",
    recent: (Array.isArray(l.recent) ? l.recent : []).filter((t) => num(t) > now - CAP_WINDOW_MS && num(t) <= now + 60000),
    error: e ? { at: num(e.at), error: oneLine(e.error, 300), ...(e.code === "no-model" ? { code: "no-model" } : {}) } : null,
  };
}

const writeLog = (fsx, log) => fsx.write("forum/log.json", JSON.stringify(log));

/** Why an autonomous post may not happen now: "off", "limit", "quiet", "gap", "cap", "wait", or "" when it may. */
export function autoBlock(log, s, now, tz) {
  if (!s.autonomous) return "off";
  if (s.postsPerDay <= 0 || log.posts >= s.postsPerDay) return "limit";
  if (inQuiet(now, tz, s.quietFrom, s.quietTo)) return "quiet";
  if (now - log.lastAutoAt < MIN_GAP_MS) return "gap";
  if (log.recent.filter((t) => t > now - CAP_WINDOW_MS).length >= CAP_COUNT) return "cap";
  if (now < log.nextAt) return "wait";
  return "";
}

/** A character's post is on the record. `auto` posts also move the slot; "Write now" posts only count toward the day. */
export function recordPost(log, authorId, now, auto, s, rand) {
  log.posts += 1;
  log.byAuthor[authorId] = (log.byAuthor[authorId] || 0) + 1;
  log.lastAuthor = authorId;
  log.error = null;
  if (auto) {
    log.recent.push(now);
    log.lastAutoAt = now;
    log.nextAt = now + nextGapMs(s, rand);
  }
}

/** A failed call posts nothing; an autonomous one waits a while before the next try (no retry storm). */
function recordFailure(log, fail, now, auto) {
  log.error = { at: now, error: fail.error, ...(fail.code ? { code: fail.code } : {}) };
  if (auto) log.nextAt = now + FAIL_WAIT_MS;
}

/** An engine error as the screen's: "no model" gets its own code. */
export function failure(error) {
  const e = oneLine(String(error || "the model returned nothing"), 300);
  return { error: e, ...(/no model providers|is not available|connection is missing/i.test(e) ? { code: "no-model" } : {}) };
}

// ---------- profiles, boards, topics ----------

const profilePath = (id) => "profiles/" + id + ".json";
const topicPath = (id) => "forum/topics/" + id + ".json";

function names(fsx, dir, ext) {
  let list = [];
  try {
    list = fsx.list(dir);
  } catch {
    return [];
  }
  const re = new RegExp("^([A-Za-z0-9_-]{1,60})\\." + ext + "$");
  return list.map((n) => re.exec(n)).filter(Boolean).map((m) => m[1]);
}

function readProfile(fsx, id) {
  if (!ID.test(String(id))) return null;
  const p = readJson(fsx, profilePath(id), null);
  if (!isObj(p) || !str(p.name) || p.source === "persona") return null; // not a writer: Your profile is the user, not a character
  const f = isObj(p.forum) ? p.forum : {};
  return {
    id: String(id),
    name: str(p.name),
    hue: Number.isFinite(p.hue) ? p.hue : 200,
    about: str(p.about),
    interests: Array.isArray(p.interests) ? p.interests.filter((x) => typeof x === "string") : [],
    habits: Array.isArray(p.habits) ? p.habits : [],
    voice: isObj(p.voice) ? p.voice : {},
    model: modelRef(p.model),
    picture: typeof p.picture === "string" && /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/.test(p.picture) ? p.picture : "",
    schedule: p.schedule,
    createdAt: num(p.createdAt),
    forum: {
      rank: str(f.rank),
      signature: str(f.signature),
      frequency: clampInt(f.frequency, 0, 100, 35),
      opensOwn: f.opensOwn !== false,
      repliesYou: f.repliesYou !== false,
      repliesOthers: f.repliesOthers !== false,
      favourites: (Array.isArray(f.favourites) ? f.favourites : []).filter((x) => isObj(x) && x.on === true).map((x) => str(x.name).toLowerCase()).filter(Boolean),
    },
  };
}

export const loadProfiles = (fsx) => names(fsx, "profiles", "json").map((id) => readProfile(fsx, id)).filter(Boolean);

function cleanPost(p) {
  if (!isObj(p) || typeof p.text !== "string" || !Number.isFinite(p.at)) return null;
  const by = String(p.by);
  if (by !== SELF && !ID.test(by)) return null;
  const q = isObj(p.quote) && str(p.quote.text) ? { by: String(p.quote.by), name: oneLine(p.quote.name, 80), text: cut(String(p.quote.text), 300) } : null;
  return { id: String(p.id), by, name: oneLine(p.name, 80), hue: Number.isFinite(p.hue) ? p.hue : 200, at: p.at, text: p.text, ...(q ? { quote: q } : {}) };
}

export function readTopic(fsx, id) {
  if (!ID.test(String(id))) return null;
  const t = readJson(fsx, topicPath(id), null);
  if (!isObj(t) || !str(t.title)) return null;
  const posts = (Array.isArray(t.posts) ? t.posts : []).map(cleanPost).filter(Boolean);
  if (!posts.length) return null;
  const last = posts[posts.length - 1];
  return {
    id: String(id),
    board: String(t.board),
    title: str(t.title),
    by: String(t.by),
    name: oneLine(t.name, 80),
    hue: Number.isFinite(t.hue) ? t.hue : 200,
    createdAt: num(t.createdAt) || posts[0].at,
    lastAt: num(t.lastAt) || last.at,
    locked: t.locked === true,
    unread: t.unread === true,
    owe: clampInt(t.owe, 0, 3, 0),
    posts,
  };
}

function writeTopic(fsx, t) {
  const posts = t.posts.length > MAX_POSTS_PER_TOPIC ? [t.posts[0], ...t.posts.slice(-(MAX_POSTS_PER_TOPIC - 1))] : t.posts;
  fsx.write(topicPath(t.id), JSON.stringify({ ...t, posts }));
}

export const loadTopics = (fsx) => names(fsx, "forum/topics", "json").map((id) => readTopic(fsx, id)).filter(Boolean);

/** The boards as stored, cleaned. */
export function readBoards(fsx) {
  const raw = readJson(fsx, "forum/boards.json", null);
  const cats = isObj(raw) && Array.isArray(raw.categories) ? raw.categories : [];
  const out = [];
  for (const c of cats) {
    if (!isObj(c) || !ID.test(String(c.id)) || !oneLine(c.name, 60)) continue;
    const boards = (Array.isArray(c.boards) ? c.boards : [])
      .filter((b) => isObj(b) && ID.test(String(b.id)) && oneLine(b.name, 60))
      .map((b) => ({ id: String(b.id), name: oneLine(b.name, 60), desc: oneLine(b.desc, 160) }));
    out.push({ id: String(c.id), name: oneLine(c.name, 60), boards });
  }
  return { categories: out };
}

/** board id -> {board, category} */
function boardMap(boards) {
  const m = new Map();
  for (const c of boards.categories) for (const b of c.boards) m.set(b.id, { board: b, category: c });
  return m;
}

/** Adds categories and boards from a request body, merging by name (case-insensitive). Returns the new boards value. */
export function mergeBoards(current, incoming) {
  const cats = current.categories.map((c) => ({ ...c, boards: [...c.boards] }));
  const list = Array.isArray(incoming) ? incoming.slice(0, 20) : [];
  for (const c of list) {
    if (!isObj(c)) continue;
    const cname = oneLine(c.name, 60);
    if (!cname) continue;
    let cat = cats.find((x) => x.name.toLowerCase() === cname.toLowerCase());
    if (!cat) {
      cat = { id: "c-" + rid(), name: cname, boards: [] };
      cats.push(cat);
    }
    for (const b of (Array.isArray(c.boards) ? c.boards : []).slice(0, 30)) {
      if (!isObj(b)) continue;
      const bname = oneLine(b.name, 60);
      if (!bname || cat.boards.some((x) => x.name.toLowerCase() === bname.toLowerCase())) continue;
      cat.boards.push({ id: "b-" + rid(), name: bname, desc: oneLine(b.desc, 160) });
    }
  }
  return { categories: cats };
}

const countByAuthor = (topics) => {
  const m = {};
  for (const t of topics) for (const p of t.posts) m[p.by] = (m[p.by] || 0) + 1;
  return m;
};

// ---------- the prompt ----------

const LENGTH_WORDS = ["Short: one or two sentences.", "Medium: two to four sentences.", "Long: a short paragraph when the topic asks for it."];
const EMOJI_WORDS = ["Never use emoji.", "Use an emoji only now and then.", "Use emoji often."];
const MAX_TOKENS = [250, 450, 800];

/** The system prompt that makes the model write forum posts as this profile (the card is never in it). */
export function systemPromptFor(p) {
  const v = isObj(p.voice) ? p.voice : {};
  const length = [0, 1, 2].includes(v.length) ? v.length : 1;
  const emoji = [0, 1, 2].includes(v.emoji) ? v.emoji : 0;
  const formality = Number.isFinite(v.formality) ? v.formality : 30;
  const lines = ["You are " + p.name + ", a character who posts on a forum where other characters and a human user also write. Stay in character at all times."];
  if (p.about) lines.push("Who you are: " + cut(p.about, 1500));
  if (p.interests.length) lines.push("Your interests: " + p.interests.slice(0, 12).join(", ") + ".");
  const habits = p.habits.slice(0, 10).map((h) => str(h && h.text)).filter(Boolean);
  if (habits.length) lines.push("Your habits: " + habits.join("; ") + ".");
  if (str(v.text)) lines.push("How you write: " + cut(str(v.text), 800));
  lines.push(LENGTH_WORDS[length] + " " + EMOJI_WORDS[emoji] + " " + (formality >= 66 ? "Formal, polite address." : formality <= 33 ? "Informal, on first-name terms." : "Neutral tone."));
  if (Array.isArray(v.never) && v.never.length) lines.push("Never write: " + v.never.slice(0, 12).join(", ") + ".");
  lines.push("Write plain forum text: no quotation marks around the whole post, no stage directions or narration, no name label, no signature.");
  lines.push("Write in the language of the recent posts. When there are none, write in the language of your description above. If you do not know something about the real world, say so in your own voice instead of inventing facts.");
  return lines.join("\n");
}

/**
 * What a new topic is about: the ONE place that decides the subject, so a life diary or a world feed (issue #311)
 * can replace it later. Today: one of the profile's interests, or nothing (the model decides).
 */
export function pickSubject(profile, _world, rand) {
  const r = rand || Math.random;
  return profile.interests.length ? profile.interests[Math.floor(r() * profile.interests.length)] : "";
}

const postLine = (p) => (p.by === SELF ? "User" : p.name) + ": " + cut(p.text.replace(/\s+/g, " "), 600);

/** The user message of a reply: where we are, the last posts, who is being answered. */
export function replyContext(board, topic, target) {
  const lines = [];
  if (board) lines.push("Board: " + board.name + (board.desc ? " (" + board.desc + ")" : ""));
  lines.push('Topic: "' + topic.title + '"');
  lines.push("Recent posts, oldest first:");
  for (const p of topic.posts.slice(-CONTEXT_POSTS)) lines.push(postLine(p));
  lines.push("");
  lines.push(
    target
      ? "Write your next post in this topic. You are answering " + (target.by === SELF ? "the user" : target.name) + "'s post: " + cut(target.text.replace(/\s+/g, " "), 200)
      : "Write your next post in this topic.",
  );
  lines.push("Write only the text of the post.");
  return lines.join("\n");
}

/** The user message of a new topic: the board, what exists already, a subject hint, and the answer shape. */
export function newTopicContext(board, titles, subject) {
  const lines = ["Board: " + board.name + (board.desc ? " (" + board.desc + ")" : "")];
  if (titles.length) lines.push("Topics already on this board (do not repeat them): " + titles.slice(0, 8).map((t) => '"' + t + '"').join("; "));
  lines.push(subject ? "A subject on your mind: " + subject + ". You may drop it if it does not fit the board." : "Choose a subject that fits you and the board.");
  lines.push('Open a new topic. Answer with JSON only: {"title": "a short topic title, up to 12 words", "text": "the first post"}');
  return lines.join("\n");
}

/** A post cleaned for the forum: no thinking notes, no tags, no leading name label, no wrapping quotes. */
export function cleanReply(text, name) {
  let s = String(text || "").replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "");
  s = noControls(s.replace(/<[^>]*>/g, " ")).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const label = new RegExp("^\\s*" + String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:\\-—]\\s*", "i");
  if (name) s = s.replace(label, "");
  if (/^["«“].*["»”]$/s.test(s) && !/["«“]/.test(s.slice(1, -1))) s = s.slice(1, -1);
  return cut(s.trim(), TEXT_MAX);
}

/** The first JSON object in a model answer (fenced or not); null when there is none. */
export function parseJsonReply(text) {
  let s = String(text || "").replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(s);
  if (fence && fence[1].includes("{")) s = fence[1];
  const end = s.lastIndexOf("}");
  for (let start = s.indexOf("{"); start !== -1 && start < end; start = s.indexOf("{", start + 1)) {
    try {
      const v = JSON.parse(s.slice(start, end + 1));
      if (isObj(v)) return v;
    } catch {
      // try the next brace
    }
  }
  return null;
}

/**
 * A text for comparing: lower case, punctuation and runs of spaces dropped. No Unicode property escapes here: the
 * plugin sandbox does not know them, and a pattern like that made every text equal to every other one.
 */
const PUNCT = /[\s.,!?;:'"«»“”‘’()[\]{}<>…—–\-_*~`/\\|@#$%^&+=]+/g;
const normal = (s) => String(s).toLowerCase().replace(PUNCT, " ").trim();

// ---------- planning: who writes what ----------

function weightedPick(items, weight, rand) {
  const w = items.map((x) => Math.max(0, weight(x)));
  const total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return items.length ? items[Math.floor(rand() * items.length)] : null;
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

const mentions = (text, name) => !!name && text.toLowerCase().includes(name.toLowerCase());

/** May this author answer this post? One flag of the profile covers the user's posts, another the others'. */
const canAnswer = (author, post) => (post.by === SELF ? author.forum.repliesYou : author.forum.repliesOthers);

/** The replies an author could write, by tier: the user's post still owed replies, a mention, or just a live topic. */
export function targetsFor(author, topics, now, scope) {
  const out = { owed: [], mention: [], live: [] };
  for (const t of topics) {
    if (t.locked || (scope && scope.topic && t.id !== scope.topic) || (scope && scope.board && t.board !== scope.board)) continue;
    const last = t.posts[t.posts.length - 1];
    if (last.by === author.id) continue;
    let userIdx = -1;
    for (let i = t.posts.length - 1; i >= 0; i--) {
      if (t.posts[i].by === SELF) {
        userIdx = i;
        break;
      }
    }
    const wroteSince = userIdx >= 0 && t.posts.slice(userIdx + 1).some((p) => p.by === author.id);
    if (t.owe > 0 && userIdx >= 0 && !wroteSince && author.forum.repliesYou) {
      out.owed.push({ topic: t, target: t.posts[userIdx] });
      continue;
    }
    const tail = t.posts.slice(-6);
    const mi = tail.findIndex((p, i) => p.by !== author.id && mentions(p.text, author.name) && !tail.slice(i + 1).some((q) => q.by === author.id));
    if (mi >= 0 && canAnswer(author, tail[mi]) && now - tail[mi].at < LIVE_MS) {
      out.mention.push({ topic: t, target: tail[mi] });
      continue;
    }
    if (now - t.lastAt < LIVE_MS && canAnswer(author, last)) out.live.push({ topic: t, target: null });
  }
  return out;
}

/**
 * Decides one post: {kind: "reply", author, topic, target} or {kind: "topic", author, board}; null when nobody can write.
 * `mode` "auto" keeps to the safety net (online or away profiles, the limit per author); "force" ignores it.
 */
export function planAction(c, rand) {
  const { profiles, topics, boards, settings, log, now, tz, mode, scope } = c;
  const bmap = boardMap(boards);
  const statusOf = (p) => statusAt(p.schedule, new Date(now), tz);
  const eligible = profiles.filter((p) => {
    if (mode !== "auto") return true;
    const st = statusOf(p);
    return (st === "online" || st === "away") && (log.byAuthor[p.id] || 0) < settings.postsPerAuthor;
  });
  if (!eligible.length) return null;
  const weightOf = (p) => {
    let w = settings.writers === "equal" ? 1 : 5 + p.forum.frequency;
    if (mode === "auto" && statusOf(p) === "away") w *= 0.4;
    if (p.id === log.lastAuthor) w *= 0.3;
    return w;
  };
  const withTargets = eligible.map((a) => ({ author: a, t: targetsFor(a, topics, now, scope) }));
  const reply = (list, pick) => {
    const x = weightedPick(withTargets.filter((y) => list(y.t).length), (y) => weightOf(y.author), rand);
    if (!x) return null;
    const hit = pick(list(x.t), x.author);
    return { kind: "reply", author: x.author, topic: hit.topic, target: hit.target };
  };
  const oldest = (arr) => arr.slice().sort((a, b) => a.topic.lastAt - b.topic.lastAt)[0];
  // 1. a user's post still owed replies, 2. a mention of the author, then the rest by chance
  const owed = reply((t) => t.owed, oldest);
  if (owed) return owed;
  const mention = reply((t) => t.mention, oldest);
  if (mention) return mention;

  const boardList = scope && scope.topic ? [] : [...bmap.values()].filter((x) => !scope || !scope.board || x.board.id === scope.board);
  const canOpen = (a) => a.forum.opensOwn && boardList.length > 0 && topics.length < MAX_TOPICS;
  const newTopic = () => {
    const x = weightedPick(eligible.filter(canOpen), weightOf, rand);
    if (!x) return null;
    const fav = boardList.filter((b) => x.forum.favourites.includes(b.board.name.toLowerCase()));
    const b = weightedPick(fav.length ? fav : boardList, () => 1, rand);
    return { kind: "topic", author: x, board: b.board };
  };
  const anyLive = withTargets.some((x) => x.t.live.length);
  if (!anyLive || rand() * 100 < settings.newTopicShare) {
    const n = newTopic();
    if (n) return n;
  }
  // a live topic: newer ones weigh more, and a board the author likes weighs three times
  const live = reply(
    (t) => t.live,
    (arr, author) =>
      weightedPick(
        arr,
        (h) => {
          const b = bmap.get(h.topic.board);
          const liked = b && author.forum.favourites.includes(b.board.name.toLowerCase());
          return (liked ? 3 : 1) / (1 + Math.max(0, now - h.topic.lastAt) / 3600000 / 12);
        },
        rand,
      ),
  );
  return live || newTopic();
}

// ---------- requests and filing ----------

function requestPost(host, key, settings, author, userMessage, maxTokens) {
  // the author's own model (Profiles > Model) wins over the forum's model in Settings
  const model = author.model || settings.model;
  host.llm.request(key, {
    ...(model ? { model } : {}),
    systemPrompt: systemPromptFor(author),
    messages: [{ role: "user", content: userMessage }],
    presetParams: { temperature: 0.9, max_tokens: maxTokens },
  });
}

const lengthIndex = (p) => (isObj(p.voice) && [0, 1, 2].includes(p.voice.length) ? p.voice.length : 1);

/** Asks for the plan's post under `key`. */
function requestPlan(host, key, settings, plan, boards, topics, rand) {
  if (plan.kind === "reply") {
    const b = boardMap(boards).get(plan.topic.board);
    requestPost(host, key, settings, plan.author, replyContext(b ? b.board : null, plan.topic, plan.target), MAX_TOKENS[lengthIndex(plan.author)]);
  } else {
    const titles = topics.filter((t) => t.board === plan.board.id).sort((a, b) => b.lastAt - a.lastAt).map((t) => t.title);
    requestPost(host, key, settings, plan.author, newTopicContext(plan.board, titles, pickSubject(plan.author, { board: plan.board, titles }, rand)), 900);
  }
}

/** What a later pass needs to file the answer: the author, the topic or the board, the quoted post. Plain data, so it can ride a key or a stash. */
export const filingOf = (plan) =>
  plan.kind === "reply"
    ? { kind: "reply", author: plan.author.id, topic: plan.topic.id, quote: plan.target ? plan.target.id : "" }
    : { kind: "topic", author: plan.author.id, board: plan.board.id };

/** A tick's llm key: ar:<author>:<topic>:<quoted post or -> for a reply, an:<author>:<board> for a new topic. */
export const tickKey = (f) => (f.kind === "reply" ? "ar:" + f.author + ":" + f.topic + ":" + (f.quote || "-") : "an:" + f.author + ":" + f.board);

export function parseTickKey(key) {
  const m = /^a([rn]):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)(?::([A-Za-z0-9_-]+))?$/.exec(String(key));
  if (!m) return null;
  return m[1] === "r" ? { kind: "reply", author: m[2], topic: m[3], quote: m[4] && m[4] !== "-" ? m[4] : "" } : { kind: "topic", author: m[2], board: m[3] };
}

const quoteOf = (p) => ({ by: p.by, name: p.by === SELF ? "" : p.name, text: cut(p.text.replace(/\s+/g, " "), 160) });

/** The model's answer filed as a post or a new topic. Returns {topicId, post} or {error, code?}. */
export function fileResult(fsx, f, result, now, boards) {
  const author = readProfile(fsx, f.author);
  if (!author) return { error: "the author's profile is gone" };
  const r = isObj(result) ? result : {};
  if (r.error || !str(r.text)) return failure(r.error || "the model returned nothing");
  const mine = { by: author.id, name: author.name, hue: author.hue };
  if (f.kind === "reply") {
    const topic = readTopic(fsx, f.topic);
    if (!topic || topic.locked) return { error: "the topic is not open any more" };
    const text = cleanReply(r.text, author.name);
    if (!text) return failure("the model returned nothing");
    if (topic.posts.slice(-CONTEXT_POSTS).some((p) => normal(p.text) === normal(text))) return { error: "the post repeats an earlier one" };
    const target = f.quote ? topic.posts.find((p) => p.id === f.quote) : null;
    const post = { id: "p-" + now + "-" + rid(), ...mine, at: now, text, ...(target ? { quote: quoteOf(target) } : {}) };
    topic.posts.push(post);
    topic.lastAt = now;
    topic.unread = true;
    if (target && target.by === SELF) topic.owe = Math.max(0, topic.owe - 1);
    writeTopic(fsx, topic);
    return { topicId: topic.id, post };
  }
  const hit = boardMap(boards).get(f.board);
  if (!hit) return { error: "the board is gone" };
  const j = parseJsonReply(r.text);
  const title = j ? oneLine(j.title, TITLE_MAX) : "";
  const text = j ? cleanReply(typeof j.text === "string" ? j.text : "", author.name) : "";
  if (!title || !text) return { error: "the model's answer was not a topic" };
  if (loadTopics(fsx).some((t) => t.board === hit.board.id && normal(t.title) === normal(title))) return { error: "the topic repeats an earlier one" };
  const post = { id: "p-" + now + "-" + rid(), ...mine, at: now, text };
  const topic = { id: "t-" + now.toString(36) + "-" + rid(), board: hit.board.id, title, ...mine, createdAt: now, lastAt: now, locked: false, unread: true, owe: 0, posts: [post] };
  writeTopic(fsx, topic);
  return { topicId: topic.id, post };
}

// ---------- routes ----------

const stripState = (s, log, now, tz, profiles) =>
  !s.autonomous ? "off" : !profiles ? "nobody" : s.postsPerDay <= 0 || log.posts >= s.postsPerDay ? "limit" : inQuiet(now, tz, s.quietFrom, s.quietTo) ? "quiet" : "on";

function homeRoute(host) {
  const fsx = host.fs;
  const now = Date.now();
  const s = readSettings(fsx);
  const tz = s.tzOffset;
  const log = readLog(fsx, now, tz);
  const profiles = loadProfiles(fsx);
  const boards = readBoards(fsx);
  const topics = loadTopics(fsx);
  const counts = new Map();
  for (const t of topics) {
    const c = counts.get(t.board) || { topics: 0, posts: 0, unread: false, last: null };
    c.topics += 1;
    c.posts += t.posts.length;
    c.unread = c.unread || t.unread;
    const lp = t.posts[t.posts.length - 1];
    if (!c.last || lp.at > c.last.at) c.last = { topicId: t.id, title: t.title, by: lp.by, name: lp.name, hue: lp.hue, at: lp.at };
    counts.set(t.board, c);
  }
  const categories = boards.categories.map((c) => ({
    id: c.id,
    name: c.name,
    boards: c.boards.map((b) => {
      const k = counts.get(b.id) || { topics: 0, posts: 0, unread: false, last: null };
      return { id: b.id, name: b.name, desc: b.desc, topics: k.topics, posts: k.posts, unread: k.unread, last: k.last };
    }),
  }));
  const state = stripState(s, log, now, tz, profiles.length);
  const nextInMin = state === "on" ? Math.max(0, Math.ceil((Math.max(log.nextAt, log.lastAutoAt + MIN_GAP_MS) - now) / 60000)) : null;
  const newest = profiles.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
  return ok({
    categories,
    strip: {
      state,
      posted: log.posts,
      max: s.postsPerDay,
      quietFrom: s.quietFrom,
      quietTo: s.quietTo,
      nextInMin,
      error: log.error,
      profiles: profiles.length,
      boards: boards.categories.reduce((n, c) => n + c.boards.length, 0),
    },
    online: profiles.filter((p) => ["online", "away"].includes(statusAt(p.schedule, new Date(now), tz))).map((p) => ({ id: p.id, name: p.name })),
    unread: topics.filter((t) => t.unread).length,
    stats: { posts: topics.reduce((n, t) => n + t.posts.length, 0), topics: topics.length, members: profiles.length + 1, newest: newest ? newest.name : "" },
    now,
  });
}

function boardRoute(req, host) {
  const id = String((isObj(req.query) ? req.query.id : "") || "");
  const hit = boardMap(readBoards(host.fs)).get(id);
  if (!hit) return ok({ error: "no such board" }, 404);
  const topics = loadTopics(host.fs)
    .filter((t) => t.board === id)
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 200)
    .map((t) => {
      const lp = t.posts[t.posts.length - 1];
      return { id: t.id, title: t.title, by: t.by, name: t.name, hue: t.hue, createdAt: t.createdAt, replies: t.posts.length - 1, lastAt: t.lastAt, lastBy: lp.by, lastName: lp.name, lastHue: lp.hue, locked: t.locked, unread: t.unread };
    });
  return ok({ board: { id, name: hit.board.name, desc: hit.board.desc, category: hit.category.name }, topics });
}

function topicRoute(req, host) {
  const fsx = host.fs;
  const id = String((isObj(req.query) ? req.query.id : "") || "");
  const topic = readTopic(fsx, id);
  if (!topic) return ok({ error: "no such topic" }, 404);
  const hit = boardMap(readBoards(fsx)).get(topic.board);
  const now = Date.now();
  const tz = readSettings(fsx).tzOffset;
  const counts = countByAuthor(loadTopics(fsx));
  const total = topic.posts.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const asked = isObj(req.query) ? req.query.page : undefined;
  const page = asked === "last" ? pages : Math.min(pages, Math.max(1, Math.floor(Number(asked)) || 1));
  const from = (page - 1) * PAGE_SIZE;
  const shown = topic.posts.slice(from, from + PAGE_SIZE);
  const authors = {};
  for (const p of shown) {
    if (authors[p.by]) continue;
    const prof = p.by === SELF ? null : readProfile(fsx, p.by);
    authors[p.by] = {
      name: prof ? prof.name : p.name,
      hue: prof ? prof.hue : p.hue,
      picture: prof ? prof.picture : "",
      rank: prof ? prof.forum.rank : "",
      signature: prof ? prof.forum.signature : "",
      count: counts[p.by] || 0,
      joined: prof ? prof.createdAt : 0,
      online: prof ? ["online", "away"].includes(statusAt(prof.schedule, new Date(now), tz)) : p.by === SELF,
    };
  }
  return ok({
    topic: {
      id: topic.id,
      title: topic.title,
      board: hit ? { id: hit.board.id, name: hit.board.name, category: hit.category.name } : { id: topic.board, name: "", category: "" },
      createdAt: topic.createdAt,
      lastAt: topic.lastAt,
      locked: topic.locked,
      unread: topic.unread,
      posts: shown,
    },
    paging: { page, pages, size: PAGE_SIZE, total, from },
    authors,
  });
}

/** The words of a search: lower case, split on spaces, at most six. */
export function searchWords(q) {
  return oneLine(typeof q === "string" ? q : "", 80).toLowerCase().split(" ").filter(Boolean).slice(0, 6);
}

const hasAll = (text, words) => {
  const low = String(text).toLowerCase();
  return words.every((w) => low.includes(w));
};

/** About SNIPPET_CHARS of the text, starting a little before the first word found. */
export function snippetOf(text, words) {
  const flat = oneLine(text, 4000);
  const low = flat.toLowerCase();
  let at = -1;
  for (const w of words) {
    const i = low.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, at - 40);
  const end = start + SNIPPET_CHARS;
  return (start > 0 ? "…" : "") + flat.slice(start, end).trim() + (end < flat.length ? "…" : "");
}

function searchRoute(req, host) {
  const q = oneLine(isObj(req.query) && typeof req.query.q === "string" ? req.query.q : "", 80);
  const words = searchWords(q);
  if (q.length < SEARCH_MIN_CHARS) return ok({ q, words, topics: [], tooShort: true, truncated: false });
  const boards = boardMap(readBoards(host.fs));
  const rows = [];
  for (const t of loadTopics(host.fs)) {
    const titleHit = hasAll(t.title, words);
    const hits = [];
    t.posts.forEach((p, i) => {
      if (hasAll(p.text, words)) hits.push(i);
    });
    if (!titleHit && !hits.length) continue;
    const i = hits.length ? hits[0] : 0;
    const post = t.posts[i];
    const b = boards.get(t.board);
    rows.push({
      id: t.id,
      title: t.title,
      board: { id: t.board, name: b ? b.board.name : "" },
      category: b ? b.category.name : "",
      by: post.by,
      name: post.name,
      hue: post.hue,
      at: post.at,
      n: i + 1,
      page: Math.floor(i / PAGE_SIZE) + 1,
      matches: hits.length,
      titleHit,
      snippet: snippetOf(post.text, words),
      lastAt: t.lastAt,
    });
  }
  rows.sort((a, b) => (a.titleHit === b.titleHit ? b.lastAt - a.lastAt : a.titleHit ? -1 : 1));
  return ok({ q, words, topics: rows.slice(0, SEARCH_MAX), tooShort: false, truncated: rows.length > SEARCH_MAX });
}

/** The topics with posts the user has not seen, and the newest of those posts (for the shell's message). */
function unreadRoute(host) {
  const unread = loadTopics(host.fs).filter((t) => t.unread);
  const newest = unread.slice().sort((x, y) => y.lastAt - x.lastAt)[0];
  const last = newest ? newest.posts[newest.posts.length - 1] : null;
  return ok({ unread: unread.length, latest: newest && last ? { title: newest.title, who: last.by === SELF ? "" : last.name, at: newest.lastAt } : null });
}

function boardsRoute(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const next = mergeBoards(readBoards(host.fs), b.categories);
  host.fs.write("forum/boards.json", JSON.stringify(next));
  return ok({ ok: true, categories: next.categories });
}

/** The user posted: characters reply in a few minutes, within the safety net (the slot moves up, never past the hard gap). */
function userPosted(fsx, now) {
  const s = readSettings(fsx);
  if (!s.autonomous) return;
  const log = readLog(fsx, now, s.tzOffset);
  const want = Math.max(now + 2 * 60000 + Math.floor(Math.random() * 2 * 60000), log.lastAutoAt + MIN_GAP_MS);
  if (!log.nextAt || log.nextAt > want) {
    log.nextAt = want;
    writeLog(fsx, log);
  }
}

const bodyText = (b) => cut(noControls(String(typeof b.text === "string" ? b.text : "")).replace(/\n{3,}/g, "\n\n").trim(), TEXT_MAX);

function newTopicRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const hit = boardMap(readBoards(fsx)).get(String(b.board || ""));
  if (!hit) return ok({ error: "no such board" }, 404);
  const title = oneLine(b.title, TITLE_MAX);
  const text = bodyText(b);
  if (title.length < 3) return ok({ error: "a topic needs a title" }, 400);
  if (!text) return ok({ error: "a topic needs text" }, 400);
  if (loadTopics(fsx).length >= MAX_TOPICS) return ok({ error: "too many topics (" + MAX_TOPICS + ")" }, 400);
  const now = Date.now();
  const post = { id: "p-" + now + "-" + rid(), by: SELF, name: "", hue: 200, at: now, text };
  const topic = { id: "t-" + now.toString(36) + "-" + rid(), board: hit.board.id, title, by: SELF, name: "", hue: 200, createdAt: now, lastAt: now, locked: false, unread: false, owe: 1 + Math.floor(Math.random() * 3), posts: [post] };
  writeTopic(fsx, topic);
  userPosted(fsx, now);
  return ok({ ok: true, topic: topic.id });
}

function replyRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const topic = readTopic(fsx, String(b.topic || ""));
  if (!topic) return ok({ error: "no such topic" }, 404);
  if (topic.locked) return ok({ error: "the topic is locked" }, 409);
  const text = bodyText(b);
  if (!text) return ok({ error: "a reply needs text" }, 400);
  const now = Date.now();
  const target = typeof b.quoteOf === "string" ? topic.posts.find((p) => p.id === b.quoteOf) : null;
  const post = { id: "p-" + now + "-" + rid(), by: SELF, name: "", hue: 200, at: now, text, ...(target ? { quote: quoteOf(target) } : {}) };
  topic.posts.push(post);
  topic.lastAt = now;
  topic.unread = false;
  topic.owe = 1 + Math.floor(Math.random() * 3);
  writeTopic(fsx, topic);
  userPosted(fsx, now);
  return ok({ ok: true, post });
}

function readRoute(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const topic = readTopic(host.fs, String(b.topic || ""));
  if (!topic) return ok({ error: "no such topic" }, 404);
  if (topic.unread) {
    topic.unread = false;
    writeTopic(host.fs, topic);
  }
  return ok({ ok: true });
}

/**
 * The user closes or reopens a topic. A closed topic takes no posts from anybody: the replies route and the planner
 * refuse it. Closing changes nothing else: `lastAt` stays, so the topic is not bumped and sinks as others rise.
 * The replies a character still owed the user are dropped, so nobody answers after a reopen out of date.
 */
function lockRoute(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const topic = readTopic(host.fs, String(b.topic || ""));
  if (!topic) return ok({ error: "no such topic" }, 404);
  if (typeof b.locked !== "boolean") return ok({ error: "locked must be true or false" }, 400);
  topic.locked = b.locked;
  if (b.locked) topic.owe = 0;
  writeTopic(host.fs, topic);
  return ok({ ok: true, locked: topic.locked });
}

/** "Write now": up to three posts at once, requested together in the first pass, filed in order in the second. */
function forceRoute(req, host) {
  const fsx = host.fs;
  const now = Date.now();
  const s = readSettings(fsx);
  const tz = s.tzOffset;
  const stash = isObj(req.stash) ? req.stash : null;
  const boards = readBoards(fsx);

  if (!stash) {
    const b = isObj(req.body) ? req.body : {};
    const count = clampInt(b.count, 1, FORCE_MAX, 1);
    const scope = { board: ID.test(String(b.board || "")) ? String(b.board) : "", topic: ID.test(String(b.topic || "")) ? String(b.topic) : "" };
    const profiles = loadProfiles(fsx);
    if (!profiles.length) return ok({ ok: false, code: "no-profiles", error: "there are no profiles to write" });
    const log = readLog(fsx, now, tz);
    const topics = loadTopics(fsx);
    const taken = new Set();
    const plans = [];
    for (let i = 0; i < count; i++) {
      const plan = planAction({ profiles, topics: topics.filter((t) => !taken.has(t.id)), boards, settings: s, log, now, tz, mode: "force", scope }, Math.random);
      if (!plan) break;
      if (plan.kind === "reply") taken.add(plan.topic.id);
      plans.push(plan);
    }
    if (!plans.length) return ok({ ok: false, code: "no-target", error: boards.categories.some((c) => c.boards.length) ? "no character can write here" : "there are no boards yet" });
    plans.forEach((plan, i) => requestPlan(host, "f" + i, s, plan, boards, topics, Math.random));
    return { __llmPending: true, stash: { plans: plans.map(filingOf) } };
  }

  const log = readLog(fsx, now, tz);
  const results = host.llm.results || {};
  const written = [];
  const errors = [];
  (Array.isArray(stash.plans) ? stash.plans : []).forEach((f, i) => {
    const r = fileResult(fsx, f, results["f" + i], now, boards);
    if (r.post) {
      recordPost(log, f.author, now, false, s, Math.random);
      written.push({ topic: r.topicId, by: r.post.name });
    } else {
      errors.push({ error: r.error, ...(r.code ? { code: r.code } : {}) });
    }
  });
  if (!written.length && errors.length) recordFailure(log, errors[0], now, false);
  writeLog(fsx, log);
  return ok({ ok: written.length > 0, written: written.length, posts: written, ...(errors.length ? { errors } : {}) });
}

// ---------- onTick: the characters write on their own ----------

export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !host.llm) return;
  const now = Date.now();
  const s = readSettings(fsx);
  const tz = s.tzOffset;
  const results = host.llm.results || {};
  const done = Object.keys(results).filter((k) => k.startsWith("ar:") || k.startsWith("an:"));
  const boards = readBoards(fsx);
  const log = readLog(fsx, now, tz);

  if (done.length) {
    for (const key of done) {
      const f = parseTickKey(key);
      if (!f) continue;
      const r = fileResult(fsx, f, results[key], now, boards);
      if (r.post) recordPost(log, f.author, now, true, s, Math.random);
      else recordFailure(log, r, now, true);
    }
    writeLog(fsx, log);
    return;
  }

  if (autoBlock(log, s, now, tz)) return;
  const profiles = loadProfiles(fsx);
  if (!profiles.length || !boards.categories.some((c) => c.boards.length)) return;
  const topics = loadTopics(fsx);
  const plan = planAction({ profiles, topics, boards, settings: s, log, now, tz, mode: "auto" }, Math.random);
  if (!plan) return;
  requestPlan(host, tickKey(filingOf(plan)), s, plan, boards, topics, Math.random);
}

// ---------- routing ----------

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  const method = req && req.method;
  if (!path.startsWith("/forum/") && path !== "/forum") return null;
  if (path === "/forum/home" && method === "GET") return homeRoute(host);
  if (path === "/forum/board" && method === "GET") return boardRoute(req, host);
  if (path === "/forum/topic" && method === "GET") return topicRoute(req, host);
  if (path === "/forum/search" && method === "GET") return searchRoute(req, host);
  if (path === "/forum/unread" && method === "GET") return unreadRoute(host);
  if (path === "/forum/boards" && method === "POST") return boardsRoute(req, host);
  if (path === "/forum/topic" && method === "POST") return newTopicRoute(req, host);
  if (path === "/forum/reply" && method === "POST") return replyRoute(req, host);
  if (path === "/forum/read" && method === "POST") return readRoute(req, host);
  if (path === "/forum/lock" && method === "POST") return lockRoute(req, host);
  if (path === "/forum/force" && method === "POST") return forceRoute(req, host);
  return ok({ error: "not found" }, 404);
}
