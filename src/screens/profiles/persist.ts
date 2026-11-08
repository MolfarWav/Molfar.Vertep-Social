// Saving the Profiles screen to the engine (real mode only; preview never calls).
// The screen keeps each profile's saved form in its store. This layer sends a
// profile when its saved form differs from the copy the server last confirmed.
// Drafts never reach it. The pure helpers are tested in test/persist.test.ts.
import { call } from "@/lib/api";
import type { MockProfile, ProfileForm } from "@/mock/profiles";

export type Send = (method: "PUT" | "DELETE", path: string, body?: unknown) => Promise<unknown>;

/** The profile the server stores: identity and source plus the saved form. */
export function fullProfile(profile: MockProfile, saved: ProfileForm): MockProfile {
  return { ...profile, ...saved };
}

/** A profile as the server returns it, without its own timestamps. */
export function stripStamps(raw: MockProfile & { createdAt?: string; updatedAt?: string }): MockProfile {
  const out = { ...raw };
  delete out.createdAt;
  delete out.updatedAt;
  return out;
}

/** JSON with the keys sorted, so two copies of one profile compare equal whatever their key order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/** The text of an error for a notice: the engine's message, or the network's. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Keeps the server's copy in step with the screen. One request at a time per
 * profile (a queue), so answers arrive in the order they were sent. A failed
 * save leaves the confirmed copy as it was; the next change tries again.
 */
export class ProfileSync {
  /** The stable JSON of the copy the server last confirmed, by id. */
  private confirmed = new Map<string, string>();
  /** The latest full profile the screen reported, by id. */
  private latest = new Map<string, MockProfile>();
  private queue = new Map<string, Promise<unknown>>();

  constructor(private send: Send) {}

  /** Loading: the copy the server returned is the confirmed one, so loading never saves. */
  seed(full: MockProfile): void {
    this.confirmed.set(full.id, stableJson(full));
    this.latest.set(full.id, full);
  }

  /** The screen reports the full profile it shows, so a later flush sends the current one. */
  track(full: MockProfile): void {
    this.latest.set(full.id, full);
  }

  isConfirmed(full: MockProfile): boolean {
    return this.confirmed.get(full.id) === stableJson(full);
  }

  /** Sends the profile unless the server has this exact copy. */
  save(full: MockProfile): Promise<void> {
    this.track(full);
    return this.enqueue(full.id, async () => {
      const json = stableJson(full);
      if (this.confirmed.get(full.id) === json) return;
      await this.send("PUT", `/profiles/${encodeURIComponent(full.id)}`, full);
      this.confirmed.set(full.id, json);
    }) as Promise<void>;
  }

  /** Makes sure the server has the latest saved copy of a profile (Fill empty reads it). */
  flush(id: string): Promise<void> {
    const full = this.latest.get(id);
    return full ? this.save(full) : Promise.resolve();
  }

  /** Deletes on the server, after the profile's pending saves. */
  remove(id: string): Promise<void> {
    return this.enqueue(id, async () => {
      await this.send("DELETE", `/profiles/${encodeURIComponent(id)}`);
      this.confirmed.delete(id);
      this.latest.delete(id);
    }) as Promise<void>;
  }

  private enqueue(id: string, task: () => Promise<unknown>): Promise<unknown> {
    const run = (this.queue.get(id) ?? Promise.resolve()).then(task);
    this.queue.set(id, run.catch(() => undefined));
    return run;
  }
}

/** The sync the screen and the fill call share. */
export const sync = new ProfileSync((method, path, body) => call(method, path, body));

/** Saves the profile's latest saved copy before a call that reads it on the engine. */
export function flushProfile(id: string): Promise<void> {
  return sync.flush(id);
}
