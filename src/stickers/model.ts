// Sticker and custom emoji packs: the shapes, the text token and the pure list edits (issue #329, design in docs/STICKERS-DESIGN.md).
// A pack is a named set of small pictures: kind "sticker" (a whole message, large) or "emoji" (a token inside a text line).
// The pictures are engine assets; the list that names them is kept by plugins/stickers. Nothing here touches the network.

export type PackKind = "sticker" | "emoji";

export interface StickerItem {
  id: string;
  name: string;
  /** An engine asset URL (`/v1/assets/<id>`), or a data: URL in the design preview. */
  url: string;
  tags?: string[];
}

export interface StickerPack {
  id: string;
  name: string;
  kind: PackKind;
  items: StickerItem[];
}

/** The limits of the design: a pack holds at most this many pictures, and a file at most this many bytes (after scaling). */
export const MAX_ITEMS = 200;
export const MAX_PACKS = 40;
export const MAX_FILE_BYTES = 512 * 1024;
/** The longest side a picture is scaled to: a sticker is shown large, a custom emoji sits in a text line. */
export const SIDE: Record<PackKind, number> = { sticker: 512, emoji: 64 };
export const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// `:pack/item:` in a text. Ids are letters, digits, `_` and `-`, at most 40 each, so the token has no tag characters
// and survives the plugins' tag stripping and cut().
const TOKEN_ONE = /^:([A-Za-z0-9_-]{1,40})\/([A-Za-z0-9_-]{1,40}):$/;

export type Part = { text: string } | { pack: string; item: string; raw: string };

export const tokenOf = (pack: string, item: string): string => `:${pack}/${item}:`;
export const refOf = (pack: string, item: string): string => `${pack}/${item}`;

/** The pack and item of a token that is the whole string, or null. */
export function parseToken(s: string): { pack: string; item: string } | null {
  const m = TOKEN_ONE.exec(s);
  return m ? { pack: m[1]!, item: m[2]! } : null;
}

/** A text cut into plain runs and tokens (a token is `:pack/item:`; whether it exists is the renderer's question). */
export function splitTokens(text: string): Part[] {
  const out: Part[] = [];
  const re = /:([A-Za-z0-9_-]{1,40})\/([A-Za-z0-9_-]{1,40}):/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ pack: m[1]!, item: m[2]!, raw: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function findItem(packs: StickerPack[], pack: string, item: string): { pack: StickerPack; item: StickerItem } | null {
  const p = packs.find((x) => x.id === pack);
  const it = p?.items.find((x) => x.id === item);
  return p && it ? { pack: p, item: it } : null;
}

/** An id from a name: letters and digits kept (Latin only), the rest becomes `-`; "" when nothing is left. */
export function slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** `base` made unique among `taken` (`base`, `base-2`, ...); an empty base becomes `fallback`. */
export function uniqueId(base: string, taken: Iterable<string>, fallback: string): string {
  const set = new Set(taken);
  const b = base || fallback;
  if (!set.has(b)) return b;
  for (let n = 2; ; n++) {
    const c = `${b}-${n}`;
    if (!set.has(c)) return c;
  }
}

/** A name for an item from its file name: no extension, no path. */
export const itemNameOf = (file: string): string => file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim().slice(0, 60);

export function newPack(packs: StickerPack[], name: string, kind: PackKind): StickerPack {
  const clean = name.trim().slice(0, 60);
  return { id: uniqueId(slug(clean), packs.map((p) => p.id), "pack"), name: clean || "Pack", kind, items: [] };
}

/** `pack` with the uploaded pictures added (at most MAX_ITEMS; the rest is reported back as `dropped`). */
export function addItems(pack: StickerPack, added: { name: string; url: string }[]): { pack: StickerPack; dropped: number } {
  const items = pack.items.slice();
  let dropped = 0;
  for (const a of added) {
    if (items.length >= MAX_ITEMS) {
      dropped++;
      continue;
    }
    const name = a.name.trim().slice(0, 60);
    items.push({ id: uniqueId(slug(name), items.map((i) => i.id), "item"), name: name || "Picture", url: a.url });
  }
  return { pack: { ...pack, items }, dropped };
}

export const withPack = (packs: StickerPack[], next: StickerPack): StickerPack[] => packs.map((p) => (p.id === next.id ? next : p));
export const withoutPack = (packs: StickerPack[], id: string): StickerPack[] => packs.filter((p) => p.id !== id);
export const withoutItem = (pack: StickerPack, id: string): StickerPack => ({ ...pack, items: pack.items.filter((i) => i.id !== id) });

/** Items whose name or a tag contains every word of the query (case-insensitive), pack by pack. */
export function searchPacks(packs: StickerPack[], query: string): { pack: StickerPack; item: StickerItem }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: { pack: StickerPack; item: StickerItem }[] = [];
  for (const pack of packs) {
    for (const item of pack.items) {
      const hay = [item.name, ...(item.tags ?? [])].join(" ").toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push({ pack, item });
    }
  }
  return out;
}
