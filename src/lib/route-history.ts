// The forum navigates inside the page (home, board, topic, search), so the browser's Back button would leave the whole
// app. This keeps one history entry per forum step: going somewhere pushes an entry, Back pops it and the page follows.
// The route lives in `history.state` under one key and is checked before it is used (a state can come from anywhere).
// In a frame where the history is not writable (a sandbox without it) nothing is pushed and the in-page links still work.
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "socialForumRoute";

type Win = { history: Pick<History, "pushState" | "replaceState" | "state"> };

/** The route stored in a history state, or null when the state is not one of ours or fails `valid`. */
export function routeFromState<R>(state: unknown, valid: (r: unknown) => r is R): R | null {
  if (!state || typeof state !== "object") return null;
  const r = (state as Record<string, unknown>)[KEY];
  return valid(r) ? r : null;
}

/** Writes the route as a new entry (or over the current one); false when the browser refused. */
export function writeRoute<R>(win: Win, route: R, replace: boolean): boolean {
  try {
    const state = { [KEY]: route };
    if (replace) win.history.replaceState(state, "");
    else win.history.pushState(state, "");
    return true;
  } catch {
    return false;
  }
}

/**
 * The route state of a screen with its own pages. `go` pushes an entry (or replaces the current one), Back and Forward
 * give the route of the entry they land on, and an entry that is not ours means the first page, `initial`.
 */
export function useHistoryRoute<R>(initial: R, valid: (r: unknown) => r is R): [R, (r: R, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<R>(initial);
  const keep = useRef({ initial, valid });
  keep.current = { initial, valid };
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setRoute(routeFromState(e.state, keep.current.valid) ?? keep.current.initial);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((r: R, opts?: { replace?: boolean }) => {
    setRoute(r);
    writeRoute(window as unknown as Win, r, opts?.replace === true);
  }, []);
  return [route, go];
}
