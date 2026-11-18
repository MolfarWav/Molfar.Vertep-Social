/**
 * Social city (issue #445, phase C1): a town the characters live in. Districts, places, a home for every profile, and where each
 * character is right now. All by rules, no model call, read-only for the user in this phase.
 *
 * Data (this plugin is the only writer of city/*):
 *   city/places.json  {districts: [{id, name, kind, order}], places: [{id, district, name, kind, icon, text, open, tags, seats, by}]}
 *                     `open` is 8 bands of 3 hours by 7 days from Monday (the schedule's shape), 1 = open. The stock town is an ordinary
 *                     present-day town with no real city, country or brand: plain names. It is written once, so later phases (own places,
 *                     packs) edit records, not code.
 *   city/homes.json   {buildings: [{id, n, flats}], flats: {<profileId>: {b: buildingId, n: flatNumber}}}: every profile has exactly one
 *                     flat; when the buildings are full the next one appears. Two profiles may point at one flat later (shared flats).
 *   city/now.json     {id: "<local day>#<band>", at, where: {<profileId>: <placeId> | "home"}}, written once per band by the tick.
 * Who is where (`placeAt`, rules only, the same answer for the same profile and band): status off = home; na or dnd in a work band = the
 * profile's `workplace` (a place id, empty by default and not editable yet) else home; online or away = a seeded draw over the open
 * places with free seats and home, weighted by the place's tags against the profile's interests and by followed or close people who are
 * already there. A profile with life switched off stays at home.
 *
 * Routes (relative to /v1/apps/social):
 *   GET /city/listen?place=   {place, present, lines: [{id, by, name, hue, picture, at, text, via: "chatter" | "club"}]}: the last lines (at most 6, from
 *                             the last 3 days) that characters who are at this place now wrote to each other in chatter or in a club; read only
 *                             (the chatter and clubs files are those plugins'; the user's own lines are left out)
 *   GET /city   {band, from, to, districts: [{id, name, kind, by, places: [{id, name, kind, icon, text, by, open, seats, people: [person]}]}],
 *                homes: {buildings: [{id, n, doors: [{id, name, hue, picture, flat, state: "lit"|"dark"|"out", where?}]}]}, you: {...}, empty}
 *
 * Permissions: routes, fs, schedule.
 */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const STATUSES = ["online", "away", "dnd", "na", "off"];
const LEVELS = ["stranger", "slight", "acquaintance", "penfriend", "friend", "close", "confidant"];
const KNOW_FROM = LEVELS.indexOf("acquaintance");
const CLOSE_FROM = LEVELS.indexOf("penfriend");
const FLATS_PER_BUILDING = 8;
const LISTEN_LINES = 6;
const LISTEN_MS = 3 * 24 * 3600 * 1000;
const TEXT_MAX = 600;
const MAX_PLACES = 60;
const MAX_DISTRICTS = 12;
const HOME = "home";
const ASSET = /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/;
const KINDS = ["cafe", "park", "library", "shop", "workplace", "club", "home", "custom"];
const DISTRICT_KINDS = ["centre", "homes", "work", "nature", "custom"];

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ok = (json, status) => ({ status: status || 200, json });
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n));
const oneLine = (v, n) => cut(Array.from(String(typeof v === "string" ? v : ""), (ch) => (ch.charCodeAt(0) < 32 ? " " : ch)).join("").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), n);
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};

// ---------- time (copies of the stories plugin's) ----------

const offsetOf = (now, tz) => (Number.isFinite(tz) ? tz : new Date(now).getTimezoneOffset());
export const localDay = (now, tz) => new Date(now - offsetOf(now, tz) * 60000).toISOString().slice(0, 10);

/** The 3-hour band (0..7) and the weekday (0 = Monday) of `now` in the user's time. */
export function bandNow(now, tz) {
  const local = new Date(now - offsetOf(now, tz) * 60000);
  return { band: Math.floor(local.getUTCHours() / 3), weekday: (local.getUTCDay() + 6) % 7, day: localDay(now, tz) };
}

