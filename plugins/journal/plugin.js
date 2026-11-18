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
 * again while the stories file still holds it). `visible` is stored for the later phases (J4); in J1 only the user reads the journal.
 *
 * Routes (relative to /v1/apps/social):
 *   GET  /journal/feed?owner=<id|you>&before=<at>   {on, posts: [view], more}: newest first, 30 a page, all journals or one
 *   POST /journal/post {title?, text, mood?, tags?, visible?}   the user writes a post
 *   POST /journal/edit {id, title?, text?, mood?, tags?, visible?}   the user edits one of their own posts
 *   POST /journal/remove {id}      the user removes a post (their own, or a character's)
 *   GET  /journal/images           the pictures nobody has drawn yet: {items: [{id, owner, prompt, model}]}
 *   POST /journal/image {owner, id, url? | error?}   the page files a drawn picture (or says it failed)
 *
 * Permissions: routes, fs, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const YOU = "you";
/** File names in journal/ that are not a journal. A profile can not have these ids. */
const RESERVED = ["mirror", "state"];
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
const ASSET = /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/;
const MIRROR = "journal/mirror.json";
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
  return { id: x.id, by: x.by, at: x.at, text: oneLine(x.text, 140), ...(image ? { image } : {}) };
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
export const postFromStory = (s) => ({ id: "j-" + s.id, at: s.at, title: "", text: s.text, ...(s.image ? { image: s.image } : {}), tags: [], visible: "all", from: "story:" + s.id });

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
  return { day, counts, used, pending, failedAt: timeMap(r.failedAt) };
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

export function postSystem(p) {
  const lines = ["You are " + p.name + ", a character. You are writing a post in your own journal, the kind of blog post your friends read, in your own voice."];
  if (p.about) lines.push("Who you are: " + cut(p.about, 800));
  if (str(p.voice.text)) lines.push("How you write: " + cut(str(p.voice.text), 400));
  lines.push("Write in the language of your description above. Say something true to the diary lines below; do not invent big events or people.");
  lines.push('Answer with JSON only: {"title": "at most 60 characters", "text": "two to five sentences, at most 700 characters", "mood": "one word", "tags": ["up to three short tags"]}');
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
  const post = cleanPost({ id: "j-d-" + now + "-" + rid(), at: now, title: j ? j.title : "", text, mood: j ? j.mood : "", tags: j ? j.tags : [], visible: "all", from: "diary:" + (entries[0] || "x") });
  if (!post) return fail("the model returned nothing usable");
  const posts = readPosts(fsx, m[1]).concat(post).sort((a, b) => a.at - b.at);
  writePosts(fsx, m[1], posts.slice(-MAX_POSTS));
  state.counts[m[1]] = (state.counts[m[1]] || 0) + 1;
  state.used[m[1]] = [...(state.used[m[1]] || []), ...entries].slice(-30);
  delete state.failedAt[m[1]];
  writeState(fsx, state);
  return { post };
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
    const owners = owner ? (ID.test(owner) ? [owner] : []) : [YOU, ...ownerIds(fsx).filter((x) => x !== YOU)];
    const all = [];
    for (const o of owners) {
      const who = o === YOU ? YOU_WHO : readProfile(fsx, o);
      if (!who) continue;
      for (const p of readPosts(fsx, o)) all.push(view(o, who, p));
    }
    const sorted = all.filter((p) => !(before > 0) || p.at < before).sort((a, c) => c.at - a.at || (a.id < c.id ? 1 : -1));
    return ok({ on: settings.keep, posts: sorted.slice(0, PAGE), more: sorted.length > PAGE });
  }

  if (path === "/journal/post" && req.method === "POST") {
    const f = fieldsOf(b, { tags: [], visible: "all" });
    if (!f.text && !f.title) return ok({ error: "write something first" }, 400);
    const posts = readPosts(fsx, YOU);
    if (posts.length >= MAX_POSTS) return ok({ error: "the journal is full: remove an old post first" }, 409);
    const p = cleanPost({ ...f, id: "j-" + now + "-" + rid(), at: now, from: "you" });
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
    const p = cleanPost(fieldsOf(b, posts[i]));
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

/** J2: file the posts the model wrote, else (a chance a tick) ask one character to write. */
function writeNow(fsx, host, settings, now) {
  if (!host.llm) return;
  const results = host.llm.results || {};
  const keys = Object.keys(results).filter((k) => k.startsWith("jp:"));
  if (keys.length) {
    for (const k of keys) fileWriterResult(fsx, k, results[k], now, settings.tz);
    return;
  }
  if (!settings.posts || Math.random() >= CHANCE) return;
  const state = readState(fsx, now, settings.tz);
  const profiles = profileIds(fsx).map((id) => readProfile(fsx, id)).filter(Boolean);
  const pick = pickWriter({ fsx, settings, state, profiles, now }, Math.random);
  if (!pick) return;
  state.pending[pick.profile.id] = { at: now, entries: pick.entries.map((e) => e.id) };
  writeState(fsx, state);
  const model = pick.profile.model || settings.model;
  host.llm.request("jp:" + pick.profile.id, {
    ...(model ? { model } : {}),
    systemPrompt: postSystem(pick.profile),
    messages: [{ role: "user", content: postUser(pick.entries) }],
    presetParams: { temperature: 0.9, max_tokens: 400 },
  });
}
