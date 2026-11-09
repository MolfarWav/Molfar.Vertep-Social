/**
 * Social stickers: the pack list (issue #329, design in docs/STICKERS-DESIGN.md).
 *
 * A pack is a named set of small pictures the user added: `kind: "sticker"` (a whole message, large) or `kind: "emoji"` (a
 * custom emoji, a token inside a text line). The picture files are engine assets (`PUT /v1/assets`, done by the page); this
 * plugin only keeps the list that names them, in `stickers/packs.json` of the app's data folder, so sync, backup and the
 * Storage cleanup (which counts every asset id found in the folder's text files) all keep working.
 *
 * Routes (relative to /v1/apps/social):
 *   GET /stickers/catalog         the free packs of the catalog (catalog/index.json of the Social repo, fetched from GitHub): {ok, packs: [{id, name, kind, description, author, license, licenseLabel, source, items: [{id, name, file, tags}]}]}
 *   GET /stickers/catalog/preview?pack=<id>           {ok, dataUrl}: the pack's preview.png
 *   GET /stickers/catalog/file?pack=<id>&file=<name>  {ok, mime, base64}: one picture (the page uploads it as an asset of the app)
 *   GET /stickers/packs           {packs: [{id, name, kind, items: [{id, name, url, tags?}]}]}
 *   PUT /stickers/packs {packs}   replaces the whole list; the reply is {ok, packs} with what was kept (bad entries are dropped)
 *
 * The page edits the list and sends all of it: two devices editing at once is last writer wins (assets are content addressed,
 * so no picture is lost, only a list entry may need adding again).
 *
 * The catalog (issue #348): the only network use is `raw.githubusercontent.com` (manifest `networkHosts`), and only paths under
 * catalog/ of the Social repo; ids and file names are checked before a URL is built, a picture must be a real PNG, WebP or GIF of at
 * most 512 KB, a pack must name its author and one of three licences (CC0, CC BY, MIT). Pictures are never stored here: the page
 * uploads them, so the app owns the assets. Permissions: routes, fs, network.
 */

const FILE = "stickers/packs.json";
/** A pack or item id: it sits inside the text token `:pack/item:`, so letters, digits, `_` and `-` only. */
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const ASSET = /^\/v1\/assets\/[A-Za-z0-9_-]{1,80}$/;
const MAX_PACKS = 40;
const MAX_ITEMS = 200;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const cut = (s, n) => {
  if (s.length <= n) return s;
  let out = s.slice(0, n);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.replace(/[‍️]+$/, "");
};
const plain = (v, n) => cut(str(v).replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim(), n);
const ok = (json, status) => ({ status: status || 200, json });

