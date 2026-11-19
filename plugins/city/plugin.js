/**
 * Social city (issue #445, phase C1): a town the characters live in. Districts, places, a home for every profile, and where each
 * character is right now. All by rules, no model call, read-only for the user in this phase.
 *
 * Data (this plugin is the only writer of city/*):
 *   city/places.json  {districts: [{id, name, kind, order, by, background?, lots?}], places: [{id, district, name, kind, icon, text, picture?, background?, open, tags, seats, by}]}
 *                     (#452) `background`: the wide picture of a place or district (an asset url); `picture` is the small one of before.
 *                     (#458) `lots`: {g, at: {<place id>: lot index}}, where the user put the buildings of the district's drawing (grid g a
 *                     side, lots numbered back to front); dropped from the drawing when the grid size is no longer g.
 *                     `open` is 8 bands of 3 hours by 7 days from Monday (the schedule's shape), 1 = open. The stock town is an ordinary
 *                     present-day town with no real city, country or brand: plain names. It is written once, so later phases (own places,
 *                     packs) edit records, not code.
 *   city/homes.json   {buildings: [{id, n, flats}], flats: {<profileId>: {b: buildingId, n: flatNumber}}}: every profile has exactly one
 *                     flat; when the buildings are full the next one appears. (#453) Profiles joined by a family or romantic tie marked
 *                     "Lives together" (`home: true`, Life's list) point at one flat (`homeGroups`).
 *   city/now.json     {id: "<local day>#<band>", at, where: {<profileId>: <placeId> | "home"}}, written once per band by the tick.
 * Who is where (`placeAt`, rules only, the same answer for the same profile and band): status off = home; na or dnd in a work band = the
 * profile's `workplace` (a place id set in Profiles; with none, the workplace of a boss, subordinate or colleague, `workplaceOf`) else home; online or away = a seeded draw over the open
 * places with free seats and home, weighted by the place's tags against the profile's interests and by followed or close people who are
 * already there. A profile with life switched off stays at home.
 *
 * C3 (own places): the user makes, edits and removes places and districts, and may restore the stock town. A stock place or district the user
 * edits becomes `by: "you"` (the page shows the stock names in the language of the page, and a stored name for anything else). A place has an
 * optional `picture` (an asset url the page's picture dialog made or uploaded). Hours come as {from, to, days}: band numbers 0 to 8 and the days
 * from Monday (0), stored as the 8 by 7 grid.
 *
 * Routes (relative to /v1/apps/social):
 *   POST /city/place {id?, name, district, kind?, icon?, text?, tags?, seats?, hours?, picture?}   makes a place, or changes the one with `id`
 *   POST /city/place/remove {id}
 *   POST /city/district {id?, name, kind?}   makes a district (not another Homes), or renames the one with `id`
 *   POST /city/district/remove {id}          only an empty one, never Homes
 *   POST /city/reset                         the stock town again (own places and districts go; homes and who is where stay)
 *   GET /city/listen?place=   {place, present, lines: [{id, by, name, hue, picture, at, text, via: "chatter" | "club"}]}: the last lines (at most 6, from
 *                             the last 3 days) that characters who are at this place now wrote to each other in chatter or in a club; read only
 *                             (the chatter and clubs files are those plugins'; the user's own lines are left out)
 *   POST /city/layout  {district, lots: {g, at} | null}  the hand-made order of a district's drawing (null: the tiles' order again)
 *   GET /city   {band, from, to, districts: [{id, name, kind, by, lots?, places: [{id, name, kind, icon, text, by, open, seats, people: [person]}]}],
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
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const KIND_ICONS = { cafe: "\u2615", park: "\ud83c\udf33", library: "\ud83d\udcda", shop: "\ud83d\uded2", workplace: "\ud83c\udfe2", club: "\ud83c\udfac", custom: "\ud83d\udccd" };
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
    { id: "centre", name: "Centre", kind: "centre", order: 1, by: "stock" },
    { id: "nature", name: "Nature", kind: "nature", order: 2, by: "stock" },
    { id: "work", name: "Work", kind: "work", order: 3, by: "stock" },
    { id: "homes", name: "Homes", kind: "homes", order: 4, by: "stock" },
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
    ...(typeof x.picture === "string" && ASSET.test(x.picture) ? { picture: x.picture } : {}),
    ...(typeof x.background === "string" && ASSET.test(x.background) ? { background: x.background } : {}),
    open,
    tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => oneLine(t, 24).toLowerCase()).filter(Boolean).slice(0, 12),
    seats,
    by,
  };
}

/**
 * The hand-made order of a district's drawing (#458): `{ g, at: { <place id>: lot index } }`, the lots of a grid `g` a side (the drawing's
 * own geometry, src/screens/city/iso.ts) numbered back to front. Kept only while the grid is still that size: a district that gained
 * places and grew a row is drawn in its tiles' order again. Not a place field, so moving a building never turns a stock place into "yours".
 */
