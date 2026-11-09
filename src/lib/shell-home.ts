// "Open Home": sends the user to the shell's Home, where an app's details and its "Access to other apps" setting live.
// The shell offers it as `molfarShell.openHome()` (engine 1.13.1 and newer, official apps only, heard from the app on
// screen). An older engine, or the design preview, has no such function: then there is no button and the text hint
// ("open Home, open the details of Social...") stays the only guide.

type Opener = () => Promise<unknown>;

/** The shell's openHome, or null when this engine does not have it. `win` is passed for the tests. */
export function homeOpener(win: unknown = typeof window === "undefined" ? undefined : window): Opener | null {
  try {
    const f = (win as { molfarShell?: { openHome?: Opener } } | undefined)?.molfarShell?.openHome;
    return typeof f === "function" ? f : null;
  } catch {
    return null;
  }
}

export const canOpenHome = (): boolean => homeOpener() !== null;

/** Switches the shell to Home. Never throws: a refusal leaves the user where they are, with the text hint. */
export function openHome(): void {
  const f = homeOpener();
  if (f) void f().catch(() => undefined);
}
