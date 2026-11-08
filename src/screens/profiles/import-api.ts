// The Roleplay import as the screen sees it: what the plugin says can be imported, the run (one card at a time, a
// failing card stops only itself), and the diff of "Update from Roleplay". The plugin routes are in
// plugins/profiles/plugin.js (GET /profiles/roleplay, POST /profiles/import, POST /profiles/refresh). Preview mode
// (`?screen=`) never calls them: the screen gives the runner a mock `exec` instead. Pure parts are tested in
// test/import-api.test.ts.
import { call } from "@/lib/api";
import type { MockProfile, ProfileForm } from "@/mock/profiles";
import type { ImportEntry, ImportKind, ImportRef } from "@/mock/profiles-import";
import { stripStamps } from "./persist";

// ---------- what can be imported ----------

export interface HiddenCounts {
  group: number;
  assistant: number;
  unreadable: number;
}

export type RoleplayScan =
  | { state: "closed" }
  | { state: "ready"; entries: ImportEntry[]; hidden: HiddenCounts; truncated: boolean };

const KINDS: ImportKind[] = ["character", "persona", "narrator"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** One row of the plugin's answer as an import entry; null when it is not a usable row. */
export function readEntry(raw: unknown): ImportEntry | null {
  if (!isObj(raw)) return null;
  const { id, name, card, soul, hue, kind, parent, ref } = raw;
  if (typeof id !== "string" || !id || typeof name !== "string" || !name || !KINDS.includes(kind as ImportKind)) return null;
  const r: ImportRef | undefined = isObj(ref) && (ref.kind === "card" || ref.kind === "persona") && typeof ref.id === "string" ? { kind: ref.kind, id: ref.id, ...(typeof ref.key === "string" && ref.key ? { key: ref.key } : {}) } : undefined;
  if (!r && kind !== "narrator") return null;
  return {
    id,
    name,
    card: typeof card === "string" ? card : "",
    soul: soul !== false,
    hue: typeof hue === "number" ? hue : 0,
    kind: kind as ImportKind,
    ...(typeof parent === "string" && parent ? { parent } : {}),
    ...(r ? { ref: r } : {}),
  };
}

/** The plugin's scan answer: characters then personas, bad rows dropped, a member without its narrator row kept loose. */
export function readScan(json: unknown): RoleplayScan {
  if (!isObj(json) || json.state !== "ready") return { state: "closed" };
  const rows = [...(Array.isArray(json.characters) ? json.characters : []), ...(Array.isArray(json.personas) ? json.personas : [])];
  const entries = rows.map(readEntry).filter((e): e is ImportEntry => !!e);
  const ids = new Set(entries.map((e) => e.id));
  const fixed = entries.map((e) => (e.parent && !ids.has(e.parent) ? { ...e, parent: undefined } : e));
  const h = isObj(json.hidden) ? json.hidden : {};
  return { state: "ready", entries: fixed, hidden: { group: count(h.group), assistant: count(h.assistant), unreadable: count(h.unreadable) }, truncated: json.truncated === true };
}

export async function scanRoleplay(): Promise<RoleplayScan> {
  return readScan(await call<unknown>("GET", "/profiles/roleplay"));
}

/** Whether Social may read Roleplay right now (a cheap call: nothing is read). */
export async function roleplayState(): Promise<"ready" | "closed"> {
  try {
    const r = await call<{ state?: string }>("GET", "/profiles/roleplay/status");
    return r.state === "ready" ? "ready" : "closed";
  } catch {
    return "closed";
  }
}

// ---------- one import ----------

type PluginReply<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

/** The reason a call failed, with the plugin's code when it has one. */
export class ImportError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Imports one entry: the plugin reads the card, asks the model and files the profile. Returns it as the screen holds it. */
export async function importOne(entry: ImportEntry, model: string): Promise<MockProfile> {
  if (!entry.ref) throw new ImportError("this row cannot be imported");
  const body = { ...entry.ref, ...(model ? { model } : {}) };
  const res = await call<PluginReply<{ profile: MockProfile & { createdAt?: string; updatedAt?: string } }>>("POST", "/profiles/import", body);
  if (!res.ok) throw new ImportError(res.error, res.code);
  return stripStamps(res.profile);
}

/** What a new reading of the card proposes for the profile's text fields. */
export interface Digest {
  about: string;
  interests: string[];
  voiceText: string;
}

export async function refreshOne(profileId: string, model = ""): Promise<{ digest: Digest; cardDate: string }> {
  const res = await call<PluginReply<{ proposal: Partial<Digest>; cardDate?: string }>>("POST", "/profiles/refresh", { profileId, ...(model ? { model } : {}) });
  if (!res.ok) throw new ImportError(res.error, res.code);
  const p = res.proposal;
  return {
    digest: { about: typeof p.about === "string" ? p.about : "", interests: Array.isArray(p.interests) ? p.interests.filter((x): x is string => typeof x === "string") : [], voiceText: typeof p.voiceText === "string" ? p.voiceText : "" },
    cardDate: typeof res.cardDate === "string" ? res.cardDate : "",
  };
}

// ---------- the run ----------

export type RunStatus = "queued" | "reading" | "done" | "failed";

export interface RunSnapshot {
  entries: ImportEntry[];
  status: Record<string, RunStatus>;
  /** Why a failed card failed, by entry id. */
  errors: Record<string, string>;
  /** Stop was pressed: what was not started stays queued and nothing more starts. */
  stopped: boolean;
}

export type Exec = (entry: ImportEntry) => Promise<MockProfile>;

/**
 * Imports entries one at a time. It lives outside React so the run goes on when the dialog is closed; the screen
 * subscribes to the snapshot and gets every finished profile through `onProfile`. A failed entry stays failed until
 * `retry`; Stop lets the running card finish and starts no more.
 */
export class ImportRunner {
  private snap: RunSnapshot;
  private listeners = new Set<() => void>();
  private busy = false;
  private made = new Map<string, MockProfile>();

  constructor(
    entries: ImportEntry[],
    private exec: Exec,
    private onProfile: (p: MockProfile) => void = () => undefined,
    /** A frozen run (design preview) starts from this and executes nothing until a card is retried. */
    frozen?: Record<string, RunStatus>,
  ) {
    const status = Object.fromEntries(entries.map((e) => [e.id, frozen?.[e.id] ?? "queued"])) as Record<string, RunStatus>;
    this.snap = { entries, status, errors: {}, stopped: false };
    this.isFrozen = !!frozen;
  }
  private isFrozen: boolean;

  snapshot = (): RunSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private set(patch: Partial<RunSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of [...this.listeners]) l();
  }

  private mark(id: string, status: RunStatus, error?: string): void {
    const errors = { ...this.snap.errors };
    if (error) errors[id] = error;
    else delete errors[id];
    this.set({ status: { ...this.snap.status, [id]: status }, errors });
  }

  /** True when nothing is queued or running (stopped runs count as finished). */
  get finished(): boolean {
    if (this.isFrozen) return Object.values(this.snap.status).every((s) => s === "done" || s === "failed");
    return !this.busy && (this.snap.stopped || !this.snap.entries.some((e) => this.snap.status[e.id] === "queued"));
  }

  start(): void {
    if (this.isFrozen || this.busy) return;
    void this.pump();
  }

  retry(id: string): void {
    if (this.snap.status[id] !== "failed") return;
    this.isFrozen = false;
    this.mark(id, "queued");
    this.set({ stopped: false });
    this.start();
  }

  stop(): void {
    this.set({ stopped: true });
  }

  doneIds(): string[] {
    return this.snap.entries.filter((e) => this.snap.status[e.id] === "done").map((e) => e.id);
  }

  profileOf(id: string): MockProfile | undefined {
    return this.made.get(id);
  }

  private async pump(): Promise<void> {
    this.busy = true;
    try {
      for (;;) {
        if (this.snap.stopped) break;
        const next = this.snap.entries.find((e) => this.snap.status[e.id] === "queued");
        if (!next) break;
        this.mark(next.id, "reading");
        try {
          const p = await this.exec(next);
          this.made.set(next.id, p);
          this.mark(next.id, "done");
          this.onProfile(p);
        } catch (e) {
          this.mark(next.id, "failed", e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      this.busy = false;
      this.set({});
    }
  }
}

// ---------- update from Roleplay ----------

export interface DiffRow {
  field: "about" | "voice" | "interests";
  removed: string[];
  added: string[];
}

export interface UpdateDiff {
  rows: DiffRow[];
  /** What Accept puts into the draft. */
  patch: Partial<ProfileForm>;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * What the new reading changes: the About text and the voice description when they differ (the old line struck, the
 * new one added), and interests the profile does not have yet (added to the end, none removed). Habits, the forum
 * fields and the schedule are never touched. Null when nothing changes.
 */
export function makeDiff(form: ProfileForm, d: Digest): UpdateDiff | null {
  const rows: DiffRow[] = [];
  const patch: Partial<ProfileForm> = {};
  const about = d.about.trim();
  if (about && norm(about) !== norm(form.about)) {
    rows.push({ field: "about", removed: form.about.trim() ? [form.about.trim()] : [], added: [about] });
    patch.about = about;
  }
  const voice = d.voiceText.trim();
  if (voice && norm(voice) !== norm(form.voice.text)) {
    rows.push({ field: "voice", removed: form.voice.text.trim() ? [form.voice.text.trim()] : [], added: [voice] });
    patch.voice = { ...form.voice, text: voice };
  }
  const have = new Set(form.interests.map((x) => norm(x).toLowerCase()));
  const fresh = d.interests.map(norm).filter((x, i, a) => x && !have.has(x.toLowerCase()) && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  if (fresh.length) {
    rows.push({ field: "interests", removed: [], added: fresh });
    patch.interests = [...form.interests, ...fresh].slice(0, 12);
  }
  return rows.length ? { rows, patch } : null;
}

/** "2026-11-09" as a short date in the UI language ("9 листопада", "9 November"); anything else is shown as it is. */
export function cardDateLabel(value: string | undefined, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return value ?? "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return value ?? "";
  try {
    return new Intl.DateTimeFormat(lang === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  } catch {
    return value ?? "";
  }
}