/** The status a profile has at `date`: schedule[band][day] (8 bands of 3 hours by 7 days from Monday), in the user's time. */
export function statusAt(schedule, date, tz) {
  const { band, weekday } = bandNow(date.getTime(), tz);
  const row = Array.isArray(schedule) ? schedule[band] : null;
  const s = Array.isArray(row) ? row[weekday] : null;
  return STATUSES.includes(s) ? s : "off";
}

// ---------- the stock town ----------

const grid = (fromBand, toBand, days) => Array.from({ length: 8 }, (_, b) => Array.from({ length: 7 }, (_, d) => (b >= fromBand && b < toBand && days.includes(d) ? 1 : 0)));
const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEK = [0, 1, 2, 3, 4];
const NOT_SUN = [0, 1, 2, 3, 4, 5];

/** An ordinary present-day town, a place between worlds: no real city, country or brand, plain names. */
export const stockTown = () => ({
  districts: [
    { id: "centre", name: "Centre", kind: "centre", order: 1 },
    { id: "nature", name: "Nature", kind: "nature", order: 2 },
    { id: "work", name: "Work", kind: "work", order: 3 },
    { id: "homes", name: "Homes", kind: "homes", order: 4 },
  ],
  places: [
    { id: "cafe", district: "centre", name: "The cafe by the park", kind: "cafe", icon: "☕", text: "Coffee, cake and a table by the window.", open: grid(2, 7, ALL), tags: ["food", "coffee", "cooking", "talk", "tea", "baking"], seats: 6, by: "stock" },
    { id: "library", district: "centre", name: "The library", kind: "library", icon: "📚", text: "Quiet shelves, old maps and a reading room.", open: grid(3, 7, NOT_SUN), tags: ["books", "reading", "history", "study", "writing", "art", "maps"], seats: 8, by: "stock" },
    { id: "shop", district: "centre", name: "The corner shop", kind: "shop", icon: "🛒", text: "Bread, small things and the news of the street.", open: grid(3, 7, ALL), tags: ["shopping", "fashion", "crafts", "gossip", "food"], seats: 5, by: "stock" },
    { id: "cinema", district: "centre", name: "The small cinema", kind: "club", icon: "🎬", text: "One screen and an evening show.", open: grid(5, 8, ALL), tags: ["film", "movies", "music", "games", "theatre"], seats: 10, by: "stock" },
    { id: "park", district: "nature", name: "The park", kind: "park", icon: "🌳", text: "Benches, old trees and a path around the pond.", open: grid(2, 8, ALL), tags: ["nature", "walks", "animals", "sports", "gardening", "running", "birds"], seats: 20, by: "stock" },
    { id: "riverside", district: "nature", name: "The riverside", kind: "park", icon: "🌊", text: "A quiet bank with reeds and a wooden pier.", open: grid(2, 7, ALL), tags: ["fishing", "water", "nature", "photography", "boats", "swimming"], seats: 10, by: "stock" },
    { id: "office", district: "work", name: "The office", kind: "workplace", icon: "🏢", text: "Desks, a kettle and a meeting room.", open: grid(3, 6, WEEK), tags: ["business", "tech", "computers", "money", "law", "management"], seats: 12, by: "stock" },
    { id: "workshop", district: "work", name: "The workshop", kind: "workplace", icon: "🔧", text: "Benches, tools and the smell of sawdust.", open: grid(3, 6, NOT_SUN), tags: ["crafts", "tech", "engineering", "building", "repair", "art", "music"], seats: 6, by: "stock" },
  ],
});

function cleanGrid(v) {
  if (!Array.isArray(v) || v.length !== 8) return null;
  const out = [];
  for (const row of v) {
    if (!Array.isArray(row) || row.length !== 7) return null;
    out.push(row.map((x) => (x ? 1 : 0)));
  }
  return out;
}

