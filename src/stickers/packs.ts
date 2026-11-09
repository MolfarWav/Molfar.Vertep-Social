// The user's packs as the page holds them: one shared list (the picker, the renderer and the manager all read it), loaded once
// from the stickers plugin and saved whole after every change. In the design preview (`?screen=`) nothing is fetched; a
// `?packs=demo` parameter seeds two small packs so a screenshot has something to draw.
import { useEffect, useSyncExternalStore } from "react";
import { call, PREVIEW } from "@/lib/api";
import { uploadPicture } from "@/screens/profiles/picture-api";
import { FILE_TYPES, MAX_FILE_BYTES, SIDE, type PackKind, type StickerPack } from "./model";
import { loadMolfarFile } from "./molfar-files";
import { fileFromDataUrl, fileKey, missingMolfar, MOLFAR_ITEMS, molfarPack } from "./molfar-pack";

let packs: StickerPack[] = [];
let state: "idle" | "loading" | "ready" = "idle";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function demo(): StickerPack[] {
  const face = (bg: string, mouth: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${bg}"/><circle cx="22" cy="26" r="4"/><circle cx="42" cy="26" r="4"/><path d="${mouth}" stroke="#000" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`)}`;
  return [
    { id: "faces", name: "Faces", kind: "sticker", items: [
      { id: "happy", name: "Happy", url: face("#ffd54a", "M18 40q14 14 28 0") },
      { id: "sad", name: "Sad", url: face("#7fb3ff", "M18 48q14 -14 28 0") },
      { id: "flat", name: "Flat", url: face("#c9c9c9", "M20 44h24") },
    ] },
    { id: "blobs", name: "Blobs", kind: "emoji", items: [
      { id: "red", name: "Red", url: face("#ff7a7a", "M20 42q12 8 24 0") },
      { id: "green", name: "Green", url: face("#8be28b", "M20 42q12 8 24 0") },
    ] },
  ];
}

export function getPacks(): StickerPack[] {
  return packs;
}

/** Loads the list once (`force` loads it again). Never throws: an engine that does not answer leaves the list as it was. */
export async function loadPacks(force = false): Promise<void> {
  if (!force && state !== "idle") return;
  state = "loading";
  if (PREVIEW) {
    try {
      if (new URLSearchParams(location.search).get("packs") === "demo") packs = demo();
    } catch {
      // no location
    }
    state = "ready";
    emit();
    return;
  }
  try {
    const r = await call<{ packs?: StickerPack[] }>("GET", "/stickers/packs");
    packs = Array.isArray(r.packs) ? r.packs : [];
  } catch {
    // keep what is held
  }
  state = "ready";
  emit();
}

/** The packs now, and a loading kick on first use. */
export function usePacks(): StickerPack[] {
  useEffect(() => {
    void loadPacks();
  }, []);
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    getPacks,
    getPacks,
  );
}

/** Shows `next` at once and saves it; resolves to "" when saved, or an error text (the list is then loaded again from the engine). */
export async function savePacks(next: StickerPack[]): Promise<string> {
  packs = next;
  emit();
  if (PREVIEW) return "";
  try {
    const r = await call<{ packs?: StickerPack[] }>("PUT", "/stickers/packs", { packs: next });
    if (Array.isArray(r.packs)) {
      packs = r.packs;
      emit();
    }
    return "";
  } catch (e) {
    await loadPacks(true);
    return e instanceof Error ? e.message : "could not save";
  }
}

/** Uploads a picture for a pack of this kind: scaled in the browser (GIF left alone), at most MAX_FILE_BYTES. Resolves to its URL. */
export async function uploadItem(file: File, kind: PackKind): Promise<string> {
  if (!FILE_TYPES.includes(file.type)) throw new Error("type");
  return uploadPicture(file, { side: SIDE[kind], maxBytes: MAX_FILE_BYTES });
}

/**
 * Adds the bundled Molfar packs that are missing: every picture is read from the build, uploaded the same way as a picture the
 * user chose (so the app owns the asset), then the packs are appended. Resolves to the new list (`packs` unchanged when
 * nothing could be added) and the names that failed.
 */
export async function addMolfarPacks(current: StickerPack[], progress: (done: number, total: number) => void): Promise<{ packs: StickerPack[]; failed: string[] }> {
  const specs = missingMolfar(current);
  const total = specs.length * MOLFAR_ITEMS.length;
  const failed: string[] = [];
  const added: StickerPack[] = [];
  let done = 0;
  for (const spec of specs) {
    const urls: Record<string, string> = {};
    for (const item of MOLFAR_ITEMS) {
      progress(done, total);
      try {
        const data = await loadMolfarFile(fileKey(item.id, spec));
        const file = data ? fileFromDataUrl(data, `${item.id}-${spec.suffix}.webp`) : null;
        if (!file) throw new Error("missing");
        urls[item.id] = await uploadItem(file, spec.kind);
      } catch {
        failed.push(`${spec.name}: ${item.name}`);
      }
      done++;
    }
    // a pack with no picture at all is not added
    if (Object.keys(urls).length) added.push(molfarPack(spec, urls));
  }
  progress(done, total);
  return { packs: [...current, ...added], failed };
}
