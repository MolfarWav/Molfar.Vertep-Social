// Pieces shared by the desktop and the phone layouts: contact rows and groups,
// the chat log, the composer and the status words.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Avatar, themColor } from "@/components/Avatar";
import { Envelope, Flower } from "@/components/Flower";
import { useEmoji } from "@/emoji/use-emoji";
import { MsgPicture } from "@/pictures/MsgPicture";
import { RichText } from "@/stickers/Render";
import type { Attached, usePicture } from "@/pictures/use-picture";
import { currentLang, useT } from "@/i18n/index";
import { CONTACTS, type Contact, type LogItem } from "@/mock/messenger";
import { STATUS_ORDER, type Status } from "@/mock/status";
import { breakLabel } from "./real";

export const STATUS_KEY: Record<Status, string> = {
  online: "messenger.status.online",
  away: "messenger.status.away",
  dnd: "messenger.status.dnd",
  na: "messenger.status.na",
  off: "messenger.status.off",
};

/** One contact in the list. The whole row is a button: a tap on phone opens the chat. */
export function ContactRow({ c, phone, on, onPick }: { c: Contact; phone: boolean; on: boolean; onPick: () => void }) {
  const t = useT();
  const cls = ["crow", phone && "p", on && "on", c.unread && "unread"].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} aria-current={on ? "true" : undefined} onClick={onPick}>
      <Avatar name={c.name} hue={c.hue} size={phone ? 40 : 32} dim={c.status === "off"} picture={c.picture} />
      <span className="t">
        <span className="n">{c.name}</span>
        <span className="s"><RichText text={c.line} /></span>
      </span>
      {c.unread ? <Envelope size={phone ? 22 : 20} label={t("messenger.newMessage")} /> : <Flower status={c.status} size={phone ? 22 : 20} />}
    </button>
  );
}

/** Status groups in board order; a group with no contacts is left out. A folded group keeps its header. */
export function ContactGroups({
  list,
  phone,
  sel,
  folded,
  onToggle,
  onPick,
}: {
  list: Contact[];
  phone: boolean;
  sel: string;
  folded: Record<string, boolean>;
  onToggle: (s: Status) => void;
  onPick: (id: string) => void;
}) {
  const t = useT();
  const groups = STATUS_ORDER.map((s) => ({ s, rows: list.filter((c) => c.status === s) })).filter((g) => g.rows.length > 0);
  return (
    <>
      {groups.map(({ s, rows }) => {
        const open = !folded[s];
        return (
          <div key={s} className="ggroup">
            <button type="button" className={`grp${phone ? " p" : ""}`} aria-expanded={open} onClick={() => onToggle(s)}>
              {open ? "▾" : "▸"} {t(`messenger.group.${s}`)} ({rows.length})
            </button>
            {open &&
              rows.map((c) => <ContactRow key={c.id} c={c} phone={phone} on={!phone && c.id === sel} onPick={() => onPick(c.id)} />)}
          </div>
        );
      })}
    </>
  );
}

/** A centred block for the list: no profiles yet, or a search with no hits. */
export function EmptyBlock({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="etitle">{title}</div>
      {text && <p className="etext">{text}</p>}
      {children}
    </div>
  );
}

/**
 * The chat log: day line, messages, then the system lines (failure, no model, typing, queued or offline).
 * `real` is the engine's chat: `contacts` are the real contacts, `queued` shows the neutral line for a reply
 * that waits, and the gendered offline line is not used.
 */