function cleanPlace(x, districtIds) {
  if (!isObj(x) || typeof x.id !== "string" || !ID.test(x.id) || !districtIds.has(x.district) || !str(x.name)) return null;
  const open = cleanGrid(x.open);
  if (!open) return null;
  const by = x.by === "you" || x.by === "pack" ? x.by : "stock";
  const seats = Number.isInteger(x.seats) && x.seats >= 1 && x.seats <= 200 ? x.seats : 6;
  return {
    id: x.id,
    district: x.district,
    name: oneLine(x.name, 60),
    kind: KINDS.includes(x.kind) ? x.kind : "custom",
    icon: oneLine(x.icon, 8) || "📍",
    text: oneLine(x.text, 160),
    open,
    tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => oneLine(t, 24).toLowerCase()).filter(Boolean).slice(0, 12),
    seats,
    by,
  };
}

/** The places file as stored, or the stock town when it is missing or unreadable. */
export function readTown(fsx) {
  const d = readJson(fsx, "city/places.json", null);
  if (!isObj(d) || !Array.isArray(d.districts) || !Array.isArray(d.places)) return stockTown();
  const districts = [];
  const seen = new Set();
  for (const x of d.districts) {
    if (!isObj(x) || typeof x.id !== "string" || !ID.test(x.id) || seen.has(x.id) || !str(x.name)) continue;
    seen.add(x.id);
    districts.push({ id: x.id, name: oneLine(x.name, 40), kind: DISTRICT_KINDS.includes(x.kind) ? x.kind : "custom", order: Number.isFinite(x.order) ? x.order : 99 });
    if (districts.length >= MAX_DISTRICTS) break;
  }
  const ids = new Set(districts.map((x) => x.id));
  const places = [];
  const placeIds = new Set();
  for (const x of d.places) {
    const p = cleanPlace(x, ids);
    if (p && !placeIds.has(p.id) && p.id !== HOME) {
      placeIds.add(p.id);
      places.push(p);
    }
    if (places.length >= MAX_PLACES) break;
  }
  if (!districts.length) return stockTown();
  return { districts: districts.sort((a, b) => a.order - b.order), places };
}

const isOpen = (place, band, weekday) => place.open[band][weekday] === 1;

// ---------- profiles and the people they hold ----------

function readProfile(fsx, id) {
  if (!ID.test(String(id))) return null;
  const p = readJson(fsx, "profiles/" + id + ".json", null);
  if (!isObj(p) || !str(p.name) || p.source === "persona") return null;
  return {
    id: String(id),
    name: str(p.name),
    hue: Number.isFinite(p.hue) ? p.hue : 200,
    picture: typeof p.picture === "string" && ASSET.test(p.picture) ? p.picture : "",
    schedule: p.schedule,
    interests: (Array.isArray(p.interests) ? p.interests : []).filter((x) => typeof x === "string" && str(x)).map((x) => str(x).toLowerCase()),
    lifeOn: !isObj(p.life) || p.life.on !== false,
    workplace: typeof p.workplace === "string" && ID.test(p.workplace) ? p.workplace : "",
  };
}

function profileIds(fsx) {
  try {
    return fsx.list("profiles").map((n) => /^([A-Za-z0-9_-]{1,60})\.json$/.exec(n)).filter(Boolean).map((m) => m[1]).sort();
  } catch {
    return [];
  }
}

/** The characters `id` follows or is a pen friend of or closer to: a Set of profile ids. Read only; Life writes the list. */
function closeOf(fsx, id) {
  const d = readJson(fsx, "life/people/" + id + ".json", null);
  const out = new Set();
  for (const p of isObj(d) && Array.isArray(d.people) ? d.people : []) {
    if (!isObj(p) || typeof p.key !== "string" || !p.key.startsWith("c:")) continue;
    const other = p.key.slice(2);
    if (!ID.test(other)) continue;
    if (p.fol === true || LEVELS.indexOf(p.lvl) >= CLOSE_FROM) out.add(other);
  }
  return out;
}

/** How well the character knows the user's active persona: an index into LEVELS (0 when the list says nothing). */
function levelOfUser(fsx, id, personaId) {
  if (!personaId) return 0;
  const d = readJson(fsx, "life/people/" + id + ".json", null);
  for (const p of isObj(d) && Array.isArray(d.people) ? d.people : []) if (isObj(p) && p.key === "u:" + personaId) return Math.max(0, LEVELS.indexOf(p.lvl));
  return 0;
}

// ---------- homes ----------

