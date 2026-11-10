/**
 * Social stories (issue #358): a character now and then posts a story, a short line (and a picture, when pictures are on) that
 * disappears after 24 hours. It is made from the character's own diary of today (the Life plugin writes it, only read here), so it
 * says something true about the day; the picture goes through the same worker as the pictures in messages and posts: a plugin can
 * only write text, so the story is filed with a `pending` image and the Social page draws it (src/pictures/worker.ts).
 *
 * Data: stories/items.json {day, counts: {profileId: n today}, stories: [{id, by, name, hue, picture?, at, text, image?}],
 * seen: [ids], used: {profileId: [diary entry ids]}, pending: {profileId: at}, failedAt: {profileId: at}}.
 * Settings (settings.json `community`): stories (switch, off by default), storiesPerDay per character; `images.on` decides
 * whether a story has a picture (without it, one model-free text story from the diary line).
 *
 * Routes (relative to /v1/apps/social):
 *   GET  /stories                  {stories: [{id, by, name, hue, picture, at, until, text, image?, seen}], on}: the live ones, newest first
 *   POST /stories/seen {id}        the user saw it
 *   POST /stories/remove {id}      the user removes it
 *   GET  /stories/images           the pictures nobody has drawn yet: {items: [{id, prompt, model}]}
 *   POST /stories/image {id, url? | error?}   the page files a drawn picture (or says it failed)
 *
 * Permissions: routes, fs, llm, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const STATUSES = ["online", "away", "dnd", "na", "off"];
const STORY_MS = 24 * 3600 * 1000;
const CHANCE = 0.1;
const MAX_LIVE = 24;
const FAIL_WAIT_MS = 30 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;
const CAPTION_MAX = 140;
const FILE = "stories/items.json";

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
const noControls = (s) => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch)).join("");
const oneLine = (v, n) => cut(noControls(String(typeof v === "string" ? v : "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), n);
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
const ASSET = /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/;

// ---------- time (copies of the forum's) ----------

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

// ---------- settings, profiles, diary ----------

export function readSettings(fsx) {
  const r = readJson(fsx, "settings.json", null);
  const raw = isObj(r) ? r : {};
  const c = isObj(raw.community) ? raw.community : {};
  const im = isObj(raw.images) ? raw.images : {};
  const l = isObj(raw.life) ? raw.life : {};
  const m = isObj(raw.models) ? raw.models : {};
  return {
    on: c.stories === true,
    perDay: Number.isInteger(c.storiesPerDay) && c.storiesPerDay >= 0 && c.storiesPerDay <= 10 ? c.storiesPerDay : 1,
    pictures: im.on === true,
    lifeOn: l.on !== false,
    model: modelRef(m.forum),
    imageModel: modelRef(m.image),
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
    lifeOn: !isObj(p.life) || p.life.on !== false,
    model: modelRef(p.model),
    imageModel: modelRef(p.imageModel),
  };
}

function profileIds(fsx) {
  try {
    return fsx.list("profiles").map((n) => /^([A-Za-z0-9_-]{1,60})\.json$/.exec(n)).filter(Boolean).map((m) => m[1]);
  } catch {
    return [];
  }
}

/** The diary entries of today the character wrote itself: [{id, text}]. */
function todaysEntries(fsx, id, day) {
  const d = readJson(fsx, "life/diary/" + id + ".json", null);
  const list = isObj(d) && Array.isArray(d.entries) ? d.entries : [];
  return list.filter((e) => isObj(e) && typeof e.id === "string" && ID.test(e.id) && e.day === day && e.by !== "you" && e.kind !== "you" && str(e.text)).map((e) => ({ id: e.id, text: str(e.text) }));
}

// ---------- the file ----------

export function cleanImage(raw) {
  if (!isObj(raw)) return null;
  if (raw.state === "ready" && typeof raw.url === "string" && ASSET.test(raw.url)) return { state: "ready", url: raw.url, ...(str(raw.alt) ? { alt: oneLine(raw.alt, 200) } : {}), gen: true };
  if ((raw.state === "pending" || raw.state === "failed") && str(raw.prompt)) return { state: raw.state, prompt: oneLine(raw.prompt, 400), gen: true };
  return null;
}

function cleanStory(x) {
  if (!isObj(x) || typeof x.id !== "string" || !ID.test(x.id) || typeof x.by !== "string" || !ID.test(x.by) || !Number.isFinite(x.at) || !str(x.text)) return null;
  const image = cleanImage(x.image);
  return { id: x.id, by: x.by, name: oneLine(x.name, 80), hue: Number.isFinite(x.hue) ? x.hue : 200, ...(typeof x.picture === "string" && ASSET.test(x.picture) ? { picture: x.picture } : {}), at: x.at, text: oneLine(x.text, CAPTION_MAX), ...(image ? { image } : {}) };
}

