// The user's personas, shared by the shell (the "You" chip shows the active one) and the Your profile screen.
// Loaded once; in preview it starts from the mock data and stays in memory.
import { useSyncExternalStore } from "react";
import { PREVIEW } from "@/lib/api";
import { loadYou } from "./api";
import { EMPTY_YOU, MOCK_YOU, type YouState } from "./model";

let state: YouState | null = PREVIEW ? initial() : null;
let loading = false;
const listeners = new Set<() => void>();

function initial(): YouState {
  try {
    return new URLSearchParams(location.search).get("state") === "empty" ? EMPTY_YOU : MOCK_YOU;
  } catch {
    return MOCK_YOU;
  }
}

export function setYou(next: YouState): void {
  state = next;
  listeners.forEach((l) => l());
}

/** Reads the personas from the engine once. A failure leaves them unknown; the chip then shows "You". */
export function ensureYou(): void {
  if (state || loading) return;
  loading = true;
  loadYou()
    .then(setYou)
    .catch(() => undefined)
    .finally(() => {
      loading = false;
    });
}

/** The state, or null until it is known. */
export function useYou(): YouState | null {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => state,
  );
}
