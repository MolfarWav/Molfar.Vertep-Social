// The only layer that talks to the engine: the app's own plugin routes (/v1/apps/<id>/...) and the
// engine's model list. Routes are app-relative and same-origin; the page is behind the same session.
//
// Preview mode: a URL with `?screen=` is a design preview (screenshots, `scripts/shot.cjs`), which runs on mock data
// and never calls the engine. The installed app opens without it and is real.

export const PREVIEW: boolean = (() => {
  try {
    return new URLSearchParams(location.search).has("screen");
  } catch {
    return false;
  }
})();

// the frame URL is /app/<user>/<app>/ (the app's id is the third segment)
const APP_ID = (() => {
  try {
    return decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] ?? "social");
  } catch {
    return "social";
  }
})();

export const API = `/v1/apps/${APP_ID}`;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** One call to a plugin route. A non-2xx answer throws an ApiError carrying the route's `error` text. */
export async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(json?.error ?? `the engine answered ${res.status}`, res.status);
  return json as T;
}

export interface ModelChoice {
  /** "<provider>/<model>", the reference a plugin request takes. */
  ref: string;
  label: string;
}

/** The models the user has switched on (GET /v1/models). An engine that does not answer gives an empty list. */
export async function listModels(): Promise<ModelChoice[]> {
  try {
    const res = await fetch("/v1/models");
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: { provider: string; modelId: string; label?: string }[] };
    return (json.models ?? []).map((m) => ({ ref: `${m.provider}/${m.modelId}`, label: m.label || m.modelId }));
  } catch {
    return [];
  }
}
