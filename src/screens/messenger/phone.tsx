// Phone layouts (below 768 px): the contact list under the shell's top bar and
// tabs, and the full-screen chat that hides both and has a back button.
import type { ChangeEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { BarActions, useChrome } from "@/shell/nav";
import { useT } from "@/i18n/index";
import type { Contact, LogItem } from "@/mock/messenger";
import type { Status } from "@/mock/status";
import { ChatLog, Composer, ContactGroups, EmptyBlock, STATUS_KEY } from "./parts";

export interface PhoneListProps {
  empty: boolean;
  /** Real mode: the empty block says "No profiles yet". */
  real: boolean;
  /** Real mode, before the contact list has answered: no empty block and no hits. */
  loading: boolean;
  list: Contact[];
  query: string;
  searchOpen: boolean;
  folded: Record<string, boolean>;
  onQuery: (q: string) => void;
  onToggleSearch: () => void;
  onClearSearch: () => void;
  onToggleGroup: (s: Status) => void;
  onPick: (id: string) => void;
  onProfiles: () => void;
}

export function PhoneList(p: PhoneListProps) {
  const t = useT();
  return (
    <div className="pscreen">
      {!p.empty && (
        <BarActions>
          <button
            type="button"
            className="ib big"
            aria-label={t("shell.search")}
            aria-expanded={p.searchOpen}
            aria-controls="messenger-search"
            onClick={p.onToggleSearch}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </BarActions>
      )}
      {!p.empty && (
        <div className="mine p">
          <Flower status="online" size={22} />
          <span className="mystat">{t("messenger.myStatus", { status: t(STATUS_KEY.online) })} ▾</span>
        </div>
      )}
      {!p.empty && p.searchOpen && (
        <div className="sbar">
          <input
            id="messenger-search"
            className="search"
            type="text"
            aria-label={t("messenger.search.label")}
            placeholder={t("messenger.search.placeholder")}
            value={p.query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => p.onQuery(e.target.value)}
          />
        </div>
      )}
      <div className="plist">
        {p.empty ? (
          <EmptyBlock
            title={t(p.real ? "messenger.empty.noProfiles" : "messenger.empty.title")}
            text={t(p.real ? "messenger.empty.noProfilesText" : "messenger.empty.text")}
          >
            <button type="button" className="btn cta" onClick={p.onProfiles}>{t("messenger.empty.cta")}</button>
          </EmptyBlock>
        ) : p.loading ? null : p.list.length === 0 ? (
          <EmptyBlock title={t("messenger.nohits", { q: p.query.trim() })}>
            <button type="button" className="btn" onClick={p.onClearSearch}>{t("messenger.nohits.clear")}</button>
          </EmptyBlock>
        ) : (
          <ContactGroups list={p.list} phone sel="" folded={p.folded} onToggle={p.onToggleGroup} onPick={p.onPick} />
        )}
      </div>
    </div>
  );
}

export interface PhoneChatProps {
  c: Contact;
  contacts: Contact[];
  items: LogItem[];
  dayLine: string;
  draft: string;
  failed: boolean;
  failError?: string;
  noModel: boolean;
  queued: boolean;
  real: boolean;
  busy: boolean;
  onDraft: (v: string) => void;
  onSend: () => void;
  onClear: () => void;
  onBack: () => void;
  onRetry: () => void;
  onSettings: () => void;
  /** Real mode: the profile button goes to Profiles. */
  onProfile?: () => void;
}

/** The chat on phone. Mounting it hides the top bar and the tabs; unmounting (back) shows them again. */
export function PhoneChat(p: PhoneChatProps) {
  useChrome({ bar: false, tabs: false });
  const t = useT();
  const c = p.c;
  const statusWord = t(STATUS_KEY[c.status]);
  return (
    <div className="pscreen">
      <div className="hd">
        <button type="button" className="ib flat" aria-label={t("messenger.back")} onClick={p.onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <Avatar name={c.name} hue={c.hue} size={36} dim={c.status === "off"} picture={c.picture} />
        <div className="hcol">
          <span className="hname">{c.name}</span>
          <span className="hsub">
            <Flower status={c.status} size={14} />
            {statusWord}
            {c.note && <> · {c.note}</>}
          </span>
        </div>
        <button
          type="button"
          className="ib flat"
          aria-label={p.real ? t("messenger.profile.labelPlain", { name: c.name }) : t("messenger.profile.label", { of: c.of, name: c.name })}
          onClick={p.onProfile}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 11v6M12 7.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <ChatLog
        c={c}
        contacts={p.contacts}
        items={p.items}
        dayLine={p.dayLine}
        typing={c.typing || p.busy}
        failed={p.failed}
        failError={p.failError}
        noModel={p.noModel}
        queued={p.queued}
        real={p.real}
        phone
        onRetry={p.onRetry}
        onSettings={p.onSettings}
      />
      <Composer c={c} value={p.draft} phone real={p.real} busy={p.busy} onChange={p.onDraft} onSend={p.onSend} onClear={p.onClear} />
    </div>
  );
}
