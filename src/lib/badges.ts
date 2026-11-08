// The tab badges of the installed app. The messenger and the forum screens set their own count while they are open;
// this poll keeps the Forum badge current while another tab is open (and after a topic is read: `refreshBadges`).
import { useEffect, useRef } from "react";
import { PREVIEW, call } from "@/lib/api";
import { useNav } from "@/shell/nav";

const EVENT = "social:badges";
const POLL_MS = 30000;

/** Asks the poll for an answer now. */
export function refreshBadges(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function useBadgePoll(): void {
  const { setBadges } = useNav();
  const set = useRef(setBadges);
  set.current = setBadges;
  useEffect(() => {
    if (PREVIEW) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await call<{ unread: number }>("GET", "/forum/unread");
        if (alive) set.current({ forum: r.unread });
      } catch {
        // keep the last count; the next poll asks again
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    window.addEventListener(EVENT, poll);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(EVENT, poll);
    };
  }, []);
}
