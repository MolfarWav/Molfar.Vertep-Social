// Pieces shared by the desktop and the phone layouts: contact rows and groups,
// the chat log, the composer and the status words.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Avatar, themColor } from "@/components/Avatar";
import { Envelope, Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { CONTACTS, type Contact, type LogItem } from "@/mock/messenger";
import { STATUS_ORDER, type Status } from "@/mock/status";

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
      <Avatar name={c.name} hue={c.hue} size={phone ? 40 : 32} dim={c.status === "off"} />
      <span className="t">
        <span className="n">{c.name}</span>
        <span className="s">{c.line}</span>
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

/** The chat log: day line, messages, then the system lines (failure, no model, typing, offline). */
export function ChatLog({
  c,
  items,
  typing,
  failed,
  noModel,
  phone,
  onRetry,
  onSettings,
}: {
  c: Contact;
  items: LogItem[];
  typing: boolean;
  failed: boolean;
  noModel: boolean;
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
  }, [c.id, n, failed, noModel, typing]);

  const name = c.name;
  return (
    <div className={`log${phone ? " p" : ""}`} ref={ref} role="log">
      {n > 0 ? <div className="sys">{t("messenger.today")}</div> : <div className="sys">{t("messenger.emptyLog")}</div>}
      {items.map((m, i) => {
        if (m.kind === "sys") return <div key={i} className="sys">{t(m.key, { name })}</div>;
        const mine = m.who === "me";
        const from = CONTACTS.find((x) => x.id === m.who);
        const who = mine ? t("shell.me") : from?.name ?? m.who;
        const color = mine ? "var(--acct)" : themColor(from?.hue ?? 0);
        return (
          <div key={i} className="msg">
            <div className="who" style={{ color }}>
              {who}
              <span className="time">{m.time}</span>
            </div>
            <div>{m.text}</div>
          </div>
        );
      })}
      {failed && (
        <div className="note">
          <span>{t("messenger.failed")}</span>
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
      {c.status === "off" && <div className="sys">{t("messenger.offline", { name })}</div>}
    </div>
  );
}

/** The message box. Enter sends, Shift+Enter adds a line; the send button does nothing on an empty draft. */
export function Composer({
  c,
  value,
  phone,
  onChange,
  onSend,
  onClear,
}: {
  c: Contact;
  value: string;
  phone: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
  onClear: () => void;
}) {
  const t = useT();
  const label = t("messenger.composer.label", { of: c.of, name: c.name });
  const placeholder = t("messenger.composer.placeholder", { to: c.to, name: c.name });
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };
  if (phone) {
    return (
      <div className="comp p">
        <textarea className="inp p" rows={1} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
        <button type="button" className="btn cta" onClick={onSend}>{t("messenger.composer.send")}</button>
      </div>
    );
  }
  return (
    <div className="comp">
      <textarea className="inp" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
      <div className="comp-row">
        <span className="hint">{t("messenger.composer.hint")}</span>
        <button type="button" className="btn" onClick={onClear}>{t("messenger.composer.clear")}</button>
        <button type="button" className="btn cta" onClick={onSend}>{t("messenger.composer.send")}</button>
      </div>
    </div>
  );
}
