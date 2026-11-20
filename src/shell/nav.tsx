import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PREVIEW } from "@/lib/api";

/** "you" (Your profile) has no tab of its own: the "You" chip opens it, and on a phone the More page does. "journal" and "city" have tabs on desktop; on a phone the More page opens them, and Settings. "more" is that page (phone only: desktop has the gear). */
export type Tab = "messenger" | "forum" | "profiles" | "journal" | "city" | "settings" | "you" | "more";
export const TABS: Tab[] = ["messenger", "forum", "profiles", "journal", "city", "settings", "you", "more"];
export interface Chrome { bar: boolean; tabs: boolean }
const FULL: Chrome = { bar: true, tabs: true };

interface Nav {
  tab: Tab;
  go: (tab: Tab) => void;
  /** Open Profiles on one character's own profile (the messenger's "Open profile"). */
  openProfile: (id: string) => void;
  /** The profile Profiles should show when it opens; it is cleared once taken. */
  profileFocus: string | null;
  clearProfileFocus: () => void;
  /** Open the Messenger on one club (the City's room); it is cleared once taken. */
  openClub: (id: string) => void;
  clubFocus: string | null;
  clearClubFocus: () => void;
  /** Unread counts shown as badges on the tabs (the design preview shows fixed ones). */
  badges: { messenger: number; forum: number; journal: number };
  setBadges: (patch: Partial<{ messenger: number; forum: number; journal: number }>) => void;
  chrome: Chrome;
  setChrome: (c: Chrome) => void;
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}

const Ctx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(Ctx);
  if (!n) throw new Error("useNav outside NavProvider");
  return n;
}

/** Phone only: hide the top bar and/or the bottom tabs while a screen needs the whole height (an open chat). */
export function useChrome(c: Partial<Chrome>): void {
  const { setChrome } = useNav();
  const bar = c.bar ?? true;
  const tabs = c.tabs ?? true;
  useEffect(() => {
    setChrome({ bar, tabs });
    return () => setChrome(FULL);
  }, [bar, tabs, setChrome]);
}

/** Phone only: buttons for the right end of the top bar. Renders nothing on desktop. */
export function BarActions({ children }: { children: ReactNode }) {
  const { slot } = useNav();
  return slot ? createPortal(children, slot) : null;
}

function initialTab(): Tab {
  try {
    const s = new URLSearchParams(location.search).get("screen");
    if (s && (TABS as string[]).includes(s)) return s as Tab;
  } catch {
    // ignore
  }
  return "messenger";
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [chrome, setChrome] = useState<Chrome>(FULL);
  const [profileFocus, setProfileFocus] = useState<string | null>(null);
  const [clubFocus, setClubFocus] = useState<string | null>(null);
  const [badges, setBadgeState] = useState(PREVIEW ? { messenger: 1, forum: 3, journal: 1 } : { messenger: 0, forum: 0, journal: 0 });
  const setBadges = (patch: Partial<{ messenger: number; forum: number; journal: number }>) =>
    setBadgeState((b) => (Object.entries(patch).every(([k, v]) => b[k as "messenger" | "forum"] === v) ? b : { ...b, ...patch }));
  const openProfile = (id: string) => {
    setProfileFocus(id);
    setTab("profiles");
  };
  const clearProfileFocus = () => setProfileFocus(null);
  const openClub = (id: string) => {
    setClubFocus(id);
    setTab("messenger");
  };
  const clearClubFocus = () => setClubFocus(null);
  const value: Nav = { tab, go: setTab, openProfile, profileFocus, clearProfileFocus, openClub, clubFocus, clearClubFocus, badges, setBadges, chrome, setChrome, slot, setSlot };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
