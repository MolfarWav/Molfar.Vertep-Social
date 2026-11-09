// The Molfar pack that ships with Social (issue #347): animated pixel-art heads of Molfar in 8 moods, as stickers and as
// custom emoji. The files live in ./molfar and are bundled lazily by molfar-files.ts. This file is pure: the table, the pack
// shapes and the one helper that turns a bundled data URL back into a file. The pack manager adds the pack with the same
// upload code as a picture the user chose (an asset needs the app as its owner, so nothing else could add it).
import type { PackKind, StickerPack } from "./model";

export interface MolfarPackSpec {
  id: string;
  name: string;
  kind: PackKind;
  /** The file name part: `<item>-<suffix>.webp`. */
  suffix: "sticker" | "emoji";
}

export const MOLFAR_PACKS: MolfarPackSpec[] = [
  { id: "molfar", name: "Molfar", kind: "sticker", suffix: "sticker" },
  { id: "molfar-emoji", name: "Molfar emoji", kind: "emoji", suffix: "emoji" },
];

/** Item id, name and search tags (English, with a Ukrainian word for the search). */
export const MOLFAR_ITEMS: { id: string; name: string; tags: string[] }[] = [
  { id: "happy", name: "Happy", tags: ["smile", "joy", "радість"] },
  { id: "laugh", name: "Laughing", tags: ["lol", "wink", "сміх"] },
  { id: "sad", name: "Sad", tags: ["tear", "cry", "сум"] },
  { id: "love", name: "Love", tags: ["blush", "heart", "любов"] },
  { id: "smug", name: "Smug", tags: ["wink", "cheeky", "хитрий"] },
  { id: "sleepy", name: "Sleepy", tags: ["tired", "yawn", "сон"] },
  { id: "suspicious", name: "Suspicious", tags: ["side eye", "doubt", "підозра"] },
  { id: "deadpan", name: "Deadpan", tags: ["flat", "neutral", "байдуже"] },
];

/** The bundled file of one item: the key of the glob in molfar-files.ts. */
export const fileKey = (item: string, spec: MolfarPackSpec): string => `./molfar/${item}-${spec.suffix}.webp`;

/** The Molfar packs that are not in the list (a deleted one comes back through the same button). */
export const missingMolfar = (packs: StickerPack[]): MolfarPackSpec[] => MOLFAR_PACKS.filter((s) => !packs.some((p) => p.id === s.id));

/** A pack of this spec whose items are the uploaded urls, in the table's order. */
export function molfarPack(spec: MolfarPackSpec, urls: Record<string, string>): StickerPack {
  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    items: MOLFAR_ITEMS.filter((i) => urls[i.id]).map((i) => ({ id: i.id, name: i.name, url: urls[i.id]!, tags: i.tags })),
  };
}

/** The bytes of a `data:<mime>;base64,<...>` URL as a File. Read by hand: the app frame may not `fetch` a data URL. */
export function fileFromDataUrl(dataUrl: string, name: string): File | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: m[1]! });
}