export function readHomes(fsx) {
  const d = readJson(fsx, "city/homes.json", null);
  const buildings = [];
  const seen = new Set();
  for (const b of isObj(d) && Array.isArray(d.buildings) ? d.buildings : []) {
    if (!isObj(b) || typeof b.id !== "string" || !ID.test(b.id) || seen.has(b.id) || !Number.isInteger(b.n) || b.n < 1) continue;
    seen.add(b.id);
    buildings.push({ id: b.id, n: b.n, flats: Number.isInteger(b.flats) && b.flats >= 1 && b.flats <= 40 ? b.flats : FLATS_PER_BUILDING });
  }
  const flats = {};
  if (isObj(d) && isObj(d.flats)) {
    for (const [k, v] of Object.entries(d.flats)) {
      if (ID.test(k) && isObj(v) && seen.has(v.b) && Number.isInteger(v.n) && v.n >= 1) flats[k] = { b: v.b, n: v.n };
    }
  }
  return { buildings: buildings.sort((a, b) => a.n - b.n), flats };
}

/**
 * Gives every profile in `ids` a flat (the first free one, a new building when all are full) and frees the flats of profiles that are
 * gone. Pure: returns the new homes and whether anything changed.
 */
export function assignHomes(homes, ids) {
  const buildings = homes.buildings.map((b) => ({ ...b }));
  const flats = {};
  const want = new Set(ids);
  for (const [k, v] of Object.entries(homes.flats)) if (want.has(k)) flats[k] = v;
  const taken = new Set(Object.values(flats).map((v) => v.b + "#" + v.n));
  for (const id of ids) {
    if (flats[id]) continue;
    let spot = null;
    for (const b of buildings) {
      for (let n = 1; n <= b.flats && !spot; n++) if (!taken.has(b.id + "#" + n)) spot = { b: b.id, n };
      if (spot) break;
    }
    if (!spot) {
      const n = buildings.reduce((m, b) => Math.max(m, b.n), 0) + 1;
      buildings.push({ id: "b" + n, n, flats: FLATS_PER_BUILDING });
      spot = { b: "b" + n, n: 1 };
    }
    flats[id] = spot;
    taken.add(spot.b + "#" + spot.n);
  }
  const changed = JSON.stringify({ buildings, flats }) !== JSON.stringify({ buildings: homes.buildings, flats: homes.flats });
  return { homes: { buildings, flats }, changed };
}

// ---------- who is where ----------