export function cleanLots(v) {
  if (!isObj(v) || !Number.isInteger(v.g) || v.g < 1 || v.g > 8 || !isObj(v.at)) return null;
  const at = {};
  const used = new Set();
  for (const [id, i] of Object.entries(v.at)) {
    if (!ID.test(id) || !Number.isInteger(i) || i < 0 || i >= v.g * v.g || used.has(i)) continue;
    used.add(i);
    at[id] = i;
  }
  return Object.keys(at).length ? { g: v.g, at } : null;
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
    const lots = cleanLots(x.lots);
    districts.push({ id: x.id, name: oneLine(x.name, 40), kind: DISTRICT_KINDS.includes(x.kind) ? x.kind : "custom", order: Number.isFinite(x.order) ? x.order : 99, by: x.by === "you" ? "you" : "stock", ...(lots ? { lots } : {}), ...(typeof x.background === "string" && ASSET.test(x.background) ? { background: x.background } : {}) });
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

/** Ties that put two profiles at one workplace when one of them has none of its own. */
const WORK_TIES = ["boss", "subordinate", "colleague"];
/** Ties that may share a flat (the user's switch "Live together" on the tie). */
export const HOME_TIES = ["spouse", "parent", "child", "sibling", "relative", "partner", "dating"];

/** The character ids `id` is tied to by a tie of `types` (with `home`, only ties the user marked "Live together"), in id order. Read only. */
function tiedTo(fsx, id, types, home) {
  const d = readJson(fsx, "life/people/" + id + ".json", null);
  const out = [];
  for (const p of isObj(d) && Array.isArray(d.people) ? d.people : []) {
    if (!isObj(p) || typeof p.key !== "string" || !p.key.startsWith("c:") || !Array.isArray(p.ties)) continue;
    const other = p.key.slice(2);
    if (!ID.test(other) || other === id) continue;
    if (p.ties.some((t) => isObj(t) && types.includes(t.type) && (!home || t.home === true))) out.push(other);
  }
  return out.sort();
}

/**
 * Where a profile works: its own `workplace` (Profiles > Life), else the workplace of the first character (in id order) it is tied to as boss,
 * subordinate or colleague that has one of its own. Only a place that exists counts. `byId`: Map of profile id -> profile (readProfile).
 */
export function workplaceOf(fsx, profile, byId, placeIds) {
  if (profile.workplace && placeIds.has(profile.workplace)) return profile.workplace;
  for (const other of tiedTo(fsx, profile.id, WORK_TIES, false)) {
    const o = byId.get(other);
    if (o && o.workplace && placeIds.has(o.workplace)) return o.workplace;
  }
  return "";
}

/** The groups of profiles that live together: joined by a family or romantic tie the user marked "Live together" on either side; at most 6 in one flat. */
export function homeGroups(fsx, ids) {
  const want = new Set(ids);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    return r;
  };
  for (const id of ids) {
    for (const other of tiedTo(fsx, id, HOME_TIES, true)) {
      if (!want.has(other)) continue;
      const a = find(id);
      const b = find(other);
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
    }
  }
  const groups = new Map();
  for (const id of ids) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) || []), id]);
  }
  return [...groups.values()].filter((g) => g.length >= 2).map((g) => g.sort().slice(0, 6));
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
 * gone. `groups` (shared flats, `homeGroups`): lists of profile ids that live together; a group lives in the flat of its first member that
 * has one. A profile that shared a flat with others it no longer lives with moves out to a free flat (the first holder in id order stays).
 * Pure: returns the new homes and whether anything changed.
 */
