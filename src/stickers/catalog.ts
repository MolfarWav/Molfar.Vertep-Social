// The catalog of free packs (issue #348): the list and the pictures come from the Social repo's catalog/ folder through the stickers
// plugin (the app frame cannot fetch from outside), and every picture is uploaded by this page like one the user chose, so the
// app owns the asset. Pure helpers are kept apart from the calls so they can be tested.
import { call, PREVIEW } from "@/lib/api";
import { uniqueId, type PackKind, type StickerPack } from "./model";
import { uploadItem } from "./packs";

export interface CatalogItem {
  id: string;
  name: string;
  file: string;
  tags?: string[];
}

export interface CatalogPack {
  id: string;
  name: string;
  kind: PackKind;
  description: string;
  author: string;
  license: string;
  /** What a card shows: "CC BY 4.0". */
  licenseLabel: string;
  source?: string;
  items: CatalogItem[];
}

export type CatalogAnswer = { ok: true; packs: CatalogPack[] } | { ok: false; error: string };

/** The bytes of a base64 string as a File of the given type. */
export function fileFromBase64(base64: string, mime: string, name: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** The pack as the list keeps it: the catalog's author and licence travel with it (a CC BY pack must show them). */
export function packFromCatalog(entry: CatalogPack, current: StickerPack[], urls: Record<string, string>): StickerPack {
  return {
    id: uniqueId(entry.id, current.map((p) => p.id), "pack"),
    name: entry.name,
    kind: entry.kind,
    items: entry.items.filter((i) => urls[i.id]).map((i) => ({ id: i.id, name: i.name, url: urls[i.id]!, ...(i.tags?.length ? { tags: i.tags } : {}) })),
    credit: { author: entry.author, license: entry.licenseLabel, ...(entry.source ? { source: entry.source } : {}) },
  };
}

/** Has this catalog pack been added already (a pack of the same id, or one that carries its credit)? */
export const isAdded = (entry: CatalogPack, current: StickerPack[]): boolean => current.some((p) => p.id === entry.id);

// the design preview (`?screen=`) has no engine: two small made-up entries
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DEMO: CatalogPack[] = [
  { id: "demo-faces", name: "Demo faces", kind: "sticker", description: "A made-up pack for the design preview.", author: "Nobody", license: "CC0-1.0", licenseLabel: "CC0 1.0", items: [{ id: "a", name: "A", file: "a.png" }, { id: "b", name: "B", file: "b.png" }] },
  { id: "demo-blobs", name: "Demo blobs", kind: "emoji", description: "Another one, with a longer description to see how a card wraps on a narrow screen.", author: "Somebody Else", license: "CC-BY-4.0", licenseLabel: "CC BY 4.0", source: "https://example.com", items: [{ id: "a", name: "A", file: "a.png" }] },
];

export async function loadCatalog(): Promise<CatalogAnswer> {
  if (PREVIEW) return { ok: true, packs: DEMO };
  try {
    const r = await call<{ ok?: boolean; error?: string; packs?: CatalogPack[] }>("GET", "/stickers/catalog");
    return r.ok && Array.isArray(r.packs) ? { ok: true, packs: r.packs } : { ok: false, error: r.error || "no answer" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "no answer" };
  }
}

/** The data URL of a pack's preview picture, or null. */
export async function loadPreview(id: string): Promise<string | null> {
  if (PREVIEW) return `data:image/png;base64,${PNG_1PX}`;
  try {
    const r = await call<{ ok?: boolean; dataUrl?: string }>("GET", `/stickers/catalog/preview?pack=${encodeURIComponent(id)}`);
    return r.ok && typeof r.dataUrl === "string" ? r.dataUrl : null;
  } catch {
    return null;
  }
}

/** One picture of a catalog pack as a File, or null when it could not be fetched. */
async function loadFile(pack: string, item: CatalogItem): Promise<File | null> {
  if (PREVIEW) return fileFromBase64(PNG_1PX, "image/png", item.file);
  try {
    const r = await call<{ ok?: boolean; mime?: string; base64?: string }>("GET", `/stickers/catalog/file?pack=${encodeURIComponent(pack)}&file=${encodeURIComponent(item.file)}`);
    return r.ok && r.mime && r.base64 ? fileFromBase64(r.base64, r.mime, item.file) : null;
  } catch {
    return null;
  }
}

/** Fetches and uploads every picture of a catalog pack, one after another; resolves to the new list and the names that failed. */
export async function addCatalogPack(entry: CatalogPack, current: StickerPack[], progress: (done: number, total: number) => void): Promise<{ packs: StickerPack[]; failed: string[] }> {
  const urls: Record<string, string> = {};
  const failed: string[] = [];
  let done = 0;
  for (const item of entry.items) {
    progress(done, entry.items.length);
    try {
      const file = await loadFile(entry.id, item);
      if (!file) throw new Error("missing");
      urls[item.id] = await uploadItem(file, entry.kind);
    } catch {
      failed.push(item.name);
    }
    done++;
  }
  progress(done, entry.items.length);
  return { packs: Object.keys(urls).length ? [...current, packFromCatalog(entry, current, urls)] : current, failed };
}
