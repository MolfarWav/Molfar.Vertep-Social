// The facts ledger of a chat (issue #446): what the character remembers as short facts, beside the note. The routes are
// GET and POST /messenger/facts; the Memory dialog is the only place that reads or changes them.
import { PREVIEW, call } from "@/lib/api";

export const FACT_KINDS = ["about_you", "about_me", "plan", "promise", "shared", "joke"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export interface Fact {
  id: string;
  text: string;
  kind: FactKind;
  /** When it was filed and the time of the message it comes from (ms). */
  at: number;
  from: number;
  /** Private facts are for this chat only. */
  private: boolean;
  pinned: boolean;
  by: "model" | "you";
}

export interface Ledger {
  facts: Fact[];
  /** Facts over the ceiling of 200: not sent to the model, kept here. */
  archive: Fact[];
  /** Archived facts that fell off the end of the archive. */
  dropped: number;
}

export const FACT_MAX = 160;

export type FactOp =
  | { op: "add"; text: string; kind?: FactKind; private?: boolean }
  | { op: "update"; factId: string; text?: string; kind?: FactKind; private?: boolean; pinned?: boolean }
  | { op: "delete"; factId: string }
  | { op: "restore"; factId: string };

// The design preview has no engine: a made-up ledger that the page can change (the same rules as the plugin, roughly).
const T = Date.parse("2026-11-12T12:00:00Z");
const fake = (n: number, text: string, kind: FactKind, extra: Partial<Fact> = {}): Fact => ({ id: "f" + n, text, kind, at: T + n * 3600_000, from: T + n * 3600_000, private: true, pinned: false, by: "model", ...extra });
let previewLedger: Ledger = {
  facts: [
    fake(1, "Serhii plays bass in a folk band and works as a sound engineer at a radio station.", "about_you", { private: false }),
    fake(2, "Serhii has a dog called Barsyk, a maltipoo who steals socks.", "about_you"),
    fake(3, "Serhii is allergic to hazelnuts, so no hazelnut cake.", "about_you", { pinned: true, by: "you" }),
    fake(4, "Rehearsals are on Thursdays at seven in the evening.", "plan"),
    fake(5, "Mavka promised to send a playlist of Ukrainian indie by Friday.", "promise"),
    fake(6, "Serhii calls his bass the potato bass (bulbovyi bas).", "joke"),
    fake(7, "The band plays a festival in Kharkiv on 14 December.", "plan", { private: false }),
  ],
  archive: [fake(8, "They once argued about whether a chorus pedal sounds like a submarine.", "joke")],
  dropped: 0,
};
const nextPreviewId = (): string => "f" + (Math.max(0, ...previewLedger.facts.concat(previewLedger.archive).map((f) => Number(f.id.slice(1)))) + 1);

export const loadFacts = async (id: string): Promise<Ledger> => {
  if (PREVIEW) return previewLedger;
  return call<Ledger>("GET", `/messenger/facts?id=${encodeURIComponent(id)}`);
};

export async function changeFacts(id: string, change: FactOp): Promise<Ledger> {
  if (PREVIEW) {
    const l = previewLedger;
    if (change.op === "add") l.facts.push(fake(Number(nextPreviewId().slice(1)), change.text, change.kind ?? "about_you", { by: "you", at: Date.now(), from: Date.now() }));
    else if (change.op === "delete") previewLedger = { ...l, facts: l.facts.filter((f) => f.id !== change.factId), archive: l.archive.filter((f) => f.id !== change.factId) };
    else if (change.op === "restore") {
      const f = l.archive.find((x) => x.id === change.factId);
      if (f) previewLedger = { ...l, archive: l.archive.filter((x) => x !== f), facts: [...l.facts, f] };
    } else {
      const f = l.facts.find((x) => x.id === change.factId);
      if (f) {
        if (change.text !== undefined) Object.assign(f, { text: change.text, by: "you" });
        if (change.pinned !== undefined) f.pinned = change.pinned;
        if (change.private !== undefined) f.private = change.private;
        if (change.kind) f.kind = change.kind;
      }
    }
    previewLedger = { ...previewLedger, facts: [...previewLedger.facts], archive: [...previewLedger.archive] };
    return previewLedger;
  }
  return call<Ledger & { ok?: boolean }>("POST", "/messenger/facts", { id, ...change });
}

/** The order of the list: pinned first, then the newest. */
export const byImportance = (a: Fact, b: Fact): number => Number(b.pinned) - Number(a.pinned) || b.from - a.from || b.at - a.at;

export type FactFilter = "all" | "pinned" | "private" | "archive";

export function filterFacts(l: Ledger, f: FactFilter): Fact[] {
  const list = f === "archive" ? l.archive : f === "pinned" ? l.facts.filter((x) => x.pinned) : f === "private" ? l.facts.filter((x) => x.private) : l.facts;
  return [...list].sort(byImportance);
}