const idMap = (v, cap) => {
  const out = {};
  if (isObj(v)) for (const [k, list] of Object.entries(v)) if (ID.test(k) && Array.isArray(list)) out[k] = list.filter((x) => typeof x === "string" && ID.test(x)).slice(-cap);
  return out;
};
const timeMap = (v) => {
  const out = {};
  if (isObj(v)) for (const [k, t] of Object.entries(v)) if (ID.test(k) && num(t) > 0) out[k] = num(t);
  return out;
};

export function readFile(fsx, now, tz) {
  const d = readJson(fsx, FILE, null);
  const r = isObj(d) ? d : {};
  const day = localDay(now, tz);
  const same = r.day === day;
  const counts = {};
  if (same && isObj(r.counts)) for (const [k, v] of Object.entries(r.counts)) if (ID.test(k) && num(v) > 0) counts[k] = Math.floor(num(v));
  return {
    day,
    counts,
    stories: (Array.isArray(r.stories) ? r.stories : []).map(cleanStory).filter((s) => s && now - s.at < STORY_MS),
    seen: (Array.isArray(r.seen) ? r.seen : []).filter((x) => typeof x === "string" && ID.test(x)).slice(-200),
    used: idMap(r.used, 30),
    pending: timeMap(r.pending),
    failedAt: timeMap(r.failedAt),
  };
}

const writeFile = (fsx, f) => fsx.write(FILE, JSON.stringify(f));

// ---------- choosing and wording ----------

/** One story that could be made now: {profile, entry} or null. Rules only: the switch, a character that is around, under its daily cap, with a diary line of today it has not used. */
export function pickStory(c, rand) {
  const { fsx, settings, file, profiles, now } = c;
  if (!settings.on || settings.perDay <= 0 || !settings.lifeOn || file.stories.length >= MAX_LIVE) return null;
  const cands = [];
  for (const p of profiles) {
    if (!p.lifeOn || !["online", "away"].includes(statusAt(p.schedule, new Date(now), settings.tz))) continue;
    if ((file.counts[p.id] || 0) >= settings.perDay) continue;
    if (now - (file.failedAt[p.id] || 0) < FAIL_WAIT_MS || now - (file.pending[p.id] || 0) < PENDING_MS) continue;
    const used = file.used[p.id] || [];
    for (const e of todaysEntries(fsx, p.id, file.day)) if (!used.includes(e.id)) cands.push({ profile: p, entry: e });
  }
  return cands.length ? cands[Math.floor(rand() * cands.length)] : null;
}

export function storySystem(p) {
  const lines = ["You are " + p.name + ", a character. You are posting a story: one short line and one picture that vanish after a day, like a social network story, in your own voice."];
  if (p.about) lines.push("Who you are: " + cut(p.about, 800));
  if (str(p.voice.text)) lines.push("How you write: " + cut(str(p.voice.text), 400));
  lines.push("Write in the language of your description above. Say something true to the line from your diary below; do not invent big events.");
  lines.push('Answer with JSON only: {"caption": "the line, at most 140 characters", "image": "what the picture shows, one plain English sentence, no names"}');
  return lines.join("\n");
}

export const storyUser = (entry) => "Your diary line from today: " + cut(entry.text, 400);

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

/** The first sentence or two of a diary line, up to the caption limit: the story of a day with no pictures. */
export function captionFrom(text) {
  const t = oneLine(text, 400);
  const m = /^(.{20,140}?[.!?…])(\s|$)/.exec(t);
  return cut(m ? m[1] : t, CAPTION_MAX);
}

function addStory(file, p, text, image, entryId, now) {
  const story = { id: "s-" + now + "-" + rid(), by: p.id, name: p.name, hue: p.hue, ...(p.picture ? { picture: p.picture } : {}), at: now, text, ...(image ? { image } : {}) };
  file.stories.push(story);
  file.counts[p.id] = (file.counts[p.id] || 0) + 1;
  file.used[p.id] = [...(file.used[p.id] || []), entryId].slice(-30);
  delete file.pending[p.id];
  return story;
}