const fnv = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
/** A small seeded generator (mulberry32): the same seed gives the same draws. */
export function seeded(seed) {
  let a = fnv(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monday to Friday between 09:00 and 18:00 (bands 3, 4, 5): the hours a character may be at work. */
export const isWorkBand = (band, weekday) => weekday <= 4 && band >= 3 && band <= 5;

const interestHits = (profile, place) => {
  let n = 0;
  for (const i of profile.interests) for (const t of place.tags) if (i === t || (t.length >= 4 && i.includes(t)) || (i.length >= 4 && t.includes(i))) n++;
  return n;
};

/**
 * Where `profile` is in `band`: a place id or "home". `c` = {places, band, weekday, day, tz, now, seats: {placeId: count}, placed: {profileId: placeId},
 * close: Set of profile ids}. The same inputs give the same answer.
 */
export function placeAt(profile, c) {
  if (!profile.lifeOn) return HOME;
  const status = statusAt(profile.schedule, new Date(c.now), c.tz);
  if (status === "off") return HOME;
  if (status === "na" || status === "dnd") {
    if (isWorkBand(c.band, c.weekday) && profile.workplace) {
      const w = c.places.find((p) => p.id === profile.workplace);
      if (w && isOpen(w, c.band, c.weekday) && (c.seats[w.id] || 0) < w.seats) return w.id;
    }
    return HOME;
  }
  const options = [{ id: HOME, w: 1.5 }];
  for (const p of c.places) {
    if (!isOpen(p, c.band, c.weekday) || (c.seats[p.id] || 0) >= p.seats) continue;
    let nearby = 0;
    for (const [other, at] of Object.entries(c.placed)) if (at === p.id && c.close.has(other)) nearby++;
    options.push({ id: p.id, w: 1 + 2 * interestHits(profile, p) + 1.5 * Math.min(nearby, 3) });
  }
  const total = options.reduce((s, o) => s + o.w, 0);
  let r = seeded(profile.id + "|" + c.day + "|" + c.band)() * total;
  for (const o of options) {
    r -= o.w;
    if (r < 0) return o.id;
  }
  return HOME;
}

/** Everyone's place for the current band: {<profileId>: placeId | "home"}. Profiles are taken in id order so the result is the same for every reader. */
export function whereAll(fsx, now, tz) {
  const { band, weekday, day } = bandNow(now, tz);
  const places = readTown(fsx).places;
  const seats = {};
  const placed = {};
  for (const id of profileIds(fsx)) {
    const p = readProfile(fsx, id);
    if (!p) continue;
    const at = placeAt(p, { places, band, weekday, day, tz, now, seats, placed, close: closeOf(fsx, id) });
    placed[id] = at;
    if (at !== HOME) seats[at] = (seats[at] || 0) + 1;
  }
  return placed;
}

export const bandId = (now, tz) => {
  const b = bandNow(now, tz);
  return b.day + "#" + b.band;
};

// ---------- settings ----------

function readTz(fsx) {
  const r = readJson(fsx, "settings.json", null);
  const tz = isObj(r) ? r.tzOffset : null;
  return typeof tz === "number" && Number.isFinite(tz) && Math.abs(tz) <= 840 ? tz : null;
}

function readNow(fsx) {
  const d = readJson(fsx, "city/now.json", null);
  if (!isObj(d) || typeof d.id !== "string" || !isObj(d.where)) return null;
  const where = {};
  for (const [k, v] of Object.entries(d.where)) if (ID.test(k) && typeof v === "string" && (v === HOME || ID.test(v))) where[k] = v;
  return { id: d.id, at: num(d.at), where };
}

// ---------- the view ----------

/** Everyone's place for the current band: the stored one, or worked out on the spot (nothing is written). */
function whereNow(fsx, now, tz) {
  const stored = readNow(fsx);
  return stored && stored.id === bandId(now, tz) ? stored.where : whereAll(fsx, now, tz);
}

export function cityView(fsx, now) {
  const tz = readTz(fsx);
  const town = readTown(fsx);
  const { band, weekday } = bandNow(now, tz);
  const where = whereNow(fsx, now, tz);
  const profiles = profileIds(fsx).map((id) => readProfile(fsx, id)).filter(Boolean);
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const at = (p) => where[p.id] || HOME;
  const statusOf = (p) => statusAt(p.schedule, new Date(now), tz);
  const districts = town.districts
    .filter((d) => d.kind !== "homes")
    .map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      places: town.places
        .filter((p) => p.district === d.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          icon: p.icon,
          text: p.text,
          by: p.by,
          open: isOpen(p, band, weekday),
          seats: p.seats,
          people: profiles.filter((x) => at(x) === p.id).map((x) => ({ id: x.id, name: x.name, hue: x.hue, picture: x.picture, status: statusOf(x) })),
        })),
    }));
  const homes = readHomes(fsx);
  const personaId = (() => {
    const you = readJson(fsx, "you.json", null);
    return isObj(you) && typeof you.active === "string" && ID.test(you.active) ? you.active : "";
  })();
  const buildings = homes.buildings.map((b) => ({
    id: b.id,
    n: b.n,
    doors: Object.entries(homes.flats)
      .filter(([id, f]) => f.b === b.id && byId[id])
      .sort((x, y) => x[1].n - y[1].n)
      .map(([id, f]) => {
        const p = byId[id];
        const home = at(p) === HOME;
        const state = home ? (statusOf(p) === "off" ? "dark" : "lit") : "out";
        const knows = levelOfUser(fsx, id, personaId) >= KNOW_FROM;
        return { id, name: p.name, hue: p.hue, picture: p.picture, flat: f.n, state, ...(state === "out" && knows ? { where: at(p) } : {}) };
      }),
  }));
  const hasHomesDistrict = town.districts.some((d) => d.kind === "homes");
  return {
    band,
    from: band * 3,
    to: band * 3 + 3,
    districts,
    homes: { buildings: hasHomesDistrict ? buildings : [] },
    homesDistrict: hasHomesDistrict ? town.districts.find((d) => d.kind === "homes").id : "",
    empty: profiles.length === 0,
  };
}

