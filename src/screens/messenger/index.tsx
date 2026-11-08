import { useState, type ChangeEvent } from "react";
import "./messenger.css";
import { Avatar } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { CONTACTS, LOGS, type LogItem } from "@/mock/messenger";
import type { Status } from "@/mock/status";
import { useNav } from "@/shell/nav";
import { ChatLog, Composer, ContactGroups, EmptyBlock, STATUS_KEY } from "./parts";
import { PhoneChat, PhoneList } from "./phone";

// Messenger screen. Preview parameters (shot.cjs, reviewers, the Help guide):
//   screen=messenger                  the default: desktop with Мавка open; phone with the contact list
//   view=chat                         phone only: opens the chat with Перелесник (the phone chat board)
//   state=empty                       no profiles yet: "Import your characters" with Open Profiles
//   state=nohits                      search "Русалка" (no contact has that name): "Nobody named" + Clear search
//   state=offline                     the open chat is with Горпина (offline): the "will be delivered" line
//   state=failed                      the open chat ends with a failed reply and a "Try again" button
//   state=nomodel                     the open chat has the "no model chosen" line with a link to Settings
// Combine with the theme and language: ?screen=messenger&view=chat&theme=dark&lang=uk
// The state flags are preview only: they show on whichever chat is open, and "Try again" just hides the line.

type State = "empty" | "nohits" | "offline" | "failed" | "nomodel";
const STATES: State[] = ["empty", "nohits", "offline", "failed", "nomodel"];
const NOHITS_QUERY = "Русалка";

function readPreview(): { view: string | null; state: State | null } {
  try {
    const q = new URLSearchParams(location.search);
    const s = q.get("state");
    return { view: q.get("view"), state: STATES.includes(s as State) ? (s as State) : null };
  } catch {
    return { view: null, state: null };
  }
}

function hhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Messenger() {
  const t = useT();
  const phone = useIsPhone();
  const { go } = useNav();
  const [pv] = useState(readPreview);
  const empty = pv.state === "empty";
  const noModel = pv.state === "nomodel";

  const [query, setQuery] = useState(pv.state === "nohits" ? NOHITS_QUERY : "");
  const [sel, setSel] = useState(() => (pv.state === "offline" ? "horpyna" : pv.view === "chat" ? "pereles" : "mavka"));
  const [open, setOpen] = useState(() => pv.view === "chat"); // phone: is the chat screen showing
  const [searchOpen, setSearchOpen] = useState(() => pv.state === "nohits"); // phone: the search row
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, LogItem[]>>(LOGS);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(pv.state === "failed");

  const cur = CONTACTS.find((c) => c.id === sel) ?? CONTACTS[0];
  const needle = query.trim().toLowerCase();
  const list = empty ? [] : CONTACTS.filter((c) => c.name.toLowerCase().includes(needle));
  const items = logs[cur.id] ?? [];
  const draft = drafts[cur.id] ?? "";

  const pick = (id: string) => {
    setSel(id);
    setOpen(true);
  };
  const toggleGroup = (s: Status) => setFolded((f) => ({ ...f, [s]: !f[s] }));
  const setDraft = (v: string) => setDrafts((d) => ({ ...d, [cur.id]: v }));
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setLogs((l) => ({ ...l, [cur.id]: [...(l[cur.id] ?? []), { kind: "msg", who: "me", time: hhmm(), text }] }));
    setDraft("");
  };
  const clear = () => setDraft("");
  const toSettings = () => go("settings");
  const toProfiles = () => go("profiles");

  if (phone) {
    const chat = open && !empty;
    return (
      <div className="s-messenger">
        {chat ? (
          <PhoneChat
            c={cur}
            items={items}
            draft={draft}
            failed={failed}
            noModel={noModel}
            onDraft={setDraft}
            onSend={send}
            onClear={clear}
            onBack={() => setOpen(false)}
            onRetry={() => setFailed(false)}
            onSettings={toSettings}
          />
        ) : (
          <PhoneList
            empty={empty}
            list={list}
            query={query}
            searchOpen={searchOpen}
            folded={folded}
            onQuery={setQuery}
            onToggleSearch={() => setSearchOpen((o) => !o)}
            onClearSearch={() => setQuery("")}
            onToggleGroup={toggleGroup}
            onPick={pick}
            onProfiles={toProfiles}
          />
        )}
      </div>
    );
  }

  return (
    <div className="s-messenger">
      <div className="desk">
        <aside className="col list">
          <div className="tbar">{t("messenger.title")}</div>
          {!empty && (
            <input
              className="search"
              type="text"
              aria-label={t("messenger.search.label")}
              placeholder={t("messenger.search.placeholder")}
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            />
          )}
          <div className="plist">
            {empty ? (
              <EmptyBlock title={t("messenger.empty.title")} text={t("messenger.empty.text")}>
                <button type="button" className="btn cta" onClick={toProfiles}>{t("messenger.empty.cta")}</button>
              </EmptyBlock>
            ) : list.length === 0 ? (
              <EmptyBlock title={t("messenger.nohits", { q: query.trim() })}>
                <button type="button" className="btn" onClick={() => setQuery("")}>{t("messenger.nohits.clear")}</button>
              </EmptyBlock>
            ) : (
              <ContactGroups list={list} phone={false} sel={cur.id} folded={folded} onToggle={toggleGroup} onPick={pick} />
            )}
          </div>
          {!empty && (
            <div className="mine">
              <Flower status="online" size={22} />
              <span className="mystat">{t(STATUS_KEY.online)} ▾</span>
              <button type="button" className="ib" aria-label={t("messenger.addContact")}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </aside>

        {empty ? (
          <>
            <section className="col chat" />
            <aside className="col info" />
          </>
        ) : (
          <>
            <section className="col chat">
              <div className="tbar chat-tbar">
                <Avatar name={cur.name} hue={cur.hue} size={36} dim={cur.status === "off"} />
                <div className="hcol">
                  <span className="hname">{cur.name}</span>
                  <span className="hsub">
                    {t(STATUS_KEY[cur.status])} · {cur.note}
                  </span>
                </div>
              </div>
              <ChatLog
                c={cur}
                items={items}
                typing={cur.typing}
                failed={failed}
                noModel={noModel}
                phone={false}
                onRetry={() => setFailed(false)}
                onSettings={toSettings}
              />
              <Composer c={cur} value={draft} phone={false} onChange={setDraft} onSend={send} onClear={clear} />
            </section>

            <aside className="col info">
              <Avatar name={cur.name} hue={cur.hue} size={112} radius={10} dim={cur.status === "off"} />
              <div className="nm">{cur.name}</div>
              <div className="st">
                <Flower status={cur.status} size={20} />
                {t(STATUS_KEY[cur.status])}
              </div>
              <div>
                <div className="k">{t("messenger.info.schedule")}</div>
                <p>{cur.schedule}</p>
              </div>
              <div>
                <div className="k">{t("messenger.info.reply")}</div>
                <p>{cur.reply}</p>
              </div>
              <div>
                <div className="k">{t("messenger.info.first")}</div>
                <p>{cur.first}</p>
              </div>
              <button type="button" className="btn wide">{t("messenger.info.open")}</button>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