export function assignHomes(homes, ids, groups) {
  const buildings = homes.buildings.map((b) => ({ ...b }));
  const flats = {};
  const want = new Set(ids);
  const keyOf = (v) => v.b + "#" + v.n;
  const groupOf = new Map();
  for (const g of Array.isArray(groups) ? groups : []) {
    const members = [...new Set(g.filter((x) => want.has(x)))].sort();
    if (members.length >= 2) for (const m of members) if (!groupOf.has(m)) groupOf.set(m, members);
  }
  for (const [k, v] of Object.entries(homes.flats)) if (want.has(k)) flats[k] = v;
  const holders = new Map();
  for (const id of Object.keys(flats).sort()) holders.set(keyOf(flats[id]), [...(holders.get(keyOf(flats[id])) || []), id]);
  for (const list of holders.values()) for (const other of list.slice(1)) if (!(groupOf.get(other) || []).includes(list[0])) delete flats[other];
  const spotFor = () => {
    const taken = new Set(Object.values(flats).map(keyOf));
    for (const b of buildings) for (let n = 1; n <= b.flats; n++) if (!taken.has(b.id + "#" + n)) return { b: b.id, n };
    const n = buildings.reduce((m, b) => Math.max(m, b.n), 0) + 1;
    buildings.push({ id: "b" + n, n, flats: FLATS_PER_BUILDING });
    return { b: "b" + n, n: 1 };
  };
  for (const g of new Set(groupOf.values())) {
    const anchor = g.find((m) => flats[m]) || g[0];
    if (!flats[anchor]) flats[anchor] = spotFor();
    for (const m of g) if (m !== anchor) flats[m] = { b: flats[anchor].b, n: flats[anchor].n };
  }
  for (const id of ids) if (!flats[id]) flats[id] = spotFor();
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
    const workplace = typeof c.workplace === "string" ? c.workplace : profile.workplace;
    if (isWorkBand(c.band, c.weekday) && workplace) {
      const w = c.places.find((p) => p.id === workplace);
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
  const placeIds = new Set(places.map((p) => p.id));
  const seats = {};
  const placed = {};
  const profiles = profileIds(fsx).map((id) => readProfile(fsx, id)).filter(Boolean);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const p of profiles) {
    const id = p.id;
    const at = placeAt(p, { places, band, weekday, day, tz, now, seats, placed, close: closeOf(fsx, id), workplace: workplaceOf(fsx, p, byId, placeIds) });
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
      by: d.by,
      ...(d.background ? { background: d.background } : {}),
      ...(d.lots ? { lots: d.lots } : {}),
      places: town.places
        .filter((p) => p.district === d.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          icon: p.icon,
          text: p.text,
          ...(p.picture ? { picture: p.picture } : {}),
          ...(p.background ? { background: p.background } : {}),
          by: p.by,
          district: p.district,
          tags: p.tags,
          hours: hoursOf(p.open),
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
    homesName: hasHomesDistrict ? town.districts.find((d) => d.kind === "homes").name : "",
    homesBy: hasHomesDistrict ? town.districts.find((d) => d.kind === "homes").by : "stock",
    homesBackground: hasHomesDistrict ? town.districts.find((d) => d.kind === "homes").background || "" : "",
    empty: profiles.length === 0,
  };
}

// ---------- own places (C3) ----------

/** The 8 by 7 grid for {from, to, days}: band numbers 0 to 8 (from < to) and the weekdays from Monday (0). Null for a bad input. */
export function gridFromHours(h) {
  if (!isObj(h) || !Number.isInteger(h.from) || !Number.isInteger(h.to) || h.from < 0 || h.to > 8 || h.from >= h.to || !Array.isArray(h.days)) return null;
  const days = [...new Set(h.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return days.length ? grid(h.from, h.to, days) : null;
}

/** {from, to, days} for a grid that is one block of bands on some days (what the form can show), else null (kept as it is). */
export function hoursOf(open) {
  const days = [];
  for (let d = 0; d < 7; d++) if (open.some((row) => row[d] === 1)) days.push(d);
  if (!days.length) return null;
  const rows = open.map((row) => row[days[0]]);
  const from = rows.indexOf(1);
  const to = rows.lastIndexOf(1) + 1;
  for (const d of days) for (let b = 0; b < 8; b++) if (open[b][d] !== (b >= from && b < to ? 1 : 0)) return null;
  for (let b = 0; b < 8; b++) for (let d = 0; d < 7; d++) if (open[b][d] === 1 && !days.includes(d)) return null;
  return { from, to, days };
}

const writeTown = (fsx, town) => fsx.write("city/places.json", JSON.stringify(town));
const tagList = (v) => [...new Set((Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((t) => oneLine(t, 24).toLowerCase().replace(/^#+/, "")).filter(Boolean))].slice(0, 12);

function placeRoute(fsx, b) {
  const town = readTown(fsx);
  const old = typeof b.id === "string" && b.id ? town.places.find((p) => p.id === b.id) : null;
  if (typeof b.id === "string" && b.id && !old) return ok({ error: "no such place" }, 404);
  const name = oneLine("name" in b ? b.name : old ? old.name : "", 60);
  if (!name) return ok({ error: "a place needs a name" }, 400);
  const dId = "district" in b ? String(b.district || "") : old ? old.district : "";
  const district = town.districts.find((d) => d.id === dId);
  if (!district || district.kind === "homes") return ok({ error: "pick a district for the place (not Homes)" }, 400);
  if (!old && town.places.length >= MAX_PLACES) return ok({ error: "the town has the most places there can be: " + MAX_PLACES }, 409);
  let open = old ? old.open : grid(2, 7, ALL);
  if ("hours" in b) {
    const g = gridFromHours(b.hours);
    if (!g) return ok({ error: "the hours need a start before the end and at least one day" }, 400);
    open = g;
  }
  const kind = KINDS.includes(b.kind) && b.kind !== "home" ? b.kind : old ? old.kind : "custom";
  const seats = Number.isInteger(b.seats) && b.seats >= 1 && b.seats <= 200 ? b.seats : old ? old.seats : 6;
  const picture = "picture" in b ? (typeof b.picture === "string" && ASSET.test(b.picture) ? b.picture : "") : old && old.picture ? old.picture : "";
  const background = "background" in b ? (typeof b.background === "string" && ASSET.test(b.background) ? b.background : "") : old && old.background ? old.background : "";
  const place = {
    id: old ? old.id : "p-" + Date.now().toString(36) + rid(),
    district: district.id,
    name,
    kind,
    icon: oneLine("icon" in b ? b.icon : old ? old.icon : "", 8) || KIND_ICONS[kind] || KIND_ICONS.custom,
    text: oneLine("text" in b ? b.text : old ? old.text : "", 160),
    ...(picture ? { picture } : {}),
    ...(background ? { background } : {}),
    open,
    tags: "tags" in b ? tagList(b.tags) : old ? old.tags : [],
    seats,
    by: "you",
  };
  town.places = old ? town.places.map((p) => (p.id === old.id ? place : p)) : [...town.places, place];
  writeTown(fsx, town);
  return ok({ ok: true, id: place.id });
}

/** Save the hand-made order of a district's drawing (#458); `lots: null` puts the drawing back in the tiles' order. */
function layoutRoute(fsx, b) {
  const town = readTown(fsx);
  const d = town.districts.find((x) => x.id === String(b.district || ""));
  if (!d) return ok({ error: "no such district" }, 404);
  if (d.kind === "homes") return ok({ error: "the Homes drawing is not rearranged" }, 400);
  let lots = null;
  if (b.lots !== null && b.lots !== undefined) {
    const mine = new Set(town.places.filter((p) => p.district === d.id).map((p) => p.id));
    const asked = isObj(b.lots) && isObj(b.lots.at) ? { g: b.lots.g, at: Object.fromEntries(Object.entries(b.lots.at).filter(([id]) => mine.has(id))) } : null;
    lots = cleanLots(asked);
    if (!lots) return ok({ error: "the layout needs a grid size and a lot for at least one place of this district" }, 400);
  }
  town.districts = town.districts.map((x) => {
    if (x.id !== d.id) return x;
    const { lots: _was, ...rest } = x;
    return lots ? { ...rest, lots } : rest;
  });
  writeTown(fsx, town);
  return ok({ ok: true });
}

function districtRoute(fsx, b) {
  const town = readTown(fsx);
  const old = typeof b.id === "string" && b.id ? town.districts.find((d) => d.id === b.id) : null;
  if (typeof b.id === "string" && b.id && !old) return ok({ error: "no such district" }, 404);
  const name = oneLine("name" in b ? b.name : old ? old.name : "", 40);
  if (!name) return ok({ error: "a district needs a name" }, 400);
  // the district's backdrop (#452): an asset url, "" removes it, absent keeps it
  const bgOf = (d) => ("background" in b ? (typeof b.background === "string" && ASSET.test(b.background) ? b.background : "") : d && d.background ? d.background : "");
  if (old) {
    town.districts = town.districts.map((d) => {
      if (d.id !== old.id) return d;
      const { background: _was, ...rest } = d;
      const background = bgOf(d);
      return { ...rest, name, by: "you", ...(d.kind !== "homes" && DISTRICT_KINDS.includes(b.kind) && b.kind !== "homes" ? { kind: b.kind } : {}), ...(background ? { background } : {}) };
    });
  } else {
    if (town.districts.length >= MAX_DISTRICTS) return ok({ error: "the town has the most districts there can be: " + MAX_DISTRICTS }, 409);
    const kind = DISTRICT_KINDS.includes(b.kind) && b.kind !== "homes" ? b.kind : "custom";
    const background = bgOf(null);
    town.districts.push({ id: "d-" + Date.now().toString(36) + rid(), name, kind, order: town.districts.reduce((m, d) => Math.max(m, d.order), 0) + 1, by: "you", ...(background ? { background } : {}) });
  }
  writeTown(fsx, town);
  return ok({ ok: true, id: old ? old.id : town.districts[town.districts.length - 1].id });
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
  if (req.method === "POST") {
    const b = isObj(req.body) ? req.body : {};
    if (path === "/city/place") return placeRoute(host.fs, b);
    if (path === "/city/place/remove") {
      const town = readTown(host.fs);
      if (!town.places.some((p) => p.id === String(b.id || ""))) return ok({ error: "no such place" }, 404);
      town.places = town.places.filter((p) => p.id !== String(b.id));
      writeTown(host.fs, town);
      return ok({ ok: true });
    }
    if (path === "/city/district") return districtRoute(host.fs, b);
    if (path === "/city/layout") return layoutRoute(host.fs, b);
    if (path === "/city/district/remove") {
      const town = readTown(host.fs);
      const d = town.districts.find((x) => x.id === String(b.id || ""));
      if (!d) return ok({ error: "no such district" }, 404);
      if (d.kind === "homes") return ok({ error: "Homes cannot be removed" }, 409);
      if (town.places.some((p) => p.district === d.id)) return ok({ error: "move or remove the places of this district first" }, 409);
      town.districts = town.districts.filter((x) => x.id !== d.id);
      writeTown(host.fs, town);
      return ok({ ok: true });
    }
    if (path === "/city/reset") {
      writeTown(host.fs, stockTown());
      return ok({ ok: true });
    }
  }
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
  const { homes, changed } = assignHomes(readHomes(fsx), profiles, homeGroups(fsx, profiles));
  if (changed) fsx.write("city/homes.json", JSON.stringify(homes));
  const id = bandId(now, tz);
  const stored = readNow(fsx);
  if (stored && stored.id === id) return;
  fsx.write("city/now.json", JSON.stringify({ id, at: now, where: whereAll(fsx, now, tz) }));
}
