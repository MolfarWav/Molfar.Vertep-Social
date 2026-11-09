/**
 * Social stickers: the pack list (issue #329, design in docs/STICKERS-DESIGN.md).
 *
 * A pack is a named set of small pictures the user added: `kind: "sticker"` (a whole message, large) or `kind: "emoji"` (a
 * custom emoji, a token inside a text line). The picture files are engine assets (`PUT /v1/assets`, done by the page); this
 * plugin only keeps the list that names them, in `stickers/packs.json` of the app's data folder, so sync, backup and the
 * Storage cleanup (which counts every asset id found in the folder's text files) all keep working.
 *
 * Routes (relative to /v1/apps/social):
 *   GET /stickers/packs           {packs: [{id, name, kind, items: [{id, name, url, tags?}]}]}
 *   PUT /stickers/packs {packs}   replaces the whole list; the reply is {ok, packs} with what was kept (bad entries are dropped)
 *
 * The page edits the list and sends all of it: two devices editing at once is last writer wins (assets are content addressed,
 * so no picture is lost, only a list entry may need adding again). Permissions: routes, fs.
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
    packs.push({ id: p.id, name: plain(p.name, 60) || p.id, kind: p.kind === "emoji" ? "emoji" : "sticker", items });
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

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
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
