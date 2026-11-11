// Clubs in the messenger (issue #368): group chats of three or four characters around an interest.
//   ClubsGroup    a group at the top of the contact list: a row per club, a "New club" button, and what to do when the feature is off.
//   ClubView      an open club: header (members, the Active switch, Edit), the log (a row per message with the sender's avatar and name),
//                 the message box. It fills the chat column on desktop and the whole screen on a phone.
//   ClubInfo      the desktop's right column: the members with their status, the interest, how it works.
//   ClubDialog    "New club" and "Edit club": a name, an interest and the member picker (a search box and ticks, never a native select).
// Nothing here talks to the engine except through clubs-api.ts (which answers from a fake in the design preview).
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, themColor } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { currentLang, useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { Dialog } from "@/screens/profiles/dialog";
import { Field } from "@/screens/profiles/ui";
import { useChrome } from "@/shell/nav";
import { createClub, editClub, loadClubChat, loadClubs, removeClub, sendToClub } from "./clubs-api";
import {
  INTEREST_MAX,
  MAX_MEMBERS,
  NAME_MAX,
  canSave,
  clubLine,
  filterPeople,
  memberNames,
  newClubBlock,
  pickState,
  toggleMember,
  type Club,
  type ClubChat,
  type ClubList,
  type ClubMessage,
  type Pickable,
} from "./clubs-model";
import { Composer, STATUS_KEY } from "./parts";
import { clock, dayLabel } from "./real";

const POLL_MS = 20000;
const CHAT_POLL_MS = 15000;

/** The club list, loaded now and every 20 s; `reload` asks again at once. `null` until the first answer. */
export function useClubs(): { list: ClubList | null; reload: () => void } {
  const [list, setList] = useState<ClubList | null>(null);
  const alive = useRef(true);
  const reload = useCallback(() => {
    void loadClubs().then((l) => alive.current && setList(l));
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    const timer = setInterval(reload, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [reload]);
  return { list, reload };
}

// ---------- small pieces ----------

/** A few avatars overlapping, round: the members of a club. */
function Stack({ members, size }: { members: Club["members"]; size: number }) {
  return (
    <span className="clb-stack" aria-hidden="true">
      {members.map((m) => (
        <span key={m.id} className="clb-av">
          <Avatar name={m.name} hue={m.hue} size={size} radius={999} picture={m.picture || undefined} />
        </span>
      ))}
    </span>
  );
}

function Pencil() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

/** A switch with its label visible; the whole thing is the button (44 px on a phone). */
function ClubSwitch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="clb-sw" disabled={disabled} onClick={() => onChange(!on)}>
      <span className={`clb-track${on ? " on" : ""}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

// ---------- the group in the contact list ----------

function ClubRow({ c, phone, on, onPick }: { c: Club; phone: boolean; on: boolean; onPick: () => void }) {
  const t = useT();
  const line = clubLine(c, t("shell.me"));
  return (
    <button type="button" className={`crow clb-row${phone ? " p" : ""}${on ? " on" : ""}${c.on ? "" : " is-off"}`} aria-current={on ? "true" : undefined} onClick={onPick}>
      <Stack members={c.members} size={phone ? 28 : 24} />
      <span className="t">
        <span className="n">{c.name}</span>
        <span className="s">{line || t("messenger.clubs.noLines")}</span>
      </span>
      {!c.on && <span className="clb-tag">{t("messenger.clubs.off")}</span>}
    </button>
  );
}

export function ClubsGroup({
  list,
  phone,
  selId,
  people,
  needle,
  onPick,
  onNew,
  onSettings,
}: {
  list: ClubList | null;
  phone: boolean;
  selId: string;
  /** How many characters there are to make a club of. */
  people: number;
  /** The contact search: a club whose name has it stays, the group goes when none does. */
  needle: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  const t = useT();
  const [fold, setFold] = useState<boolean | null>(null);
  if (!list) return null;
  const { clubs, on, max } = list;
  const shown = needle ? clubs.filter((c) => c.name.toLowerCase().includes(needle)) : clubs;
  if (needle && shown.length === 0) return null;
  // off and empty: only the header, so the feature does not push the contacts down for those who never use it; one tap teaches it
  const closed = fold ?? (!on && clubs.length === 0);
  const block = newClubBlock(clubs.length, max, people);
  return (
    <div className="ggroup clubs" role="group" aria-label={t("messenger.clubs.list")}>
      <button type="button" className={`grp${phone ? " p" : ""}`} aria-expanded={!closed} onClick={() => setFold(!closed)}>
        {closed ? "▸" : "▾"} {t("messenger.clubs.title")} ({clubs.length})
        {!on && <span className="clb-tag">{t("messenger.clubs.off")}</span>}
      </button>
      {!closed && (
        <>
          {shown.map((c) => (
            <ClubRow key={c.id} c={c} phone={phone} on={c.id === selId} onPick={() => onPick(c.id)} />
          ))}
          {!on && (
            <div className="clb-note">
              <p>{t("messenger.clubs.globalOff")}</p>
              <button type="button" className="btn" onClick={onSettings}>{t("messenger.clubs.openSettings")}</button>
            </div>
          )}
          {on && clubs.length === 0 && (
            <div className="clb-note">
              <p>{t("messenger.clubs.none")}</p>
            </div>
          )}
          {!needle && (
            <div className="clb-new">
              <button type="button" className="btn clb-newbtn" disabled={block !== ""} onClick={onNew}>
                + {t("messenger.clubs.new")}
              </button>
              {block === "limit" && <span className="k">{t("messenger.clubs.limit")}</span>}
              {block === "few" && <span className="k">{t("messenger.clubs.few")}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- an open club ----------

function ClubHead({ club, phone, busy, onBack, onEdit, onToggle }: { club: Club; phone: boolean; busy: boolean; onBack: () => void; onEdit: () => void; onToggle: (on: boolean) => void }) {
  const t = useT();
  return (
    <div className={phone ? "hd" : "tbar chat-tbar"}>
      {phone && (
        <button type="button" className="ib flat" aria-label={t("messenger.back")} onClick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <Stack members={club.members} size={phone ? 28 : 30} />
      <div className="hcol">
        <span className="hname clb-name">{club.name}</span>
        <span className="hsub clb-sub">{[club.interest, memberNames(club)].filter(Boolean).join(" · ")}</span>
      </div>
      <ClubSwitch on={club.on} label={t("messenger.clubs.active")} disabled={busy} onChange={onToggle} />
      <button type="button" className="ib flat" aria-label={t("messenger.clubs.edit")} title={t("messenger.clubs.edit")} onClick={onEdit}>
        <Pencil />
      </button>
    </div>
  );
}

function ClubLog({ chat, busy, queued, err, globalOn, phone, onSettings }: { chat: ClubChat | null; busy: boolean; queued: boolean; err: string; globalOn: boolean; phone: boolean; onSettings: () => void }) {
  const t = useT();
  const lang = currentLang();
  const ref = useRef<HTMLDivElement>(null);
  const messages = chat?.messages ?? [];
  const n = messages.length;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.club.id, n, busy, queued, err]);
  const now = Date.now();
  const rows: (ClubMessage | { day: string; key: string })[] = [];
  let lastDay = "";
  for (const m of messages) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) {
      rows.push({ day: dayLabel(m.at, now, lang, t), key: `d-${m.at}` });
      lastDay = day;
    }
    rows.push(m);
  }
  const club = chat?.club;
  return (
    <div className={`log${phone ? " p" : ""}`} ref={ref} role="log" aria-label={t("messenger.clubs.chat")}>
      {chat && n === 0 && <div className="sys">{t("messenger.clubs.emptyLog")}</div>}
      {rows.map((r) =>
        "day" in r ? (
          <div key={r.key} className="sys">{r.day}</div>
        ) : (
          <div key={r.id} className={`msg cmsg${r.mine ? " mine" : ""}`}>
            <Avatar name={r.name || t("shell.me")} hue={r.hue} size={32} radius={999} picture={r.picture || undefined} />
            <div className="cbody">
              <div className="who" style={{ color: r.mine ? "var(--acct)" : themColor(r.hue) }}>
                {r.mine ? t("shell.me") : r.name}
                {r.mine && r.as && <span className="time"> · {t("messenger.head.as", { name: r.as })}</span>}
                <span className="time">{clock(r.at)}</span>
              </div>
              <div className="ctext">{r.text}</div>
            </div>
          </div>
        ),
      )}
      {club && !club.on && <div className="note"><span>{t("messenger.clubs.offLine")}</span></div>}
      {chat?.limited && club?.on && globalOn && !busy && (
        <div className="note">
          <span>{t(chat.answersMax === 0 ? "messenger.clubs.limitedZero" : "messenger.clubs.limited")}</span>
          <button type="button" className="link" onClick={onSettings}>{t("messenger.clubs.openSettings")}</button>
        </div>
      )}
      {club && club.on && !globalOn && (
        <div className="note">
          <span>{t("messenger.clubs.globalLine")}</span>
          <button type="button" className="link" onClick={onSettings}>{t("messenger.clubs.openSettings")}</button>
        </div>
      )}
      {(busy || chat?.pending) && !err && <div className="sys">{t("messenger.clubs.writing")}</div>}
      {queued && !busy && !chat?.limited && <div className="note"><span>{t("messenger.clubs.queued")}</span></div>}
      {(err || chat?.failed) && !busy && (
        <div className="note">
          <span>{t("messenger.clubs.failed")}</span>
          {err && <span className="err">{err}</span>}
        </div>
      )}
    </div>
  );
}

/** Hides the phone's top bar and tabs while a club is open (the chat is a full screen, like a contact's). */
function PhoneChrome() {
  useChrome({ bar: false, tabs: false });
  return null;
}

export function ClubView({
  id,
  phone,
  globalOn,
  onBack,
  onEdit,
  onSettings,
  onChanged,
}: {
  id: string;
  phone: boolean;
  globalOn: boolean;
  onBack: () => void;
  onEdit: (club: Club) => void;
  onSettings: () => void;
  /** The list should be asked again (a message was sent, the club was switched). */
  onChanged: () => void;
}) {
  const [chat, setChat] = useState<ClubChat | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [err, setErr] = useState("");
  const [switching, setSwitching] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const c = await loadClubChat(id);
    if (alive.current && c && !inFlight.current) setChat(c);
  }, [id]);

  useEffect(() => {
    alive.current = true;
    setChat(null);
    setDraft("");
    setQueued(false);
    setErr("");
    void load();
    const timer = setInterval(() => void load(), CHAT_POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [id, load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || inFlight.current || !chat) return;
    inFlight.current = true;
    setBusy(true);
    setErr("");
    setQueued(false);
    setDraft("");
    const mine: ClubMessage = { id: `tmp-${Date.now()}`, by: "me", name: "", hue: 210, picture: "", at: Date.now(), text, mine: true };
    setChat((c) => (c ? { ...c, messages: [...c.messages, mine] } : c));
    const r = await sendToClub(id, text);
    inFlight.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (r.chat) setChat(r.chat);
    else if (!PREVIEW) await load();
    setErr(r.error);
    setQueued(r.queued);
    onChanged();
  };

  const toggle = async (on: boolean) => {
    if (!chat) return;
    setSwitching(true);
    setChat({ ...chat, club: { ...chat.club, on } });
    const e = await editClub(id, { on });
    setSwitching(false);
    if (e) setErr(e);
    await load();
    onChanged();
  };

  const club = chat?.club;
  const head = club ? <ClubHead club={club} phone={phone} busy={switching} onBack={onBack} onEdit={() => onEdit(club)} onToggle={(v) => void toggle(v)} /> : <div className={phone ? "hd" : "tbar chat-tbar"} />;
  const body = (
    <>
      {head}
      <ClubLog chat={chat} busy={busy} queued={queued} err={err} globalOn={globalOn} phone={phone} onSettings={onSettings} />
      <Composer c={{ name: club?.name ?? "" }} value={draft} phone={phone} real busy={busy || !chat} onChange={setDraft} onSend={() => void send()} onClear={() => setDraft("")} />
    </>
  );
  return phone ? (
    <div className="pscreen">
      <PhoneChrome />
      {body}
    </div>
  ) : (
    body
  );
}

/** The desktop's right column for an open club. */
export function ClubInfo({ club, statusOf, onEdit }: { club: Club; statusOf: (id: string) => Pickable["status"]; onEdit: () => void }) {
  const t = useT();
  return (
    <aside className="col info clb-info">
      <div className="nm">{club.name}</div>
      <div>
        <div className="k">{t("messenger.clubs.interest")}</div>
        <p>{club.interest || t("messenger.clubs.interestNone")}</p>
      </div>
      <div className="clb-members">
        <div className="k">{t("messenger.clubs.members")}</div>
        <ul>
          {club.members.map((m) => {
            const s = statusOf(m.id);
            return (
              <li key={m.id}>
                <Avatar name={m.name} hue={m.hue} size={28} radius={999} picture={m.picture || undefined} dim={s === "off"} />
                <span className="nm2">{m.name}</span>
                {s && (
                  <span className="clb-st">
                    <Flower status={s} size={16} />
                    {t(STATUS_KEY[s])}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="clb-meta">
        <p>{club.by === "mod" ? t("messenger.clubs.byMod") : t("messenger.clubs.byYou")}</p>
        <p>{t("messenger.clubs.how")}</p>
      </div>
      <button type="button" className="btn wide" onClick={onEdit}>{t("messenger.clubs.edit")}</button>
    </aside>
  );
}

// ---------- the member picker and the dialog ----------

/** Characters to tick, with a search box: 3 or 4. A plain select is a bad picker for this, so there is none. */
export function MemberPicker({ people, value, onChange }: { people: Pickable[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const rows = filterPeople(people, q);
  const st = pickState(value.length);
  const names = value.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
  return (
    <div className="clb-pick">
      <div className="clb-pick-top">
        <b>{t("messenger.clubs.membersLabel")}</b>
        <span className={`clb-count ${st}`} aria-live="polite">{t("messenger.clubs.counter", { n: value.length })}</span>
      </div>
      <input type="search" className="inp" aria-label={t("messenger.clubs.search")} placeholder={t("messenger.clubs.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="clb-pick-list" aria-label={t("messenger.clubs.membersLabel")}>
        {rows.map((p) => {
          const on = value.includes(p.id);
          const locked = !on && value.length >= MAX_MEMBERS;
          return (
            <li key={p.id}>
              <label className={`clb-pick-row${on ? " on" : ""}${locked ? " locked" : ""}`}>
                <input type="checkbox" className="cb" checked={on} disabled={locked} onChange={() => onChange(toggleMember(value, p.id))} />
                <Avatar name={p.name} hue={p.hue} size={28} radius={999} picture={p.picture || undefined} dim={p.status === "off"} />
                <span className="clb-pick-name">{p.name}</span>
                {p.status && <span className="k">{t(STATUS_KEY[p.status])}</span>}
              </label>
            </li>
          );
        })}
        {rows.length === 0 && <li className="k clb-pick-none">{t("messenger.clubs.nohits", { q: q.trim() })}</li>}
      </ul>
      {names && <p className="k">{t("messenger.clubs.picked", { names })}</p>}
      {st === "full" && <p className="k">{t("messenger.clubs.full")}</p>}
    </div>
  );
}

/** "New club" (no `club`) and "Edit club". `onDone` gets the id of the club that was made (new), else "". */
export function ClubDialog({
  club,
  people,
  phone,
  onClose,
  onDone,
}: {
  club?: Club;
  people: Pickable[];
  phone: boolean;
  onClose: () => void;
  onDone: (madeId: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(club?.name ?? "");
  const [interest, setInterest] = useState(club?.interest ?? "");
  const [members, setMembers] = useState<string[]>(club ? club.members.map((m) => m.id) : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);

  const run = async (job: () => Promise<string>, then: () => void) => {
    setBusy(true);
    setError("");
    const e = await job();
    setBusy(false);
    if (e) setError(e);
    else then();
  };
  const make = async () => {
    setBusy(true);
    setError("");
    const r = await createClub({ name: name.trim(), interest: interest.trim(), members }, people);
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone(r.id);
  };
  const save = () => {
    if (!canSave(name, members)) return;
    if (club) void run(() => editClub(club.id, { name: name.trim(), interest: interest.trim(), members }, people), () => onDone(""));
    else void make();
  };
  const remove = () => {
    if (club) void run(() => removeClub(club.id), () => onDone("removed"));
  };
  return (
    <Dialog title={t(club ? "messenger.clubs.dlg.edit" : "messenger.clubs.dlg.new")} width={520} sheet={phone} onClose={onClose}>
      <div className="pf-body clb-dlg">
        <Field label={t("messenger.clubs.name")}>
          {(id) => <input id={id} className="inp" value={name} maxLength={NAME_MAX} placeholder={t("messenger.clubs.namePh")} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t("messenger.clubs.interestLabel")}>
          {(id) => <input id={id} className="inp" value={interest} maxLength={INTEREST_MAX} placeholder={t("messenger.clubs.interestPh")} onChange={(e) => setInterest(e.target.value)} />}
        </Field>
        <MemberPicker people={people} value={members} onChange={setMembers} />
        {error && <div className="k chatter-err" role="alert">{error}</div>}
      </div>
      <div className="pf-foot">
        {club && !asking && <button type="button" className="btn danger" disabled={busy} onClick={() => setAsking(true)}>{t("messenger.clubs.delete")}</button>}
        {club && asking && (
          <span className="clb-ask" role="alertdialog" aria-label={t("messenger.clubs.deleteAsk")}>
            <span>{t("messenger.clubs.deleteAsk")}</span>
            <button type="button" className="btn danger" disabled={busy} onClick={remove}>{t("messenger.clubs.deleteYes")}</button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>{t("messenger.clubs.keep")}</button>
          </span>
        )}
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("messenger.clubs.cancel")}</button>
        <button type="button" className="btn cta" disabled={busy || !canSave(name, members)} onClick={save}>
          {busy ? t(club ? "messenger.clubs.saving" : "messenger.clubs.creating") : t(club ? "messenger.clubs.save" : "messenger.clubs.create")}
        </button>
      </div>
    </Dialog>
  );
}
