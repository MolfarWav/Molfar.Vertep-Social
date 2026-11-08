import { useSyncExternalStore } from "react";

/** Phone layout below 768 px: bottom tabs, one column, full-screen chat. */
const QUERY = "(max-width: 767px)";

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