/** Who made a pack and under what licence (a catalog pack keeps it; a CC BY licence needs it shown): strings only, capped. */
function cleanCredit(v) {
  if (!isObj(v)) return null;
  const author = plain(v.author, 80);
  const license = plain(v.license, 20);
  const source = typeof v.source === "string" && /^https:\/\/[^\s<>"']{1,300}$/.test(v.source) ? v.source : "";
  return author && license ? { author, license, ...(source ? { source } : {}) } : null;
}

/** The packs as stored: bad packs, items and duplicates dropped, lengths capped. Pure. */
export function cleanPacks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const packs = [];
  const seen = new Set();
  for (const p of list) {
    if (packs.length >= MAX_PACKS) break;
    if (!isObj(p) || typeof p.id !== "string" || !ID.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    const items = [];
    const ids = new Set();
    for (const it of Array.isArray(p.items) ? p.items : []) {
      if (items.length >= MAX_ITEMS) break;
      if (!isObj(it) || typeof it.id !== "string" || !ID.test(it.id) || ids.has(it.id)) continue;
      if (typeof it.url !== "string" || !ASSET.test(it.url)) continue;
      ids.add(it.id);
      const tags = (Array.isArray(it.tags) ? it.tags : []).map((t) => plain(t, 24)).filter(Boolean).slice(0, 6);
      items.push({ id: it.id, name: plain(it.name, 60) || it.id, url: it.url, ...(tags.length ? { tags } : {}) });
    }
    const credit = cleanCredit(p.credit);
    packs.push({ id: p.id, name: plain(p.name, 60) || p.id, kind: p.kind === "emoji" ? "emoji" : "sticker", items, ...(credit ? { credit } : {}) });
  }
  return packs;
}

/** The stored packs (empty list when none, or the file is unreadable). */
export function readPacks(fsx) {
  try {
    const j = JSON.parse(fsx.read(FILE));
    return cleanPacks(isObj(j) ? j.packs : null);
  } catch {
    return [];
  }
}

// ---------- the catalog of free packs (issue #348) ----------

const CATALOG_BASE = "https://raw.githubusercontent.com/MolfarWav/Molfar.Vertep-Social/main/catalog/";
/** The licences a catalog pack may carry: the key is what index.json says, the value is what a card shows. */
export const LICENSES = { "CC0-1.0": "CC0 1.0", "CC-BY-4.0": "CC BY 4.0", MIT: "MIT" };
const MAX_CATALOG_PACKS = 30;
const FILE_NAME = /^[A-Za-z0-9_-]{1,40}\.(?:webp|png|gif)$/;
const MAX_PICTURE = 512 * 1024;

/** index.json cleaned: only packs that name an author and a known licence, and items with a safe file name. Pure. */
export function cleanCatalog(raw) {
  const out = [];
  const seen = new Set();
  for (const p of isObj(raw) && Array.isArray(raw.packs) ? raw.packs : []) {
    if (out.length >= MAX_CATALOG_PACKS) break;
    if (!isObj(p) || typeof p.id !== "string" || !ID.test(p.id) || seen.has(p.id)) continue;
    const author = plain(p.author, 80);
    const license = typeof p.license === "string" && Object.prototype.hasOwnProperty.call(LICENSES, p.license) ? p.license : "";
    if (!author || !license) continue;
    const items = [];
    const ids = new Set();
    for (const it of Array.isArray(p.items) ? p.items : []) {
      if (items.length >= MAX_ITEMS) break;
      if (!isObj(it) || typeof it.id !== "string" || !ID.test(it.id) || ids.has(it.id) || typeof it.file !== "string" || !FILE_NAME.test(it.file)) continue;
      ids.add(it.id);
      const tags = (Array.isArray(it.tags) ? it.tags : []).map((t) => plain(t, 24)).filter(Boolean).slice(0, 6);
      items.push({ id: it.id, name: plain(it.name, 60) || it.id, file: it.file, ...(tags.length ? { tags } : {}) });
    }
    if (!items.length) continue;
    seen.add(p.id);
    const source = typeof p.source === "string" && /^https:\/\/[^\s<>"']{1,300}$/.test(p.source) ? p.source : "";
    out.push({ id: p.id, name: plain(p.name, 60) || p.id, kind: p.kind === "emoji" ? "emoji" : "sticker", description: plain(p.description, 240), author, license, licenseLabel: LICENSES[license], ...(source ? { source } : {}), items });
  }
  return out;
}

/** The first `n` bytes of a base64 string as a latin-1 string (no atob in the sandbox). */
function headOf(base64, n) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const s = String(base64 || "").slice(0, Math.ceil(n / 3) * 4);
  let out = "";
  for (let i = 0; i + 4 <= s.length && out.length < n; i += 4) {
    const v = (A.indexOf(s[i]) << 18) | (A.indexOf(s[i + 1]) << 12) | (A.indexOf(s[i + 2]) << 6) | A.indexOf(s[i + 3]);
    out += String.fromCharCode((v >> 16) & 255, (v >> 8) & 255, v & 255);
  }
  return out.slice(0, n);
}

/** The kind of a picture from its first bytes (base64), or "": a catalog file must be what its name says. */
export function pictureMime(base64) {
  const h = headOf(base64, 12);
  if (h.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (h.startsWith("GIF8")) return "image/gif";
  if (h.startsWith("RIFF") && h.slice(8, 12) === "WEBP") return "image/webp";
  return "";
}

const failure = (r) => ok({ ok: false, error: plain(isObj(r) && r.error ? r.error : isObj(r) && r.status ? "the catalog answered " + r.status : "the catalog did not answer", 160) });

function catalogRoute(req, host, parts) {
  const query = isObj(req.query) ? req.query : {};
  let key = "";
  let spec = null;
  if (parts.length === 2) {
    key = "index";
    spec = { url: CATALOG_BASE + "index.json", maxBytes: 300000 };
  } else if (parts[2] === "preview" && ID.test(String(query.pack || ""))) {
    key = "preview";
    spec = { url: CATALOG_BASE + query.pack + "/preview.png", binary: true, maxBytes: 300000 };
  } else if (parts[2] === "file" && ID.test(String(query.pack || "")) && FILE_NAME.test(String(query.file || ""))) {
    key = "file";
    spec = { url: CATALOG_BASE + query.pack + "/" + query.file, binary: true, maxBytes: MAX_PICTURE + 1 };
  } else {
    return ok({ error: "not found" }, 404);
  }
  if (!host.net) return ok({ ok: false, error: "the network is not allowed for this plugin" });
  if (!req.stash) {
    host.net.request(key, { ...spec, method: "GET", timeoutMs: 12000 });
    return { __llmPending: true, stash: { asked: key } };
  }
  const r = host.net.results[key];
  if (!isObj(r) || !r.ok) return failure(r);
  if (key === "index") {
    let data = r.json;
    if (data === undefined) {
      try {
        data = JSON.parse(String(r.text || ""));
      } catch {
        return ok({ ok: false, error: "the catalog is not readable" });
      }
    }
    return ok({ ok: true, packs: cleanCatalog(data) });
  }
  const mime = pictureMime(r.base64);
  if (!mime) return ok({ ok: false, error: "not a picture" });
  if (key === "preview") return ok({ ok: true, dataUrl: "data:" + mime + ";base64," + r.base64 });
  if (Math.floor((String(r.base64).length * 3) / 4) > MAX_PICTURE) return ok({ ok: false, error: "too big" });
  return ok({ ok: true, mime, base64: r.base64 });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path === "/stickers/catalog" || path.startsWith("/stickers/catalog/")) {
    if (req.method !== "GET") return ok({ error: "method not allowed" }, 405);
    return catalogRoute(req, host, path.split("/").filter(Boolean));
  }
  if (path !== "/stickers/packs") return null;
  if (req.method === "GET") return ok({ packs: readPacks(host.fs) });
  if (req.method === "PUT") {
    const body = req.body;
    if (!isObj(body) || !Array.isArray(body.packs)) return ok({ error: "packs must be a list" }, 400);
    const packs = cleanPacks(body.packs);
    host.fs.write(FILE, JSON.stringify({ packs }, null, 2));
    return ok({ ok: true, packs });
  }
  return ok({ error: "method not allowed" }, 405);
}
