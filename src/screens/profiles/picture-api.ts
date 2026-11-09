// The picture of a profile: the engine's image models and one generation. App pages may reach both engine routes:
// GET /v1/images/models and POST /v1/images (the picture lands in the engine's asset store and comes back as a
// same-origin URL, "/v1/assets/<id>", which the profile keeps). In preview mode (`?screen=`) both are fakes.
//
// A picture from the user's disk goes through `uploadPicture`: big images are scaled down in the browser, then PUT to
// /v1/assets like a generated one.
//
// Preview states: `?picture=fail` makes the generation fail, `?picture=nomodel` says no image model is set up.
import { ANIMATION_PROBE_BYTES, isAnimatedImage } from "@/lib/animated-image";
import { PREVIEW, ApiError } from "@/lib/api";
import type { Opt } from "@/screens/settings/controls";

export interface ImageModel {
  /** "<provider>/<id>", what POST /v1/images takes as `model`. */
  ref: string;
  label: string;
  provider: string;
}

/** The engine's answer of GET /v1/images/models (the fields this screen reads). */
interface ModelsAnswer {
  models?: { provider?: string; id?: string; label?: string; connectionName?: string }[];
  favorites?: { ref?: string; name?: string }[];
}

/** The image models as options: the user's own list (Settings > Images) first, in its order, then the rest. */
export function imageModelsFrom(raw: ModelsAnswer): ImageModel[] {
  const all = (raw.models ?? [])
    .filter((m) => typeof m.provider === "string" && typeof m.id === "string")
    .map((m) => ({ ref: `${m.provider}/${m.id}`, label: m.label || m.id || "", provider: m.connectionName || m.provider || "" }));
  const byRef = new Map(all.map((m) => [m.ref, m]));
  const mine: ImageModel[] = [];
  const taken = new Set<string>();
  for (const f of raw.favorites ?? []) {
    const m = typeof f.ref === "string" ? byRef.get(f.ref) : undefined;
    if (!m || taken.has(m.ref)) continue;
    taken.add(m.ref);
    mine.push(f.name ? { ...m, label: f.name } : m);
  }
  return [...mine, ...all.filter((m) => !taken.has(m.ref))];
}

/** The options of the picker: the engine's default first (""), then the models. */
export function imageOptions(models: ImageModel[], current: string, engineDefault: string): Opt<string>[] {
  const opts: Opt<string>[] = [{ value: "", label: engineDefault }, ...models.map((m) => ({ value: m.ref, label: m.label, group: m.provider, sub: m.ref.slice(m.ref.indexOf("/") + 1) }))];
  if (current && !models.some((m) => m.ref === current)) opts.push({ value: current, label: current });
  return opts;
}

const PREVIEW_MODELS: ImageModel[] = [
  { ref: "mock/flux-schnell", label: "Flux Schnell", provider: "Mock images" },
  { ref: "mock/sdxl", label: "SDXL", provider: "Mock images" },
];

export async function listImageModels(): Promise<ImageModel[]> {
  if (PREVIEW) return PREVIEW_MODELS;
  try {
    const res = await fetch("/v1/images/models");
    if (!res.ok) return [];
    return imageModelsFrom((await res.json()) as ModelsAnswer);
  } catch {
    return [];
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A canned picture for the preview: a soft gradient, tinted by the hue. */
function fakePicture(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 50% 28%)"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><circle cx="128" cy="104" r="44" fill="hsl(${hue} 30% 86%)"/><path d="M40 256c8-62 44-88 88-88s80 26 88 88z" fill="hsl(${hue} 30% 86%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Draws one picture. Resolves to its URL; throws an ApiError whose text says what went wrong. */
export async function generatePicture(prompt: string, model: string, hue: number): Promise<string> {
  if (PREVIEW) {
    await delay(700);
    const mode = new URLSearchParams(location.search).get("picture");
    if (mode === "nomodel") throw new ApiError("No image model is set up in Molfar Vertep.", 503);
    if (mode === "fail") throw new ApiError("the image server did not answer", 502);
    return fakePicture(hue);
  }
  const res = await fetch("/v1/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, ...(model ? { model } : {}) }),
  });
  const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !json?.url) throw new ApiError(json?.error ?? `the engine answered ${res.status}`, res.status);
  return json.url;
}

export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const PICTURE_MAX_BYTES = 10 * 1024 * 1024;
/** Longest side of a stored picture: a profile picture is shown small, so more pixels only cost space. */
export const PICTURE_MAX_SIDE = 768;

/** The size to scale to: the same shape, longest side at most `max`; never bigger than the original. */
export function fitSize(w: number, h: number, max = PICTURE_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Scales a still image down to PICTURE_MAX_SIDE (WebP where the browser can, else it stays). GIFs, animated WebP and APNG, and small images stay as they are. */
async function shrink(file: File, side = PICTURE_MAX_SIDE, keepUnder = 1024 * 1024): Promise<{ blob: Blob; mime: string }> {
  const same = { blob: file as Blob, mime: file.type };
  if (file.type === "image/gif") return same;
  // an animated WebP or APNG goes as it is: a canvas would keep one frame only (the caller still checks its byte limit)
  if (file.type === "image/webp" || file.type === "image/png") {
    try {
      if (isAnimatedImage(new Uint8Array(await file.slice(0, ANIMATION_PROBE_BYTES).arrayBuffer()))) return same;
    } catch {
      // unreadable: treated as a still image below
    }
  }
  try {
    const bmp = await createImageBitmap(file);
    const { w, h } = fitSize(bmp.width, bmp.height, side);
    if (w === bmp.width && h === bmp.height && file.size <= keepUnder) return same;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
    return blob && PICTURE_TYPES.includes(blob.type) ? { blob, mime: blob.type } : same;
  } catch {
    return same;
  }
}

/** Stores a picture the user picked from disk. Resolves to its URL; throws an ApiError whose text says what went wrong. */
export async function uploadPicture(file: File, opts: { side?: number; maxBytes?: number } = {}): Promise<string> {
  if (PREVIEW) {
    await delay(300);
    return await new Promise<string>((ok, bad) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result ?? ""));
      r.onerror = () => bad(new ApiError("the picture could not be read", 0));
      r.readAsDataURL(file);
    });
  }
  const { blob, mime } = await shrink(file, opts.side, opts.maxBytes);
  if (opts.maxBytes && blob.size > opts.maxBytes) throw new ApiError("the picture is too big", 413);
  const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "picture";
  const res = await fetch(`/v1/assets?name=${encodeURIComponent(name)}`, { method: "PUT", headers: { "content-type": mime }, body: blob });
  const json = (await res.json().catch(() => null)) as { id?: unknown; error?: string } | null;
  if (!res.ok || typeof json?.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(json.id)) throw new ApiError(json?.error ?? `the engine answered ${res.status}`, res.status);
  return `/v1/assets/${json.id}`;
}