/** The last lines the characters at `place` wrote to each other (chatter pairs and clubs), read only. */
export function listenView(fsx, place, now) {
  const tz = readTz(fsx);
  const where = whereNow(fsx, now, tz);
  const here = new Set(Object.entries(where).filter(([, at]) => at === place).map(([id]) => id));
  const cache = new Map();
  const person = (id) => {
    if (!cache.has(id)) cache.set(id, readProfile(fsx, id));
    return cache.get(id);
  };
  const lines = [];
  const take = (list, via, key) => {
    for (const m of list.slice(-LISTEN_LINES)) {
      if (!isObj(m) || typeof m.by !== "string" || !here.has(m.by) || !Number.isFinite(m.at) || now - m.at > LISTEN_MS || typeof m.text !== "string" || !str(m.text)) continue;
      const p = person(m.by);
      if (p) lines.push({ id: key + ":" + String(m.id || m.at), by: p.id, name: p.name, hue: p.hue, picture: p.picture, at: m.at, text: oneLine(m.text, TEXT_MAX), via });
    }
  };
  if (here.size >= 2) {
    let names = [];
    try {
      names = fsx.list("chatter");
    } catch {
      names = [];
    }
    for (const n of names) {
      const m = /^([A-Za-z0-9_-]{1,60})__([A-Za-z0-9_-]{1,60})\.json$/.exec(n);
      if (!m || !here.has(m[1]) || !here.has(m[2])) continue;
      const d = readJson(fsx, "chatter/" + n, null);
      if (isObj(d) && Array.isArray(d.messages)) take(d.messages, "chatter", "ch-" + m[1] + "-" + m[2]);
    }
    try {
      names = fsx.list("clubs");
    } catch {
      names = [];
    }
    for (const n of names) {
      const m = /^(cl-[A-Za-z0-9_-]{1,56})\.json$/.exec(n);
      if (!m) continue;
      const d = readJson(fsx, "clubs/" + n, null);
      if (!isObj(d) || !Array.isArray(d.members) || !Array.isArray(d.messages)) continue;
      if (d.members.filter((x) => typeof x === "string" && here.has(x)).length >= 2) take(d.messages, "club", m[1]);
    }
  }
  lines.sort((a, b) => a.at - b.at);
  return { place, present: here.size, lines: lines.slice(-LISTEN_LINES) };
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/city" && !path.startsWith("/city/")) return null;
  if (path === "/city" && req.method === "GET") return ok(cityView(host.fs, Date.now()));
  if (path === "/city/listen" && req.method === "GET") {
    const place = isObj(req.query) && typeof req.query.place === "string" ? req.query.place : "";
    if (!ID.test(place)) return ok({ error: "no such place" }, 400);
    return ok(listenView(host.fs, place, Date.now()));
  }
  return ok({ error: "not found" }, 404);
}

// ---------- onTick ----------

/** One tick: the stock town is written once, every profile gets a flat, and once per band everyone's place is worked out and filed. */
export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return;
  const now = Date.now();
  const tz = readTz(fsx);
  try {
    fsx.read("city/places.json");
  } catch {
    fsx.write("city/places.json", JSON.stringify(stockTown()));
  }
  const ids = profileIds(fsx);
  // an empty list may be a failed read: then nothing is assigned and nothing is freed
  if (!ids.length) return;
  const profiles = ids.filter((id) => readProfile(fsx, id));
  const { homes, changed } = assignHomes(readHomes(fsx), profiles);
  if (changed) fsx.write("city/homes.json", JSON.stringify(homes));
  const id = bandId(now, tz);
  const stored = readNow(fsx);
  if (stored && stored.id === id) return;
  fsx.write("city/now.json", JSON.stringify({ id, at: now, where: whereAll(fsx, now, tz) }));
}