/** Files the model's story ("st:<profile>:<entry>"). Returns {story} or {error}. */
export function fileStoryResult(fsx, key, result, now, tz) {
  const m = /^st:([A-Za-z0-9_-]{1,60}):([A-Za-z0-9_-]{1,60})$/.exec(String(key));
  if (!m) return { error: "bad key" };
  const file = readFile(fsx, now, tz);
  const p = readProfile(fsx, m[1]);
  delete file.pending[m[1]];
  const fail = (error) => {
    file.failedAt[m[1]] = now;
    writeFile(fsx, file);
    return { error };
  };
  if (!p) return fail("the profile is gone");
  const r = isObj(result) ? result : {};
  if (r.error || !str(r.text)) return fail(r.error || "the model returned nothing");
  const j = parseJsonReply(r.text);
  const caption = j ? oneLine(j.caption, CAPTION_MAX) : oneLine(r.text, CAPTION_MAX);
  const prompt = j ? oneLine(j.image, 300) : "";
  if (!caption) return fail("the model returned no caption");
  const story = addStory(file, p, caption, prompt ? { state: "pending", prompt, gen: true } : null, m[2], now);
  writeFile(fsx, file);
  return { story };
}

// ---------- routes ----------

const view = (s, seen) => ({ id: s.id, by: s.by, name: s.name, hue: s.hue, picture: s.picture || "", at: s.at, until: s.at + STORY_MS, text: s.text, ...(s.image ? { image: s.image } : {}), seen: seen.includes(s.id) });

function imageModelFor(fsx, profile, settings) {
  const own = profile ? profile.imageModel : "";
  return own || settings.imageModel;
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/stories" && !path.startsWith("/stories/")) return null;
  const fsx = host.fs;
  const now = Date.now();
  const settings = readSettings(fsx);
  const file = readFile(fsx, now, settings.tz);
  const b = isObj(req.body) ? req.body : {};
  if (path === "/stories" && req.method === "GET") return ok({ on: settings.on, stories: file.stories.slice().sort((a, c) => c.at - a.at).map((s) => view(s, file.seen)) });
  if (path === "/stories/seen" && req.method === "POST") {
    const id = String(b.id || "");
    if (!file.stories.some((s) => s.id === id)) return ok({ error: "no such story" }, 404);
    if (!file.seen.includes(id)) file.seen.push(id);
    writeFile(fsx, file);
    return ok({ ok: true });
  }
  if (path === "/stories/remove" && req.method === "POST") {
    const id = String(b.id || "");
    if (!file.stories.some((s) => s.id === id)) return ok({ error: "no such story" }, 404);
    file.stories = file.stories.filter((s) => s.id !== id);
    writeFile(fsx, file);
    return ok({ ok: true });
  }
  if (path === "/stories/images" && req.method === "GET") {
    const items = file.stories
      .filter((s) => s.image && s.image.state === "pending")
      .sort((a, c) => a.at - c.at)
      .slice(0, 5)
      .map((s) => ({ id: s.id, prompt: s.image.prompt, model: imageModelFor(fsx, readProfile(fsx, s.by), settings) }));
    return ok({ items });
  }
  if (path === "/stories/image" && req.method === "POST") {
    const s = file.stories.find((x) => x.id === String(b.id || ""));
    if (!s || !s.image || s.image.state !== "pending") return ok({ error: "no such picture" }, 404);
    if (typeof b.url === "string" && ASSET.test(b.url)) s.image = { state: "ready", url: b.url, gen: true };
    else s.image = { state: "failed", prompt: s.image.prompt, gen: true };
    writeFile(fsx, file);
    return ok({ ok: true, state: s.image.state });
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
  const keys = Object.keys(results).filter((k) => k.startsWith("st:"));
  if (keys.length) {
    for (const k of keys) fileStoryResult(fsx, k, results[k], now, settings.tz);
    return;
  }
  const file = readFile(fsx, now, settings.tz);
  // the sweep: what is older than a day is gone (the file is rewritten when it lost one, or when the day turned)
  const before = (isObj(readJson(fsx, FILE, null)) && Array.isArray(readJson(fsx, FILE, null).stories) ? readJson(fsx, FILE, null).stories.length : 0);
  if (before !== file.stories.length) writeFile(fsx, file);
  if (!settings.on || Math.random() >= CHANCE) return;
  const profiles = profileIds(fsx).map((id) => readProfile(fsx, id)).filter(Boolean);
  const pick = pickStory({ fsx, settings, file, profiles, now }, Math.random);
  if (!pick) return;
  if (!settings.pictures) {
    // no pictures: the story is the diary line itself, no model call
    addStory(file, pick.profile, captionFrom(pick.entry.text), null, pick.entry.id, now);
    writeFile(fsx, file);
    return;
  }
  file.pending[pick.profile.id] = now;
  writeFile(fsx, file);
  const model = pick.profile.model || settings.model;
  host.llm.request("st:" + pick.profile.id + ":" + pick.entry.id, {
    ...(model ? { model } : {}),
    systemPrompt: storySystem(pick.profile),
    messages: [{ role: "user", content: storyUser(pick.entry) }],
    presetParams: { temperature: 0.9, max_tokens: 200 },
  });
}
