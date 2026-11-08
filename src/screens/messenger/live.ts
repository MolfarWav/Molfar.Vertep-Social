// Real mode of the Messenger screen: the contact list (polled every 20 s), the open chat, sends and
// retries. Preview mode (`?screen=`) never calls the engine: every effect here returns early there.
import { useCallback, useEffect, useRef, useState } from "react";
import { PREVIEW, call } from "@/lib/api";
import { currentLang, useT } from "@/i18n/index";
import type { Contact, LogItem } from "@/mock/messenger";
import { useNav } from "@/shell/nav";
import {
  EMPTY_CHAT,
  chatView,
  clock,
  contactFromEngine,
  type ChatView,
  type EngineAnswer,
  type EngineChat,
  type EngineContact,
  type EngineFailure,
} from "./real";

const POLL_MS = 20000;

export interface LiveMessenger {
  /** The engine's contact list has answered at least once. */
  loaded: boolean;
  contacts: Contact[];
  /** The chat of a contact (an empty view until it is loaded). */
  chat: (id: string) => ChatView;
  send: (id: string, text: string) => void;
  retry: (id: string) => void;
}

/**
 * `sel` is the selected contact (the first one when none is selected); `open` is whether its chat is shown
 * (always on desktop, only the chat screen on phone). The chat of the shown contact is loaded, and marked read
 * when it was unread. The tab badge counts the unread contacts.
 */
export function useLiveMessenger(sel: string, open: boolean): LiveMessenger {
  const t = useT();
  const { setBadges } = useNav();
  const [raw, setRaw] = useState<EngineContact[] | null>(null);
  const [chats, setChats] = useState<Record<string, ChatView>>({});
  // Guards against a second send while one is in flight, and keeps a chat load from replacing the optimistic log.
  const busy = useRef<Record<string, boolean>>({});
  const alive = useRef(true);
  const rawRef = useRef<EngineContact[] | null>(null);
  const shownRef = useRef<string | undefined>(undefined);

  const shown = open && raw ? (raw.find((c) => c.id === sel) ?? raw[0])?.id : undefined;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    rawRef.current = raw;
  }, [raw]);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  const loadContacts = useCallback(async () => {
    try {
      const r = await call<{ contacts: EngineContact[] }>("GET", "/messenger/contacts");
      if (alive.current) setRaw(r.contacts);
    } catch {
      // keep the last list; the next poll asks again
    }
  }, []);

  const loadChat = useCallback(async (id: string) => {
    if (busy.current[id]) return;
    try {
      const r = await call<{ chat: EngineChat }>("GET", `/messenger/chat?id=${encodeURIComponent(id)}`);
      if (alive.current && !busy.current[id]) setChats((c) => ({ ...c, [id]: chatView(r.chat, id) }));
    } catch {
      // keep what the chat shows
    }
  }, []);

  // Contacts every 20 s while the screen is mounted; the shown chat comes along, so a reply that arrives
  // in the background shows without a reselect.
  useEffect(() => {
    if (PREVIEW) return;
    const tick = () => {
      void loadContacts();
      const id = shownRef.current;
      if (id) void loadChat(id);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [loadContacts, loadChat]);

  // The shown contact: load its chat, and mark it read when it was unread.
  useEffect(() => {
    if (PREVIEW || !shown) return;
    void loadChat(shown);
    if (rawRef.current?.find((c) => c.id === shown)?.unread) {
      setRaw((r) => r?.map((c) => (c.id === shown ? { ...c, unread: false } : c)) ?? r);
      void call("POST", "/messenger/read", { id: shown }).catch(() => undefined);
    }
  }, [shown, loadChat]);

  const unread = raw?.filter((c) => c.unread).length ?? 0;
  useEffect(() => {
    if (!PREVIEW) setBadges({ messenger: unread });
  }, [unread, setBadges]);

  const settle = useCallback(
    (id: string, request: Promise<EngineAnswer>) => {
      request
        .catch((e: unknown): EngineAnswer => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        .then((ans) => {
          busy.current[id] = false;
          if (!alive.current) return;
          setChats((c) => {
            const prev = c[id] ?? EMPTY_CHAT;
            const base = ans.chat ? chatView(ans.chat, id) : prev;
            const failed: EngineFailure | null = ans.ok
              ? base.failed
              : { error: ans.error ?? "", ...(ans.code === "no-model" ? { code: "no-model" as const } : {}) };
            return { ...c, [id]: { ...base, failed, busy: false, loaded: true } };
          });
          void loadContacts();
        });
    },
    [loadContacts],
  );

  const send = useCallback(
    (id: string, text: string) => {
      if (busy.current[id]) return;
      busy.current[id] = true;
      const at = Date.now();
      setChats((c) => {
        const prev = c[id] ?? EMPTY_CHAT;
        const mine: LogItem = { kind: "msg", who: "me", time: clock(at), text };
        return { ...c, [id]: { ...prev, items: [...prev.items, mine], firstAt: prev.firstAt ?? at, failed: null, busy: true } };
      });
      settle(id, call<EngineAnswer>("POST", "/messenger/send", { id, text }));
    },
    [settle],
  );

  const retry = useCallback(
    (id: string) => {
      if (busy.current[id]) return;
      busy.current[id] = true;
      setChats((c) => ({ ...c, [id]: { ...(c[id] ?? EMPTY_CHAT), failed: null, busy: true } }));
      settle(id, call<EngineAnswer>("POST", "/messenger/retry", { id }));
    },
    [settle],
  );

  const lang = currentLang();
  const contacts = raw ? raw.map((e) => contactFromEngine(e, lang, t)) : [];

  return {
    loaded: raw !== null,
    contacts,
    chat: (id: string) => chats[id] ?? EMPTY_CHAT,
    send,
    retry,
  };
}
