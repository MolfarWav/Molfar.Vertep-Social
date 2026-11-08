// The tab badges and the messages to the shell. The messenger and the forum screens set their own counts while they are
// open; this poll keeps both current while another tab is open (and after a topic is read: `refreshBadges`), reports the
// total to the shell for the app's own tab, and announces what is new (src/lib/shell-notify.ts).
import { useEffect, useRef } from "react";
import { PREVIEW, call } from "@/lib/api";
import { translate } from "@/i18n/index";
import { announce, announcements, reportCount, type Unread } from "@/lib/shell-notify";
import { useNav } from "@/shell/nav";

const EVENT = "social:badges";
const POLL_MS = 30000;

/** Asks the poll for an answer now. */
export function refreshBadges(): void {
  window.dispatchEvent(new Event(EVENT));
}

interface EngineContact {
  id: string;
  name: string;
  line: string;
  unread: boolean;
}

export function useBadgePoll(): void {
  const { setBadges } = useNav();
  const set = useRef(setBadges);
  set.current = setBadges;
  useEffect(() => {
    if (PREVIEW) return;
    let alive = true;
    let prev: Unread | null = null;
    let lastReported = -1;
    const poll = async () => {
      const [forum, contacts, settings] = await Promise.all([
        call<{ unread: number; latest?: { title: string; who: string; at: number } | null }>("GET", "/forum/unread").catch(() => null),
        call<{ contacts: EngineContact[] }>("GET", "/messenger/contacts").catch(() => null),
        call<{ settings: { notify?: { tab?: boolean; system?: boolean } } }>("GET", "/settings").catch(() => null),
      ]);
      if (!alive || (!forum && !contacts)) return; // keep the last numbers; the next poll asks again
      const now: Unread = {
        messenger: (contacts?.contacts ?? prev?.messenger.map((c) => ({ ...c, unread: true })) ?? []).filter((c) => c.unread).map((c) => ({ id: c.id, name: c.name, line: c.line })),
        forum: forum ? forum.unread : (prev?.forum ?? 0),
        forumLatest: forum ? (forum.latest ?? null) : (prev?.forumLatest ?? null),
      };
      set.current({ forum: now.forum, messenger: now.messenger.length });
      // the app's own switches (Settings > Notifications): the counter on the shell's tab, and the messages
      const sw = settings?.settings.notify;
      const count = sw?.tab === false ? 0 : now.forum + now.messenger.length;
      const news = announcements(prev, now, translate("shell.forum"));
      if (news.length && sw?.system !== false) announce(news[0]!, count);
      else if (count !== lastReported) reportCount(count);
      lastReported = count;
      prev = now;
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
