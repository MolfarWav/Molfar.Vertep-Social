import { useEffect, useState, type ChangeEvent } from "react";
import "./messenger.css";
import { Avatar } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { currentLang, useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { useIsPhone } from "@/lib/use-phone";
import { CONTACTS, LOGS, type Contact, type LogItem } from "@/mock/messenger";
import type { Status } from "@/mock/status";
import { imageShown, usePicture, type Attached } from "@/pictures/use-picture";
import { useNav } from "@/shell/nav";
import { useLiveMessenger } from "./live";
import { ChatLog, Composer, ContactGroups, EmptyBlock, STATUS_KEY } from "./parts";
import { PhoneChat, PhoneList } from "./phone";
import { MemoryDialog } from "./memory";
import { dayLabel } from "./real";

// Real mode (no `?screen=`): the contacts and chats come from the engine (live.ts, real.ts), and the
// "real" flag below picks the real-mode strings and the layout that is not built yet (Profiles, no free schedule).
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
  const { go, openProfile } = useNav();
  const [pv] = useState(readPreview);
  const real = !PREVIEW;

  const [query, setQuery] = useState(pv.state === "nohits" ? NOHITS_QUERY : "");
  const [sel, setSel] = useState(() => (PREVIEW ? (pv.state === "offline" ? "horpyna" : pv.view === "chat" ? "pereles" : "mavka") : ""));
  const [open, setOpen] = useState(() => pv.view === "chat"); // phone: is the chat screen showing
  const [searchOpen, setSearchOpen] = useState(() => pv.state === "nohits"); // phone: the search row
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, LogItem[]>>(LOGS);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(pv.state === "failed");
  const [memOpen, setMemOpen] = useState(false);

  // Real mode: the engine's contacts and the open chat (inert in preview, where the mock is used).
  const live = useLiveMessenger(sel, phone ? open : true);
  const contacts: Contact[] = real ? live.contacts : CONTACTS;
  const loading = real && !live.loaded;
  const empty = real ? live.loaded && contacts.length === 0 : pv.state === "empty";
  const noModel = pv.state === "nomodel";

  const cur: Contact | undefined = contacts.find((c) => c.id === sel) ?? contacts[0];
  const curId = cur?.id ?? "";
  const view = live.chat(curId);
  const needle = query.trim().toLowerCase();
  const list = empty || loading ? [] : contacts.filter((c) => c.name.toLowerCase().includes(needle));
  const items = real ? view.items : logs[curId] ?? [];
  const draft = drafts[curId] ?? "";
  // the attach control of the message box; a picture waits for its own chat only
  const pic = usePicture({ phone });
  const clearPic = pic.clear;
  useEffect(() => clearPic(), [curId]);
  const busy = real && view.busy;
  const realFailed = view.failed && view.failed.code !== "no-model" ? view.failed : null;
  const failedNote = real ? realFailed !== null && !view.busy : failed;
  const failError = realFailed?.error || undefined;
  const noModelNote = real ? view.failed?.code === "no-model" && !view.busy : noModel;
  // a reply that waits for the contact to come back online (not while a send is in flight)
  const queued = real && view.pending && view.failed === null && !view.busy;
  const dayLine = real ? dayLabel(view.firstAt, Date.now(), currentLang(), t) : t("messenger.today");

  const pick = (id: string) => {
    setSel(id);
    setOpen(true);
  };
  const toggleGroup = (s: Status) => setFolded((f) => ({ ...f, [s]: !f[s] }));
  const setDraft = (v: string) => setDrafts((d) => ({ ...d, [curId]: v }));
  const send = () => {
    const text = draft.trim();
    const image = pic.attached;
    if ((!text && !image) || !cur) return;
    if (real) {
      if (busy) return; // one message at a time: the composer waits for the answer
      live.send(cur.id, text, image ?? undefined);
    } else {
      setLogs((l) => ({ ...l, [cur.id]: [...(l[cur.id] ?? []), { kind: "msg", who: "me", time: hhmm(), text, ...(image ? { image: imageShown(image) } : {}) }] }));
    }
    setDraft("");
    pic.clear();
  };
  const sendSticker = (sticker: Attached) => {
    if (!cur) return;
    if (real) {
      if (busy) return; // a sticker is a message of its own: one at a time, like text
      live.send(cur.id, "", sticker);
    } else setLogs((l) => ({ ...l, [cur.id]: [...(l[cur.id] ?? []), { kind: "msg", who: "me", time: hhmm(), text: "", image: imageShown(sticker) }] }));
  };
  const clear = () => setDraft("");
  const retry = () => {
    if (real) live.retry(curId);
    else setFailed(false);
  };
  useEffect(() => setMemOpen(false), [curId]);
  const memory = real && cur ? (
    memOpen && (
      <MemoryDialog
        name={cur.name}
        note={view.note}
        edited={view.noteEdited}
        count={view.count}
        phone={phone}
        onClose={() => setMemOpen(false)}
        onSave={(text) => live.saveNote(cur.id, text)}
        onNew={(keep) => live.startNew(cur.id, keep)}
        onClear={() => live.clearChat(cur.id)}
      />
    )
  ) : null;
  const toSettings = () => go("settings");
  const toProfiles = () => go("profiles");
  // Real mode: what is not built yet goes to Profiles (the "+", the profile buttons).
  const toProfilesReal = real ? toProfiles : undefined;
  // "Open profile" goes to this character's own profile, not to the list.
  const toProfileOfCur = real && cur ? () => openProfile(cur.id) : undefined;

  if (phone) {
    const chat = open && !empty ? cur : undefined;
    return (
      <div className="s-messenger">
        {chat ? (
          <PhoneChat
            c={chat}
            contacts={contacts}
            items={items}
            dayLine={dayLine}
            draft={draft}
            failed={failedNote}
            failError={failError}
            noModel={noModelNote}
            queued={queued}
            real={real}
            busy={busy}
            onDraft={setDraft}
            onSend={send}
            onSticker={sendSticker}
            onClear={clear}
            pic={pic}
            onBack={() => setOpen(false)}
            onRetry={retry}
            onSettings={toSettings}
            onProfile={toProfileOfCur}
            onMemory={real ? () => setMemOpen(true) : undefined}
          />
        ) : (
          <PhoneList
            empty={empty}
            real={real}
            loading={loading}
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
        {memory}
      </div>
    );
  }

  return (
    <div className="s-messenger">
      {memory}
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
              <EmptyBlock
                title={t(real ? "messenger.empty.noProfiles" : "messenger.empty.title")}
                text={t(real ? "messenger.empty.noProfilesText" : "messenger.empty.text")}
              >
                <button type="button" className="btn cta" onClick={toProfiles}>{t("messenger.empty.cta")}</button>
              </EmptyBlock>
            ) : loading ? null : list.length === 0 ? (
              <EmptyBlock title={t("messenger.nohits", { q: query.trim() })}>
                <button type="button" className="btn" onClick={() => setQuery("")}>{t("messenger.nohits.clear")}</button>
              </EmptyBlock>
            ) : (
              <ContactGroups list={list} phone={false} sel={curId} folded={folded} onToggle={toggleGroup} onPick={pick} />
            )}
          </div>
          {!empty && (
            <div className="mine">
              <Flower status="online" size={22} />
              <span className="mystat">{t(STATUS_KEY.online)} ▾</span>
              <button type="button" className="ib" aria-label={t("messenger.addContact")} onClick={toProfilesReal}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </aside>

        {empty || !cur ? (
          <>
            <section className="col chat" />
            <aside className="col info" />
          </>
        ) : (
          <>
            <section className="col chat">
              <div className="tbar chat-tbar">
                <Avatar name={cur.name} hue={cur.hue} size={36} dim={cur.status === "off"} picture={cur.picture} />
                <div className="hcol">
                  <span className="hname">{cur.name}</span>
                  <span className="hsub">
                    {t(STATUS_KEY[cur.status])}
                    {cur.note && <> · {cur.note}</>}
                  </span>
                </div>
              </div>
              <ChatLog
                c={cur}
                contacts={contacts}
                items={items}
                dayLine={dayLine}
                typing={cur.typing || busy}
                failed={failedNote}
                failError={failError}
                noModel={noModelNote}
                queued={queued}
                real={real}
                phone={false}
                onRetry={retry}
                onSettings={toSettings}
              />
              <Composer c={cur} value={draft} phone={false} real={real} busy={busy} onChange={setDraft} onSend={send} onClear={clear} pic={pic} onSticker={sendSticker} />
            </section>

            <aside className="col info">
              <Avatar name={cur.name} hue={cur.hue} size={112} radius={10} dim={cur.status === "off"} picture={cur.picture} />
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
              {!real && (
                <div>
                  <div className="k">{t("messenger.info.first")}</div>
                  <p>{cur.first}</p>
                </div>
              )}
              {real && (
                <div>
                  <div className="k">{t("messenger.info.memory")}</div>
                  <p className={view.note ? "mem-note" : "mem-none"}>{view.note || t("messenger.memory.none")}</p>
                  <button type="button" className="btn wide mem-open" onClick={() => setMemOpen(true)}>{t("messenger.memory.open")}</button>
                </div>
              )}
              <button type="button" className="btn wide" onClick={toProfileOfCur}>{t("messenger.info.open")}</button>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