export function ChatLog({
  c,
  contacts,
  items,
  dayLine,
  typing,
  failed,
  failError,
  noModel,
  queued,
  real,
  phone,
  onRetry,
  onSettings,
}: {
  c: Contact;
  contacts: Contact[];
  items: LogItem[];
  dayLine: string;
  typing: boolean;
  failed: boolean;
  failError?: string;
  noModel: boolean;
  queued: boolean;
  real: boolean;
  phone: boolean;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const n = items.length;
  // Keep the newest line in view when a message is sent or the chat changes.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [c.id, n, failed, noModel, typing, queued]);

  const name = c.name;
  return (
    <div className={`log${phone ? " p" : ""}`} ref={ref} role="log">
      {n > 0 ? <div className="sys">{dayLine}</div> : <div className="sys">{t("messenger.emptyLog")}</div>}
      {items.map((m, i) => {
        if (m.kind === "sys") return <div key={i} className="sys">{t(m.key, { name })}</div>;
        if (m.kind === "break") return <div key={i} className="sys brk">{t("messenger.break", { date: breakLabel(m.at, currentLang()) })}</div>;
        const mine = m.who === "me";
        const from = contacts.find((x) => x.id === m.who);
        const who = mine ? t("shell.me") : from?.name ?? m.who;
        const color = mine ? "var(--acct)" : themColor(from?.hue ?? 0);
        return (
          <div key={i} className="msg">
            <div className="who" style={{ color }}>
              {who}
              <span className="time">{m.time}</span>
            </div>
            {m.text && <div><RichText text={m.text} /></div>}
            {m.image && <MsgPicture image={m.image} />}
          </div>
        );
      })}
      {failed && (
        <div className="note">
          <span>{t("messenger.failed")}</span>
          {failError && <span className="err">{failError}</span>}
          <button type="button" className="btn" onClick={onRetry}>{t("messenger.retry")}</button>
        </div>
      )}
      {noModel && (
        <div className="note">
          <span>{t("messenger.nomodel")}</span>
          <button type="button" className="link" onClick={onSettings}>{t("messenger.nomodel.link")}</button>
        </div>
      )}
      {typing && !failed && !noModel && <div className="sys">{t("messenger.typing", { name })}</div>}
      {real ? queued && <div className="sys">{t("messenger.queued", { name })}</div> : c.status === "off" && <div className="sys">{t("messenger.offline", { name })}</div>}
    </div>
  );
}

/**
 * The message box. Enter sends, Shift+Enter adds a line; the send button does nothing on an empty draft.
 * `busy`: a send is in flight, so the button is off (Enter is ignored by the screen).
 */
export function Composer({
  c,
  value,
  phone,
  real,
  busy,
  onChange,
  onSend,
  onClear,
  pic,
  onSticker,
}: {
  /** Who is written to: only the name is used in real mode (a club passes its own name). */
  c: { name: string; of?: string; to?: string };
  value: string;
  phone: boolean;
  real: boolean;
  busy: boolean;
  /** The attach control (button, chip, dialog) of this text box; a club has none (no pictures in clubs). */
  pic?: ReturnType<typeof usePicture>;
  onChange: (v: string) => void;
  onSend: () => void;
  onClear: () => void;
  /** A sticker was tapped in the picker (real mode only): it is sent at once. */
  onSticker?: (sticker: Attached) => void;
}) {
  const t = useT();
  const box = useRef<HTMLTextAreaElement>(null);
  const emoji = useEmoji({ target: box, value, onChange, phone, onSticker });
  // The real-mode strings use the plain name: the Ukrainian ones of the preview decline it.
  const label = real ? t("messenger.composer.labelPlain", { name: c.name }) : t("messenger.composer.label", { of: c.of ?? c.name, name: c.name });
  const placeholder = real ? t("messenger.composer.placeholderPlain", { name: c.name }) : t("messenger.composer.placeholder", { to: c.to ?? c.name, name: c.name });
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };
  if (phone) {
    return (
      <>
        {pic?.chip && <div className="comp-chip">{pic.chip}</div>}
        <div className="comp p">
          {pic?.button}
          {emoji.button}
          <textarea ref={box} className="inp p" rows={1} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
          <button type="button" className="btn cta" disabled={busy} onClick={onSend}>{t("messenger.composer.send")}</button>
        </div>
        {emoji.tray}
        {pic?.dialog}
      </>
    );
  }
  return (
    <div className="comp">
      {pic?.chip}
      <textarea ref={box} className="inp" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
      <div className="comp-row">
        {pic?.button}
        {emoji.button}
        <span className="hint">{t("messenger.composer.hint")}</span>
        <button type="button" className="btn" onClick={onClear}>{t("messenger.composer.clear")}</button>
        <button type="button" className="btn cta" disabled={busy} onClick={onSend}>{t("messenger.composer.send")}</button>
      </div>
      {pic?.dialog}
    </div>
  );
}
