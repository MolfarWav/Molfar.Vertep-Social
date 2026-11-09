// "App settings" in the shell's Settings: the manifest names Social's settings page (`settingsView`), the shell lists
// Social under "App settings" and, when the entry is pressed, hands the name to the app (`molfarShell.onView`). An engine
// without the call never delivers anything, and Social is not listed there; More > Settings stays the way in.

type Subscribe = (fn: (view: string) => void) => () => void;

/** The shell's onView, or null when this engine does not have it. `win` is passed for the tests. */
export function viewSubscriber(win: unknown = typeof window === "undefined" ? undefined : window): Subscribe | null {
  try {
    const f = (win as { molfarShell?: { onView?: Subscribe } } | undefined)?.molfarShell?.onView;
    return typeof f === "function" ? f : null;
  } catch {
    return null;
  }
}

/** Listen for the view the shell asks for. Returns a function that stops; a no-op without engine support. */
export function onShellView(fn: (view: string) => void, win?: unknown): () => void {
  const sub = viewSubscriber(win);
  if (!sub) return () => undefined;
  try {
    const off = sub(fn);
    return typeof off === "function" ? off : () => undefined;
  } catch {
    return () => undefined;
  }
}
