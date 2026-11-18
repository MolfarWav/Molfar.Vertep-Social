/**
 * Social journal (issue #444, phase J1): every character and the user keep a journal of dated posts (title, text, mood, tags, a
 * picture). It is the public side of a character's life; the diary stays the private record that feeds prompts. J1 has no model
 * calls: a post comes from the user's own hand, or from a story that ran out. J2 (the same issue): a character now and then writes a post
 * from its own diary of the day (the Life plugin writes it, only read here): a chance per tick, a cap per day per character, its schedule
 * obeyed, a switch (`community.journalPosts`, off by default), one model call per post on the forum model (the profile's own wins), key
 * `jp:<profile>`. State in journal/state.json {day, counts, used: {profileId: [diary entry ids]}, pending: {profileId: {at, entries}},
 * failedAt: {profileId: at}}.
 *
 * Why a mirror: a story is deleted by the stories plugin 24 hours after it was posted, and each plugin writes only its own files.
 * So this plugin keeps a copy of every live story (`journal/mirror.json`, refreshed each tick) and, when the original is gone or
 * older than a day, files the copy as a post of its author. A story the user removed before it expired is dropped from the copy,
 * and with the switch off (`community.storiesToJournal`) nothing is copied and an expiring story is dropped as before.
 * A story's caption is at most 140 characters already, so the shortened form is the caption as it is.
 *
 * Data: journal/<ownerId>.json {posts: [{id, at, title, text, image?, mood?, place?, tags[], visible: "all"|"friends"|"me",
 * from: "you" | "story:<id>"}]}; the owner is a profile id, or "you" for the user. journal/mirror.json {stories: {<storyId>:
 * {id, by, at, text, image?}}, done: [storyIds]} (`done`: stories already filed or removed, so one the user removed is not filed
 * again while the stories file still holds it). `visible` (J4): "all" anyone, "friends" only friends, "me" nobody but the user. The one rule is
 * `canRead`, checked in code wherever a character could read a post (today: who may comment); a friend of the user is a character the user
 * follows (journal/follows.json) that follows the user's persona back (Life's list, `fol`); two characters are friends when each follows the other.
 *
 * J3 (the same issue): comments and follows. journal/comments/<postId>.json {comments: [{id, by: profile id | "you", at, text}]} (100); the user
 * comments freely, and a character may comment under a post of someone it follows or is close to (Life's list, read only), or answer the
 * user's comment under its own post: switch `community.journalComments` (off by default), a cap per day per character
 * (`journalCommentsPerDay`), at most 4 comments by characters under one post, only posts of the last 3 days that the commenter may read (`canRead`), one model
 * call a comment, key `jc:<commenter>:<owner>:<post>`. A reply owed to the user ignores the chance. journal/follows.json {you: [profile ids]}: the
 * journals the user follows (the "Following" feed). The state file also holds {ccounts, cpending, cfailedAt}.
 *
 * Routes (relative to /v1/apps/social):
 *   GET  /journal/comments?owner=&post=   {comments: [{id, by, name, hue, picture, at, text, mine, view?}]}; `view` is what the post's author
 *                                         remembers of the commenter (Life's note, read only), only under a character's own post
 *   POST /journal/comment {owner, post, text}   the user comments
 *   POST /journal/comment/remove {owner, post, id}
 *   POST /journal/follow {id, on}         follow or unfollow a character's journal
 *   GET  /journal/friends                 {friends: [{id, name, hue, picture}]}: the characters who may read the user's friends-only posts
 *   GET  /journal/feed?owner=<id|you>&before=<at>   {on, posts: [view], more}: newest first, 30 a page, all journals or one
 *   POST /journal/post {title?, text, mood?, tags?, visible?}   the user writes a post
 *   POST /journal/edit {id, title?, text?, mood?, tags?, visible?}   the user edits one of their own posts
 *   POST /journal/remove {id}      the user removes a post (their own, or a character's)
 *   GET  /journal/images           the pictures nobody has drawn yet: {items: [{id, owner, prompt, model}]}
 *   POST /journal/image {owner, id, url? | error?}   the page files a drawn picture (or says it failed)
 *   POST /journal/visible {owner, id, visible}   (#453) who sees a post: the user's own or a character's ("me" hides a character's post from
 *                                         every other character, and characters stop commenting under it)
 *   GET  /journal/unread                  (#453) {unread}: comments by characters the user has not seen, under the user's posts and under posts
 *                                         the user commented on (journal/seen.json {at})
 *   POST /journal/seen                    the user opened the journal: everything so far counts as seen
 *
 * #453 also: a character's post may be for friends only (the model says so, `for`), and may carry a picture it describes (switch
 * `community.journalPictures`, off by default; drawn by the page's picture worker like a story's). The user's post may carry a place of the
 * town (`place`: a place id in a request, its name in the file). The author's view of a commenter is Life's note when there is one; when there
 * is none, one capped model call (key `jv:<owner>:<commenter>`, at most VIEWS_PER_DAY a day, on the comments switch) words it once and
 * journal/views.json {<owner>: {<commenter>: {text, at}}} keeps it.
 *
 * Permissions: routes, fs, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const YOU = "you";
/** File names in journal/ that are not a journal. A profile can not have these ids. */
const RESERVED = ["mirror", "state", "follows", "seen", "views"];
const STORY_MS = 24 * 3600 * 1000;
const PAGE = 30;
const MAX_POSTS = 500;
const DONE_MAX = 1000;
const TITLE_MAX = 120;
const TEXT_MAX = 8000;
const MOOD_MAX = 24;
const TAG_MAX = 24;
const TAGS_MAX = 5;
const VISIBLE = ["all", "friends", "me"];
const FROM = /^(you|story:[A-Za-z0-9_-]{1,60}|diary:[A-Za-z0-9_-]{1,60})$/;
const STATUSES = ["online", "away", "dnd", "na", "off"];
const STATE = "journal/state.json";
const CHANCE = 0.08;
const FAIL_WAIT_MS = 30 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;
const MATERIAL = 3;
const COMMENT_MAX = 600;
const AI_COMMENT_MAX = 280;
const COMMENTS_KEEP = 100;
const AI_PER_POST = 4;
const FRESH_MS = 3 * 24 * 3600 * 1000;
const LEVELS = ["stranger", "slight", "acquaintance", "penfriend", "friend", "close", "confidant"];
const CLOSE_FROM = 3;
const FOLLOWS = "journal/follows.json";
const ASSET = /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/;
const MIRROR = "journal/mirror.json";
const SEEN = "journal/seen.json";
const VIEWS = "journal/views.json";
const VIEWS_PER_DAY = 3;
const VIEW_MAX = 200;
const STORIES = "stories/items.json";

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const ok = (json, status) => ({ status: status || 200, json });
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const cut = (s, n) => {
  if (s.length <= n) return s;
  let out = s.slice(0, n);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.replace(/[‍️]+$/, "");
};
const noControls = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch)).join("");
const oneLine = (v, n) => cut(noControls(String(typeof v === "string" ? v : "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), n);
/** Plain text with its line breaks: control characters and tags out, at most two blank lines in a row. */
const body = (v, n) =>
  cut(
    String(typeof v === "string" ? v : "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => noControls(line).replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    n,
  );
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

// ---------- settings, profiles ----------

export function readSettings(fsx) {
  const r = readJson(fsx, "settings.json", null);
  const raw = isObj(r) ? r : {};
  const c = isObj(raw.community) ? raw.community : {};
  const m = isObj(raw.models) ? raw.models : {};
  const im = isObj(raw.images) ? raw.images : {};
  const l = isObj(raw.life) ? raw.life : {};
  return {
    keep: c.storiesToJournal !== false,
    imageModel: modelRef(im.model) || modelRef(m.image),
    posts: c.journalPosts === true,
    pictures: c.journalPictures === true,
    comments: c.journalComments === true,
    commentsPerDay: Number.isInteger(c.journalCommentsPerDay) && c.journalCommentsPerDay >= 0 && c.journalCommentsPerDay <= 10 ? c.journalCommentsPerDay : 2,
    perDay: Number.isInteger(c.journalPerDay) && c.journalPerDay >= 0 && c.journalPerDay <= 5 ? c.journalPerDay : 1,
    lifeOn: l.on !== false,
    model: modelRef(m.forum),
    tz: typeof raw.tzOffset === "number" && Number.isFinite(raw.tzOffset) && Math.abs(raw.tzOffset) <= 840 ? raw.tzOffset : null,
  };
}

function readProfile(fsx, id) {
  if (!ID.test(String(id)) || id === YOU || RESERVED.includes(String(id))) return null;
  const p = readJson(fsx, "profiles/" + id + ".json", null);
  if (!isObj(p) || !str(p.name) || p.source === "persona") return null;
  return {
    id: String(id),
    name: str(p.name),
    hue: Number.isFinite(p.hue) ? p.hue : 200,
    picture: typeof p.picture === "string" && ASSET.test(p.picture) ? p.picture : "",
    imageModel: modelRef(p.imageModel),
    about: str(p.about),
    voice: isObj(p.voice) ? p.voice : {},
    schedule: p.schedule,
    lifeOn: !isObj(p.life) || p.life.on !== false,
    model: modelRef(p.model),
  };
}

function profileIds(fsx) {
  try {
    return fsx.list("profiles").map((n) => /^([A-Za-z0-9_-]{1,60})\.json$/.exec(n)).filter(Boolean).map((m) => m[1]);
  } catch {
    return [];
  }
}

// ---------- time (copies of the stories plugin's) ----------

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

// ---------- the files ----------

export function cleanImage(raw) {
  if (!isObj(raw)) return null;
  if (raw.state === "ready" && typeof raw.url === "string" && ASSET.test(raw.url)) return { state: "ready", url: raw.url, ...(str(raw.alt) ? { alt: oneLine(raw.alt, 200) } : {}), gen: true };
  if ((raw.state === "pending" || raw.state === "failed") && str(raw.prompt)) return { state: raw.state, prompt: oneLine(raw.prompt, 400), gen: true };
  return null;
}

export function cleanTags(v) {
  const out = [];
  for (const t of Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []) {
    const tag = oneLine(t, TAG_MAX).replace(/^#+/, "").trim();
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

export function cleanPost(x) {
  if (!isObj(x) || typeof x.id !== "string" || !ID.test(x.id) || !Number.isFinite(x.at) || x.at <= 0) return null;
  const title = oneLine(x.title, TITLE_MAX);
  const text = body(x.text, TEXT_MAX);
  const image = cleanImage(x.image);
  if (!text && !title && !image) return null;
  const mood = oneLine(x.mood, MOOD_MAX);
  const place = oneLine(x.place, 60);
  return {
    id: x.id,
    at: x.at,
    title,
    text,
    ...(image ? { image } : {}),
    ...(mood ? { mood } : {}),
    ...(place ? { place } : {}),
    tags: cleanTags(x.tags),
    visible: VISIBLE.includes(x.visible) ? x.visible : "all",
    from: typeof x.from === "string" && FROM.test(x.from) ? x.from : "you",
  };
}

const ownerPath = (owner) => "journal/" + owner + ".json";

export function readPosts(fsx, owner) {
  const d = readJson(fsx, ownerPath(owner), null);
  const list = isObj(d) && Array.isArray(d.posts) ? d.posts : [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const p = cleanPost(x);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

const writePosts = (fsx, owner, posts) => fsx.write(ownerPath(owner), JSON.stringify({ posts }));

function ownerIds(fsx) {
  try {
    return fsx.list("journal").map((n) => /^([A-Za-z0-9_-]{1,60})\.json$/.exec(n)).filter(Boolean).map((m) => m[1]).filter((id) => !RESERVED.includes(id));
  } catch {
    return [];
  }
}

function cleanMirrorStory(x) {
  if (!isObj(x) || typeof x.id !== "string" || !ID.test(x.id) || typeof x.by !== "string" || !ID.test(x.by) || !Number.isFinite(x.at) || !str(x.text)) return null;
  const image = cleanImage(x.image);
  return { id: x.id, by: x.by, at: x.at, text: oneLine(x.text, 140), ...(str(x.place) ? { place: oneLine(x.place, 60) } : {}), ...(image ? { image } : {}) };
}

function readMirror(fsx) {
  const d = readJson(fsx, MIRROR, null);
  const m = isObj(d) && isObj(d.stories) ? d.stories : {};
  const stories = {};
  for (const v of Object.values(m)) {
    const s = cleanMirrorStory(v);
    if (s) stories[s.id] = s;
  }
  const done = (isObj(d) && Array.isArray(d.done) ? d.done : []).filter((x) => typeof x === "string" && ID.test(x)).slice(-DONE_MAX);
  return { stories, done };
}

const writeMirror = (fsx, mirror) => fsx.write(MIRROR, JSON.stringify({ stories: mirror.stories, done: mirror.done.slice(-DONE_MAX) }));

/** The live stories as the stories plugin keeps them, read only here (expired ones included: its sweep runs on its own tick). */
function readStories(fsx) {
  const d = readJson(fsx, STORIES, null);
  return (isObj(d) && Array.isArray(d.stories) ? d.stories : []).map(cleanMirrorStory).filter(Boolean);
}

// ---------- stories into the journal ----------

/** A story as a post of its author. The id follows the story's, so filing it twice is a no-op. */
export const postFromStory = (s) => ({ id: "j-" + s.id, at: s.at, title: "", text: s.text, ...(s.place ? { place: s.place } : {}), ...(s.image ? { image: s.image } : {}), tags: [], visible: "all", from: "story:" + s.id });

/**
 * One pass of the mirror. `live` is what the stories plugin holds now; `mirror` is {stories, done} from the last pass. Returns
 * {mirror, filed: {<ownerId>: [post]}}: the new mirror, and the posts to add. Pure: the caller reads and writes.
 */
export function mirrorPass(mirror, live, now, keep) {
  if (!keep) return { mirror: { stories: {}, done: mirror.done }, filed: {} };
  const stories = {};
  const done = new Set(mirror.done);
  const filed = {};
  const liveIds = new Set(live.map((s) => s.id));
  const file = (s) => {
    if (done.has(s.id)) return;
    (filed[s.by] = filed[s.by] || []).push(postFromStory(s));
    done.add(s.id);
  };
  for (const s of live) {
    if (done.has(s.id)) continue;
    if (now - s.at >= STORY_MS) file(s);
    else stories[s.id] = s;
  }
  for (const s of Object.values(mirror.stories)) {
    if (liveIds.has(s.id) || done.has(s.id)) continue;
    // gone from the stories file: the user removed it early (drop), or it expired and was swept (file it)
    if (now - s.at >= STORY_MS - 5 * 60 * 1000) file(s);
  }
  return { mirror: { stories, done: [...done] }, filed };
}

// ---------- characters write (J2) ----------

const timeMap = (v) => {
  const out = {};
  if (isObj(v)) for (const [k, t] of Object.entries(v)) if (ID.test(k) && num(t) > 0) out[k] = num(t);
  return out;
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function readState(fsx, now, tz) {
  const d = readJson(fsx, STATE, null);
  const r = isObj(d) ? d : {};
  const day = localDay(now, tz);
  const counts = {};
  if (r.day === day && isObj(r.counts)) for (const [k, v] of Object.entries(r.counts)) if (ID.test(k) && num(v) > 0) counts[k] = Math.floor(num(v));
  const used = {};
  if (isObj(r.used)) for (const [k, list] of Object.entries(r.used)) if (ID.test(k) && Array.isArray(list)) used[k] = list.filter((x) => typeof x === "string" && ID.test(x)).slice(-30);
  const pending = {};
  if (isObj(r.pending)) {
    for (const [k, v] of Object.entries(r.pending)) {
      if (ID.test(k) && isObj(v) && num(v.at) > 0) pending[k] = { at: num(v.at), entries: (Array.isArray(v.entries) ? v.entries : []).filter((x) => typeof x === "string" && ID.test(x)).slice(0, MATERIAL) };
    }
  }
  const ccounts = {};
  if (r.day === day && isObj(r.ccounts)) for (const [k, v] of Object.entries(r.ccounts)) if (ID.test(k) && num(v) > 0) ccounts[k] = Math.floor(num(v));
  const vcount = r.day === day && num(r.vcount) > 0 ? Math.floor(num(r.vcount)) : 0;
  return { day, counts, used, pending, failedAt: timeMap(r.failedAt), ccounts, cpending: timeMap(r.cpending), cfailedAt: timeMap(r.cfailedAt), vcount, vpending: num(r.vpending), vfailedAt: num(r.vfailedAt) };
}

const writeState = (fsx, s) => fsx.write(STATE, JSON.stringify(s));

/** The diary entries of today the character wrote itself: [{id, text}] (the Life plugin writes the diary; it is only read here). */
function todaysEntries(fsx, id, day) {
  const d = readJson(fsx, "life/diary/" + id + ".json", null);
  const list = isObj(d) && Array.isArray(d.entries) ? d.entries : [];
  return list.filter((e) => isObj(e) && typeof e.id === "string" && ID.test(e.id) && e.day === day && e.by !== "you" && e.kind !== "you" && str(e.text)).map((e) => ({ id: e.id, text: str(e.text) }));
}

/** One post that could be written now: {profile, entries} or null. Rules only: the switch, Life on, a character that is around, under its cap, with unused diary lines of today. */
export function pickWriter(c, rand) {
  const { fsx, settings, state, profiles, now } = c;
  if (!settings.posts || settings.perDay <= 0 || !settings.lifeOn) return null;
  const cands = [];
  for (const p of profiles) {
    if (!p.lifeOn || !["online", "away"].includes(statusAt(p.schedule, new Date(now), settings.tz))) continue;
    if ((state.counts[p.id] || 0) >= settings.perDay) continue;
    if (now - (state.failedAt[p.id] || 0) < FAIL_WAIT_MS || (state.pending[p.id] && now - state.pending[p.id].at < PENDING_MS)) continue;
    const used = state.used[p.id] || [];
    const entries = todaysEntries(fsx, p.id, state.day).filter((e) => !used.includes(e.id)).slice(0, MATERIAL);
    if (entries.length) cands.push({ profile: p, entries });
  }
  return cands.length ? cands[Math.floor(rand() * cands.length)] : null;
}

export function postSystem(p, pictures) {
  const lines = ["You are " + p.name + ", a character. You are writing a post in your own journal, the kind of blog post your friends read, in your own voice."];
  if (p.about) lines.push("Who you are: " + cut(p.about, 800));
  if (str(p.voice.text)) lines.push("How you write: " + cut(str(p.voice.text), 400));
  lines.push("Write in the language of your description above. Say something true to the diary lines below; do not invent big events or people.");
  lines.push('"for" is "friends" when the post is personal, something you would tell only your friends; otherwise "everyone".');
  if (pictures) lines.push('"picture": only now and then, when a photo really belongs with this post, one sentence on what the photo shows (no text in it); otherwise "".');
  lines.push('Answer with JSON only: {"title": "at most 60 characters", "text": "two to five sentences, at most 700 characters", "mood": "one word", "tags": ["up to three short tags"], "for": "everyone"' + (pictures ? ', "picture": ""' : "") + "}");
  return lines.join("\n");
}

export const postUser = (entries) => "Your diary of today:\n" + entries.map((e) => "- " + cut(e.text, 400)).join("\n");

/** The first JSON object in an answer; null when none. */
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
      // next brace
    }
  }
  return null;
}

/** Files the model's post ("jp:<profile>"). Returns {post} or {error}. */
export function fileWriterResult(fsx, key, result, now, tz) {
  const m = /^jp:([A-Za-z0-9_-]{1,60})$/.exec(String(key));
  if (!m) return { error: "bad key" };
  const state = readState(fsx, now, tz);
  const pend = state.pending[m[1]];
  delete state.pending[m[1]];
  const fail = (error) => {
    state.failedAt[m[1]] = now;
    writeState(fsx, state);
    return { error };
  };
  if (!readProfile(fsx, m[1])) return fail("the profile is gone");
  const r = isObj(result) ? result : {};
  if (r.error || !str(r.text)) return fail(r.error || "the model returned nothing");
  const j = parseJsonReply(r.text);
  const text = j ? body(j.text, 1200) : body(r.text, 1200);
  if (!text) return fail("the model returned no text");
  const entries = pend ? pend.entries : [];
  const picture = j && readSettings(fsx).pictures ? oneLine(j.picture, 300) : "";
  const post = cleanPost({
    id: "j-d-" + now + "-" + rid(),
    at: now,
    title: j ? j.title : "",
    text,
    mood: j ? j.mood : "",
    place: (cityNow(fsx, m[1], now, tz) || { place: { name: "" } }).place.name,
    tags: j ? j.tags : [],
    // (#453) a personal post is for friends only; a picture it describes waits for the page's picture worker
    visible: j && str(j.for).toLowerCase() === "friends" ? "friends" : "all",
    ...(picture ? { image: { state: "pending", prompt: picture } } : {}),
    from: "diary:" + (entries[0] || "x"),
  });
  if (!post) return fail("the model returned nothing usable");
  const posts = readPosts(fsx, m[1]).concat(post).sort((a, b) => a.at - b.at);
  writePosts(fsx, m[1], posts.slice(-MAX_POSTS));
  state.counts[m[1]] = (state.counts[m[1]] || 0) + 1;
  state.used[m[1]] = [...(state.used[m[1]] || []), ...entries].slice(-30);
  delete state.failedAt[m[1]];
  writeState(fsx, state);
  return { post };
}

// ---------- comments and follows (J3) ----------

const commentsPath = (post) => "journal/comments/" + post + ".json";

export function cleanComment(x) {
  if (!isObj(x) || typeof x.id !== "string" || !ID.test(x.id) || typeof x.by !== "string" || !(x.by === YOU || ID.test(x.by)) || !Number.isFinite(x.at) || x.at <= 0) return null;
  const text = body(x.text, COMMENT_MAX);
  return text ? { id: x.id, by: x.by, at: x.at, text } : null;
}

export function readComments(fsx, post) {
  if (!ID.test(String(post))) return [];
  const d = readJson(fsx, commentsPath(post), null);
  const seen = new Set();
  const out = [];
  for (const x of isObj(d) && Array.isArray(d.comments) ? d.comments : []) {
    const c = cleanComment(x);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out.slice(-COMMENTS_KEEP);
}

const writeComments = (fsx, post, list) => fsx.write(commentsPath(post), JSON.stringify({ comments: list.slice(-COMMENTS_KEEP) }));
const removeComments = (fsx, post) => {
  try {
    fsx.remove(commentsPath(post));
  } catch {
    // nothing to remove
  }
};

export function readFollows(fsx) {
  const d = readJson(fsx, FOLLOWS, null);
  const out = [];
  for (const x of isObj(d) && Array.isArray(d.you) ? d.you : []) if (typeof x === "string" && ID.test(x) && x !== YOU && !RESERVED.includes(x) && !out.includes(x)) out.push(x);
  return out.slice(0, 300);
}
const writeFollows = (fsx, list) => fsx.write(FOLLOWS, JSON.stringify({ you: list }));

/** The id and name of the user's active persona ("" and "" when there is none). */
function youOf(fsx) {
  const y = readJson(fsx, "you.json", null);
  const list = (isObj(y) && Array.isArray(y.personas) ? y.personas : []).filter((x) => isObj(x) && typeof x.id === "string" && ID.test(x.id) && str(x.name));
  const p = list.find((x) => isObj(y) && x.id === y.active) || list[0];
  return p ? { id: p.id, name: oneLine(p.name, 80) } : { id: "", name: "" };
}

/** What `id` holds of the people in its Life list: Map key ("c:<id>" or "u:<persona>") -> {fol, lvl, note}. Read only. */
function peopleOf(fsx, id) {
  const d = readJson(fsx, "life/people/" + id + ".json", null);
  const out = new Map();
  for (const p of isObj(d) && Array.isArray(d.people) ? d.people : []) {
    if (isObj(p) && typeof p.key === "string") out.set(p.key, { fol: p.fol === true, lvl: Math.max(0, LEVELS.indexOf(p.lvl)), note: oneLine(p.note, 300) });
  }
  return out;
}
const closeTo = (r) => !!r && (r.fol || r.lvl >= CLOSE_FROM);

/**
 * May the character `viewer` read `post` of `owner` (a profile id, or "you")? "all": yes. "me": only the owner. "friends": the owner, and
 * a friend: of the user, a character the user follows that follows the persona back; between two characters, each follows the other.
 * `ctx` = {follows, you, peopleFor}. The only rule of who reads what: anything that would show a post to a character asks it.
 */
export function canRead(ctx, viewer, owner, post) {
  if (post.visible === "all") return true;
  if (viewer === owner) return true;
  if (post.visible !== "friends") return false;
  const { follows, you, peopleFor } = ctx;
  if (owner === YOU) return follows.includes(viewer) && !!you.id && (peopleFor(viewer).get("u:" + you.id) || {}).fol === true;
  return (peopleFor(viewer).get("c:" + owner) || {}).fol === true && (peopleFor(owner).get("c:" + viewer) || {}).fol === true;
}

/** The context `canRead` needs, with the people lists read once each. */
function readCtx(fsx) {
  const people = new Map();
  return {
    follows: readFollows(fsx),
    you: youOf(fsx),
    peopleFor: (id) => {
      if (!people.has(id)) people.set(id, peopleOf(fsx, id));
      return people.get(id);
    },
  };
}

/** The characters that are friends of the user now. */
export function friendsOfUser(fsx) {
  const ctx = readCtx(fsx);
  return ctx.follows.filter((id) => canRead(ctx, id, YOU, { visible: "friends" })).map((id) => readProfile(fsx, id)).filter(Boolean).map((p) => ({ id: p.id, name: p.name, hue: p.hue, picture: p.picture }));
}

/**
 * One comment that could be written now: {profile, owner, post, comments, owed, note} or null. Rules only: the switch, Life on, a character
 * that is around, under its daily cap, a post of the last 3 days that it may read (`canRead`), not yet commented by it, under four comments by
 * characters, by someone it follows or is close to (the user's posts weigh more). `owed`: the user commented under a post of this very
 * character and nobody answered since: it comes first. `only: "owed"` looks for those alone (they ignore the chance).
 */
export function pickCommenter(c, rand, only) {
  const { fsx, settings, state, profiles, now } = c;
  if (!settings.comments || settings.commentsPerDay <= 0 || !settings.lifeOn) return null;
  const awake = profiles.filter((p) => p.lifeOn && ["online", "away"].includes(statusAt(p.schedule, new Date(now), settings.tz)) && (state.ccounts[p.id] || 0) < settings.commentsPerDay && now - (state.cfailedAt[p.id] || 0) >= FAIL_WAIT_MS && !(state.cpending[p.id] && now - state.cpending[p.id] < PENDING_MS));
  if (!awake.length) return null;
  const you = youOf(fsx);
  const ctx = readCtx(fsx);
  const peopleFor = ctx.peopleFor;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const cands = [];
  for (const owner of [YOU, ...ownerIds(fsx).filter((x) => x !== YOU)]) {
    if (owner !== YOU && !byId.has(owner)) continue;
    for (const post of readPosts(fsx, owner)) {
      if (post.visible === "me" || now - post.at > FRESH_MS) continue;
      const comments = readComments(fsx, post.id);
      const aiCount = comments.filter((m) => m.by !== YOU).length;
      const last = comments[comments.length - 1];
      for (const p of awake) {
        if (p.id === owner) {
          if (last && last.by === YOU) cands.push({ profile: p, owner, post, comments, owed: true, w: 6, note: "" });
          continue;
        }
        if (only === "owed" || aiCount >= AI_PER_POST || comments.some((m) => m.by === p.id) || !canRead(ctx, p.id, owner, post)) continue;
        const rel = peopleFor(p.id).get(owner === YOU ? "u:" + you.id : "c:" + owner);
        if (!closeTo(rel)) continue;
        cands.push({ profile: p, owner, post, comments, owed: false, w: (rel.fol ? 1.5 : 0) + (rel.lvl >= CLOSE_FROM ? 1 : 0) + rel.lvl * 0.2 + (owner === YOU ? 2 : 0), note: rel.note });
      }
    }
  }
  if (!cands.length) return null;
  const owed = cands.filter((x) => x.owed);
  const pool = owed.length ? owed : cands;
  let r = rand() * pool.reduce((s, x) => s + x.w, 0);
  for (const x of pool) {
    r -= x.w;
    if (r < 0) return x;
  }
  return pool[pool.length - 1];
}

export function commentSystem(p, ownerName, owed) {
  const lines = ["You are " + p.name + ", a character. You are reading a post in " + (owed ? "your own" : ownerName + "'s") + " journal and writing a short comment under it, in your own voice."];
  if (p.about) lines.push("Who you are: " + cut(p.about, 800));
  if (str(p.voice.text)) lines.push("How you write: " + cut(str(p.voice.text), 400));
  lines.push("Write in the language of your description above. One or two sentences, at most " + AI_COMMENT_MAX + " characters, plain text only: no hashtags, no quotation marks around it, no name label.");
  if (owed) lines.push("The last comment under your post is from someone who answered you: reply to them.");
  return lines.join("\n");
}

/** The post and the talk under it, quoted as data (no angle brackets). `names`: Map id -> name; "you" is the user's persona. */
export function commentUser(post, ownerName, comments, names, note) {
  const lines = ["Post by " + ownerName + (post.title ? ' titled "' + cut(post.title, 120) + '"' : "") + ":", cut(post.text, 800)];
  if (comments.length) {
    lines.push("", "Comments so far:");
    for (const m of comments.slice(-6)) lines.push("- " + (names.get(m.by) || "Someone") + ": " + cut(m.text.replace(/\s+/g, " "), 280));
  }
  if (note) lines.push("", "What you remember of " + ownerName + ": " + cut(note, 300));
  return lines.join("\n");
}

/** Files the model's comment ("jc:<commenter>:<owner>:<post>"). Returns {comment} or {error}. */
export function fileCommentResult(fsx, key, result, now, tz) {
  const m = /^jc:([A-Za-z0-9_-]{1,60}):([A-Za-z0-9_-]{1,60}):([A-Za-z0-9_-]{1,60})$/.exec(String(key));
  if (!m) return { error: "bad key" };
  const [, by, owner, postId] = m;
  const state = readState(fsx, now, tz);
  delete state.cpending[by];
  const fail = (error) => {
    state.cfailedAt[by] = now;
    writeState(fsx, state);
    return { error };
  };
  const profile = readProfile(fsx, by);
  if (!profile) return fail("the profile is gone");
  const post = readPosts(fsx, owner).find((p) => p.id === postId);
  if (!post || !canRead(readCtx(fsx), by, owner, post)) return fail("the post is gone");
  const r = isObj(result) ? result : {};
  if (r.error || !str(r.text)) return fail(r.error || "the model returned nothing");
  // a stray quotation mark around the answer, or the commenter's own name as a label, is not part of the comment
  const bare = String(r.text).trim().replace(/^["“”]+|["“”]+$/g, "");
  const text = body(bare.startsWith(profile.name + ":") ? bare.slice(profile.name.length + 1) : bare, AI_COMMENT_MAX);
  if (!text) return fail("the model returned no text");
  const list = readComments(fsx, postId);
  list.push({ id: "c-" + now + "-" + rid(), by, at: now, text });
  writeComments(fsx, postId, list);
  state.ccounts[by] = (state.ccounts[by] || 0) + 1;
  delete state.cfailedAt[by];
  writeState(fsx, state);
  return { comment: list[list.length - 1] };
}

// ---------- what is new for the user, the place of a post, the author's view (#453) ----------

const readSeen = (fsx) => {
  const d = readJson(fsx, SEEN, null);
  return isObj(d) && num(d.at) > 0 ? num(d.at) : 0;
};

/** New comments by characters under one post that concern the user: under the user's own post, or after the user commented there. */
export function freshFor(list, owner, seenAt) {
  const mine = owner === YOU;
  const firstMine = list.findIndex((m) => m.by === YOU);
  if (!mine && firstMine < 0) return 0;
  return list.filter((m, i) => m.by !== YOU && m.at > seenAt && (mine || i > firstMine)).length;
}

/** How many such comments the user has not seen, over the posts of the last 30 days. */
export function unreadCount(fsx, now) {
  const seenAt = readSeen(fsx);
  let n = 0;
  for (const o of [YOU, ...ownerIds(fsx).filter((x) => x !== YOU)]) {
    for (const p of readPosts(fsx, o)) if (now - p.at < 30 * 24 * 3600 * 1000) n += freshFor(readComments(fsx, p.id), o, seenAt);
  }
  return n;
}

/** `b.place` (a place id of the town, "" for none) as the place name of a post; absent keeps what `f` has. */
function withPlace(fsx, b, f) {
  if (!("place" in b)) return f;
  const out = { ...f };
  delete out.place;
  const id = String(b.place || "");
  if (!ID.test(id)) return out;
  const town = readJson(fsx, "city/places.json", null);
  const place = isObj(town) && Array.isArray(town.places) ? town.places.find((x) => isObj(x) && x.id === id) : null;
  const name = place ? oneLine(place.name, 60) : "";
  return name ? { ...out, place: name } : out;
}

export function readViews(fsx) {
  const d = readJson(fsx, VIEWS, null);
  const out = {};
  if (!isObj(d)) return out;
  for (const [owner, list] of Object.entries(d)) {
    if (!ID.test(owner) || !isObj(list)) continue;
    out[owner] = {};
    for (const [k, v] of Object.entries(list)) if ((k === YOU || ID.test(k)) && isObj(v) && str(v.text)) out[owner][k] = { text: oneLine(v.text, VIEW_MAX), at: num(v.at) };
  }
  return out;
}

/**
 * One author's view to word now: {profile, by, name, said} or null. Rules only: the comments switch, under the day's cap, nothing asked in the
 * last minutes, a character author with Life on, a commenter (a character, or the user) under its posts of the last 3 days that Life holds no
 * note on and that has no worded view yet.
 */
export function pickView(c) {
  const { fsx, settings, state, profiles, now } = c;
  if (!settings.comments || !settings.lifeOn || state.vcount >= VIEWS_PER_DAY) return null;
  if (now - state.vpending < PENDING_MS || now - state.vfailedAt < FAIL_WAIT_MS) return null;
  const views = readViews(fsx);
  const you = youOf(fsx);
  const names = new Map(profiles.map((p) => [p.id, p.name]));
  for (const p of profiles) {
    if (!p.lifeOn) continue;
    const people = peopleOf(fsx, p.id);
    const said = new Map();
    for (const post of readPosts(fsx, p.id)) {
      if (now - post.at > FRESH_MS) continue;
      for (const m of readComments(fsx, post.id)) if (m.by !== p.id) said.set(m.by, [...(said.get(m.by) || []), m.text]);
    }
    for (const [by, texts] of said) {
      if ((views[p.id] || {})[by]) continue;
      const rel = people.get(by === YOU ? "u:" + you.id : "c:" + by);
      if (rel && rel.note) continue;
      const name = by === YOU ? you.name || "the user" : names.get(by);
      if (!name) continue;
      return { profile: p, by, name, said: texts.slice(-3) };
    }
  }
  return null;
}

export function viewSystem(p) {
  const lines = ["You are " + p.name + ", a character. People commented under your journal posts; you think about one of them."];
  if (p.about) lines.push("Who you are: " + cut(p.about, 600));
  lines.push("Write in the language of your description above. One sentence, at most 160 characters, in the first person: what you make of this person from what they wrote. Plain text only.");
  return lines.join("\n");
}

export const viewUser = (name, said) => "What " + name + " wrote under your posts:\n" + said.map((x) => "- " + cut(x.replace(/\s+/g, " "), 280)).join("\n");

/** Files a worded view ("jv:<owner>:<commenter>"). Returns {view} or {error}. */
export function fileViewResult(fsx, key, result, now, tz) {
  const m = /^jv:([A-Za-z0-9_-]{1,60}):([A-Za-z0-9_-]{1,60})$/.exec(String(key));
  if (!m) return { error: "bad key" };
  const state = readState(fsx, now, tz);
  state.vpending = 0;
  const r = isObj(result) ? result : {};
  const text = r.error ? "" : oneLine(String(r.text || "").replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").replace(/^["“”]+|["“”]+$/g, ""), VIEW_MAX);
  if (!text || !readProfile(fsx, m[1])) {
    state.vfailedAt = now;
    writeState(fsx, state);
    return { error: r.error || "the model returned nothing" };
  }
  const views = readViews(fsx);
  views[m[1]] = { ...(views[m[1]] || {}), [m[2]]: { text, at: now } };
  fsx.write(VIEWS, JSON.stringify(views));
  state.vcount += 1;
  writeState(fsx, state);
  return { view: text };
}

// ---------- views ----------

const view = (owner, who, p) => ({
  id: p.id,
  owner,
  by: who.name,
  hue: who.hue,
  picture: who.picture,
  at: p.at,
  title: p.title,
  text: p.text,
  ...(p.image ? { image: p.image } : {}),
  ...(p.mood ? { mood: p.mood } : {}),
  ...(p.place ? { place: p.place } : {}),
  tags: p.tags,
  visible: p.visible,
  fromStory: p.from.startsWith("story:"),
  mine: owner === YOU,
});

const YOU_WHO = { name: "", hue: 200, picture: "" };

// ---------- routes ----------

function fieldsOf(b, base) {
  const out = { ...base };
  if ("title" in b) out.title = oneLine(b.title, TITLE_MAX);
  if ("text" in b) out.text = body(b.text, TEXT_MAX);
  if ("mood" in b) out.mood = oneLine(b.mood, MOOD_MAX);
  if ("tags" in b) out.tags = cleanTags(b.tags);
  if ("visible" in b && VISIBLE.includes(b.visible)) out.visible = b.visible;
  if (!out.mood) delete out.mood;
  return out;
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/journal" && !path.startsWith("/journal/")) return null;
  const fsx = host.fs;
  const now = Date.now();
  const b = isObj(req.body) ? req.body : {};
  const q = isObj(req.query) ? req.query : {};
  const settings = readSettings(fsx);

  if (path === "/journal/feed" && req.method === "GET") {
    const owner = typeof q.owner === "string" ? q.owner : "";
    const before = Number(q.before);
    const follows = readFollows(fsx);
    const owners = owner ? (ID.test(owner) ? [owner] : []) : q.follow === "1" ? follows : [YOU, ...ownerIds(fsx).filter((x) => x !== YOU)];
    const all = [];
    for (const o of owners) {
      const who = o === YOU ? YOU_WHO : readProfile(fsx, o);
      if (!who) continue;
      for (const p of readPosts(fsx, o)) all.push(view(o, who, p));
    }
    const sorted = all.filter((p) => !(before > 0) || p.at < before).sort((a, c) => c.at - a.at || (a.id < c.id ? 1 : -1));
    const seenAt = readSeen(fsx);
    const page = sorted.slice(0, PAGE).map((p) => {
      const list = readComments(fsx, p.id);
      const fresh = freshFor(list, p.owner, seenAt);
      return { ...p, comments: list.length, following: follows.includes(p.owner), ...(fresh ? { fresh } : {}) };
    });
    return ok({ on: settings.keep, posts: page, more: sorted.length > PAGE });
  }

  if (path === "/journal/post" && req.method === "POST") {
    const f = fieldsOf(b, { tags: [], visible: "all" });
    if (!f.text && !f.title) return ok({ error: "write something first" }, 400);
    const posts = readPosts(fsx, YOU);
    if (posts.length >= MAX_POSTS) return ok({ error: "the journal is full: remove an old post first" }, 409);
    const p = cleanPost({ ...withPlace(fsx, b, f), id: "j-" + now + "-" + rid(), at: now, from: "you" });
    if (!p) return ok({ error: "write something first" }, 400);
    posts.push(p);
    writePosts(fsx, YOU, posts);
    return ok({ post: view(YOU, YOU_WHO, p) });
  }

  if (path === "/journal/edit" && req.method === "POST") {
    const id = String(b.id || "");
    const posts = readPosts(fsx, YOU);
    const i = posts.findIndex((p) => p.id === id);
    if (i < 0) return ok({ error: "no such post" }, 404);
    const p = cleanPost(withPlace(fsx, b, fieldsOf(b, posts[i])));
    if (!p) return ok({ error: "a post needs some text or a title" }, 400);
    posts[i] = p;
    writePosts(fsx, YOU, posts);
    return ok({ post: view(YOU, YOU_WHO, p) });
  }

  if (path === "/journal/remove" && req.method === "POST") {
    const id = String(b.id || "");
    const owner = typeof b.owner === "string" && ID.test(b.owner) ? b.owner : "";
    for (const o of owner ? [owner] : ownerIds(fsx)) {
      const posts = readPosts(fsx, o);
      const gone = posts.find((p) => p.id === id);
      if (!gone) continue;
      writePosts(fsx, o, posts.filter((p) => p.id !== id));
      removeComments(fsx, id);
      if (gone.from.startsWith("story:")) {
        const m = readMirror(fsx);
        if (!m.done.includes(gone.from.slice(6))) writeMirror(fsx, { stories: m.stories, done: [...m.done, gone.from.slice(6)] });
      }
      return ok({ ok: true });
    }
    return ok({ error: "no such post" }, 404);
  }

  if (path === "/journal/images" && req.method === "GET") {
    const items = [];
    for (const o of ownerIds(fsx)) {
      const who = readProfile(fsx, o);
      if (!who) continue;
      for (const p of readPosts(fsx, o)) if (p.image && p.image.state === "pending") items.push({ id: p.id, owner: o, at: p.at, prompt: p.image.prompt, model: who.imageModel || settings.imageModel });
    }
    return ok({ items: items.sort((a, c) => a.at - c.at).slice(0, 5).map(({ at: _at, ...rest }) => rest) });
  }

  if (path === "/journal/image" && req.method === "POST") {
    const owner = String(b.owner || "");
    if (!ID.test(owner)) return ok({ error: "no such picture" }, 404);
    const posts = readPosts(fsx, owner);
    const p = posts.find((x) => x.id === String(b.id || ""));
    if (!p || !p.image || p.image.state !== "pending") return ok({ error: "no such picture" }, 404);
    p.image = typeof b.url === "string" && ASSET.test(b.url) ? { state: "ready", url: b.url, gen: true } : { state: "failed", prompt: p.image.prompt, gen: true };
    writePosts(fsx, owner, posts);
    return ok({ ok: true, state: p.image.state });
  }

  if (path === "/journal/comments" && req.method === "GET") {
    const owner = typeof q.owner === "string" ? q.owner : "";
    const postId = typeof q.post === "string" ? q.post : "";
    const post = ID.test(owner) && ID.test(postId) ? readPosts(fsx, owner).find((p) => p.id === postId) : null;
    if (!post) return ok({ error: "no such post" }, 404);
    const you = youOf(fsx);
    const ownerPeople = owner === YOU ? null : peopleOf(fsx, owner);
    // (#453) when Life holds no note on the commenter, the view a model worded once (journal/views.json)
    const worded = owner === YOU ? {} : readViews(fsx)[owner] || {};
    const comments = [];
    for (const m of readComments(fsx, postId)) {
      if (m.by === YOU) {
        const opinion = ownerPeople && you.id ? ownerPeople.get("u:" + you.id) : null;
        const seen = opinion && opinion.note ? opinion.note : (worded[YOU] || {}).text;
        comments.push({ id: m.id, by: YOU, name: you.name, hue: 210, picture: "", at: m.at, text: m.text, mine: true, ...(seen ? { view: seen } : {}) });
        continue;
      }
      const p = readProfile(fsx, m.by);
      if (!p) continue;
      const opinion = ownerPeople && m.by !== owner ? ownerPeople.get("c:" + m.by) : null;
      const seen = m.by === owner ? "" : opinion && opinion.note ? opinion.note : (worded[m.by] || {}).text;
      comments.push({ id: m.id, by: m.by, name: p.name, hue: p.hue, picture: p.picture, at: m.at, text: m.text, mine: false, ...(seen ? { view: seen } : {}) });
    }
    return ok({ comments });
  }

  if (path === "/journal/comment" && req.method === "POST") {
    const owner = String(b.owner || "");
    const postId = String(b.post || "");
    const post = ID.test(owner) && ID.test(postId) ? readPosts(fsx, owner).find((p) => p.id === postId) : null;
    if (!post) return ok({ error: "no such post" }, 404);
    if (post.visible === "me" && owner !== YOU) return ok({ error: "no such post" }, 404);
    const text = body(b.text, COMMENT_MAX);
    if (!text) return ok({ error: "write something first" }, 400);
    const list = readComments(fsx, postId);
    if (list.length >= COMMENTS_KEEP) return ok({ error: "this post has too many comments" }, 409);
    const c = { id: "c-" + now + "-" + rid(), by: YOU, at: now, text };
    list.push(c);
    writeComments(fsx, postId, list);
    return ok({ comment: { ...c, name: youOf(fsx).name, hue: 210, picture: "", mine: true } });
  }

  if (path === "/journal/comment/remove" && req.method === "POST") {
    const postId = String(b.post || "");
    if (!ID.test(postId)) return ok({ error: "no such comment" }, 404);
    const list = readComments(fsx, postId);
    const id = String(b.id || "");
    if (!list.some((m) => m.id === id)) return ok({ error: "no such comment" }, 404);
    writeComments(fsx, postId, list.filter((m) => m.id !== id));
    return ok({ ok: true });
  }

  if (path === "/journal/visible" && req.method === "POST") {
    const owner = String(b.owner || "");
    if (!(owner === YOU || ID.test(owner)) || !VISIBLE.includes(b.visible)) return ok({ error: "no such post" }, 404);
    const posts = readPosts(fsx, owner);
    const p = posts.find((x) => x.id === String(b.id || ""));
    if (!p) return ok({ error: "no such post" }, 404);
    p.visible = b.visible;
    writePosts(fsx, owner, posts);
    return ok({ ok: true, visible: p.visible });
  }

  if (path === "/journal/unread" && req.method === "GET") return ok({ unread: unreadCount(fsx, now) });

  if (path === "/journal/seen" && req.method === "POST") {
    fsx.write(SEEN, JSON.stringify({ at: now }));
    return ok({ ok: true });
  }

  if (path === "/journal/friends" && req.method === "GET") return ok({ friends: friendsOfUser(fsx) });

  if (path === "/journal/follow" && req.method === "POST") {
    const id = String(b.id || "");
    if (!ID.test(id) || id === YOU || !readProfile(fsx, id)) return ok({ error: "no such character" }, 404);
    const list = readFollows(fsx).filter((x) => x !== id);
    if (b.on !== false) list.push(id);
    writeFollows(fsx, list);
    return ok({ ok: true, following: b.on !== false });
  }

  return ok({ error: "not found" }, 404);
}

// ---------- onTick ----------

/** One tick: copy the live stories, file the ones that ran out, and clear the journals of characters that are gone. */
export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return;
  const now = Date.now();
  const settings = readSettings(fsx);
  const { keep } = settings;
  const before = readMirror(fsx);
  const { mirror, filed } = mirrorPass(before, keep ? readStories(fsx) : [], now, keep);
  for (const [owner, list] of Object.entries(filed)) {
    if (!readProfile(fsx, owner)) continue;
    const posts = readPosts(fsx, owner).concat(list).sort((a, c) => a.at - c.at);
    writePosts(fsx, owner, posts.slice(-MAX_POSTS));
  }
  if (JSON.stringify(mirror) !== JSON.stringify(before)) writeMirror(fsx, mirror);
  // a deleted character takes its journal with it (an empty profiles folder may be a failed read: then nothing is cleared)
  const ids = profileIds(fsx);
  if (ids.length) for (const o of ownerIds(fsx)) if (o !== YOU && !ids.includes(o)) fsx.remove(ownerPath(o));
  writeNow(fsx, host, settings, now);
}

/** J2 and J3: file what the model wrote (posts and comments), else ask for one thing: an owed reply first, then, by chance, a comment or a post. */
function writeNow(fsx, host, settings, now) {
  if (!host.llm) return;
  const results = host.llm.results || {};
  const keys = Object.keys(results).filter((k) => k.startsWith("jp:") || k.startsWith("jc:") || k.startsWith("jv:"));
  if (keys.length) {
    for (const k of keys) {
      if (k.startsWith("jp:")) fileWriterResult(fsx, k, results[k], now, settings.tz);
      else if (k.startsWith("jv:")) fileViewResult(fsx, k, results[k], now, settings.tz);
      else fileCommentResult(fsx, k, results[k], now, settings.tz);
    }
    return;
  }
  if (!settings.posts && !settings.comments) return;
  const state = readState(fsx, now, settings.tz);
  const profiles = profileIds(fsx).map((id) => readProfile(fsx, id)).filter(Boolean);
  const c = { fsx, settings, state, profiles, now };
  const askComment = (pick) => {
    state.cpending[pick.profile.id] = now;
    writeState(fsx, state);
    const ownerName = pick.owner === YOU ? youOf(fsx).name || "the user" : (profiles.find((p) => p.id === pick.owner) || { name: "someone" }).name;
    const names = new Map(profiles.map((p) => [p.id, p.name]));
    names.set(YOU, youOf(fsx).name || "The user");
    const model = pick.profile.model || settings.model;
    host.llm.request("jc:" + pick.profile.id + ":" + pick.owner + ":" + pick.post.id, {
      ...(model ? { model } : {}),
      systemPrompt: commentSystem(pick.profile, ownerName, pick.owed),
      messages: [{ role: "user", content: commentUser(pick.post, ownerName, pick.comments, names, pick.note) }],
      presetParams: { temperature: 0.9, max_tokens: 160 },
    });
  };
  const askPost = (pick) => {
    state.pending[pick.profile.id] = { at: now, entries: pick.entries.map((e) => e.id) };
    writeState(fsx, state);
    const model = pick.profile.model || settings.model;
    host.llm.request("jp:" + pick.profile.id, {
      ...(model ? { model } : {}),
      systemPrompt: postSystem(pick.profile, settings.pictures),
      messages: [{ role: "user", content: postUser(pick.entries) }],
      presetParams: { temperature: 0.9, max_tokens: 400 },
    });
  };
  // someone answered a character under its own post: it replies, whatever the chance
  const owed = pickCommenter(c, Math.random, "owed");
  if (owed) return askComment(owed);
  // (#453) an author who has no view of a commenter words one, once (capped a day)
  const v = pickView(c);
  if (v) {
    state.vpending = now;
    writeState(fsx, state);
    const model = v.profile.model || settings.model;
    host.llm.request("jv:" + v.profile.id + ":" + v.by, {
      ...(model ? { model } : {}),
      systemPrompt: viewSystem(v.profile),
      messages: [{ role: "user", content: viewUser(v.name, v.said) }],
      presetParams: { temperature: 0.7, max_tokens: 120 },
    });
    return;
  }
  if (Math.random() >= CHANCE) return;
  const tries = Math.random() < 0.5 ? ["comment", "post"] : ["post", "comment"];
  for (const t of tries) {
    const pick = t === "comment" ? pickCommenter(c, Math.random) : pickWriter(c, Math.random);
    if (!pick) continue;
    return t === "comment" ? askComment(pick) : askPost(pick);
  }
}

// <city-shared>
/** Where character `id` is now, from the city's file (read only): {place: {id, name}, here: [profile ids]}, or null (at home, no city, a file of another band). Identical in every plugin that reads it: test/city-readers.test.ts pins the copies. */
function cityNow(fsx, id, now, tz) {
  try {
    const off = Number.isFinite(tz) ? tz : new Date(now).getTimezoneOffset();
    const local = new Date(now - off * 60000);
    const band = local.toISOString().slice(0, 10) + "#" + Math.floor(local.getUTCHours() / 3);
    const d = JSON.parse(fsx.read("city/now.json"));
    if (!d || typeof d !== "object" || d.id !== band || !d.where || typeof d.where !== "object") return null;
    const ok = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(s);
    const at = d.where[id];
    if (!ok(at) || at === "home") return null;
    const town = JSON.parse(fsx.read("city/places.json"));
    const place = town && Array.isArray(town.places) ? town.places.find((p) => p && p.id === at) : null;
    if (!place || typeof place.name !== "string") return null;
    const name = place.name.replace(/<[^>]*>/g, " ").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) return null;
    return { place: { id: at, name }, here: Object.keys(d.where).filter((k) => k !== id && d.where[k] === at && ok(k)) };
  } catch {
    return null;
  }
}
// </city-shared>
