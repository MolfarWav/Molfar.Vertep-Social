// The picture that comes along with a Roleplay import. The profiles plugin FINDS the image (the card's avatar, else the
// portrait set for the name in Roleplay's Soul tab: POST /profiles/avatar) but cannot store it; this file uploads it to
// the engine's asset store as an asset of Social and returns the address a profile keeps in `picture`.
//
// Roleplay's own stored images ("/v1/assets/<id>") belong to Roleplay and are not visible to Social, so fetching one
// usually fails: that is not an error, the profile then keeps its letter avatar. Pure parts: test/roleplay-avatar.test.ts.
import { call, PREVIEW } from "@/lib/api";

/** Where a picture was found: the card, the persona, or the Soul tab's portrait of the name. */
export type AvatarFrom = "card" | "persona" | "soul";
export interface FoundAvatar {
  url: string;
  from: AvatarFrom;
}

/** Bigger images are not uploaded (Roleplay keeps portraits at 512 px; a profile picture is shown small). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ASSET = /^\/v1\/assets\/([A-Za-z0-9_-]{1,80})$/;
const DATA = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

/** The plugin's answer as a found picture, or null. */
export function readFound(json: unknown): FoundAvatar | null {
  if (typeof json !== "object" || json === null) return null;
  const a = (json as { avatar?: unknown }).avatar;
  if (typeof a !== "object" || a === null) return null;
  const { url, from } = a as { url?: unknown; from?: unknown };
  if (typeof url !== "string" || !url) return null;
  if (!(ASSET.test(url) || DATA.test(url))) return null;
  return { url, from: from === "persona" || from === "soul" ? from : "card" };
}

/** The bytes and the type of a data:image address; null for anything else. */
export function decodeData(url: string): { bytes: Uint8Array; mime: string } | null {
  const m = DATA.exec(url);
  if (!m) return null;
  try {
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime: m[1]! };
  } catch {
    return null;
  }
}

async function upload(bytes: Uint8Array, mime: string, name: string): Promise<string | null> {
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES || !MIMES.includes(mime)) return null;
  const res = await fetch(`/v1/assets?name=${encodeURIComponent(name.slice(0, 80))}`, {
    method: "PUT",
    headers: { "content-type": mime },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) return null;
  const rec = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return rec && typeof rec.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(rec.id) ? `/v1/assets/${rec.id}` : null;
}

/** Stores the found picture as an asset of Social. The asset address, or null when it could not be stored. */
export async function storeAvatar(url: string, name: string): Promise<string | null> {
  const data = decodeData(url);
  if (data) return upload(data.bytes, data.mime, name);
  if (!ASSET.test(url)) return null;
  // an address in the asset store: readable only when the engine lets Social see it; storing the same bytes again
  // makes Social an owner of the (content-addressed) asset
  const res = await fetch(url);
  if (!res.ok) return null;
  const mime = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  return upload(new Uint8Array(await res.arrayBuffer()), mime, name);
}

export type AvatarTarget = { profileId: string } | { personaId: string };

/**
 * The picture for a profile or a persona that was just imported: asks the plugin to find it, then stores it. Never
 * throws and never blocks the import: any failure is an empty string (the profile keeps its letter avatar).
 */
export async function avatarFor(target: AvatarTarget, name: string): Promise<string> {
  if (PREVIEW) return "";
  try {
    const found = readFound(await call<unknown>("POST", "/profiles/avatar", target));
    return found ? ((await storeAvatar(found.url, name)) ?? "") : "";
  } catch {
    return "";
  }
}
