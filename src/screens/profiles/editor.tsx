// The profile editor: header, the five tabs, and on the phone a save bar.
// Desktop edits apply straight to the draft (the board has no save bar); the
// phone keeps a saved copy so Cancel and Save mean something.
import { useState } from "react";
import { useT } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { useChrome } from "@/shell/nav";
import { SOURCE_KEY, type MockProfile, type ProfileForm } from "@/mock/profiles";
import { AboutTab } from "./tabs/AboutTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { StatusesTab } from "./tabs/StatusesTab";
import { ForumTab } from "./tabs/ForumTab";
import { HabitsTab } from "./tabs/HabitsTab";
import { TAB_IDS, type TabId } from "./tabs/types";

export interface EditorProps {
  profile: MockProfile;
  tab: TabId;
  onTab: (tab: TabId) => void;
  phone: boolean;
  /** Phone: back to the list. */
  onBack?: () => void;
  /** Preview only (`dirty=1`): start with unsaved changes so the save bar shows. */
  initialDirty?: boolean;
}

const TAB_LABEL: Record<TabId, { desk: string; phone: string }> = {
  about: { desk: "profiles.tab.about", phone: "profiles.tab.about" },
  voice: { desk: "profiles.tab.voice", phone: "profiles.tab.voiceShort" },
  statuses: { desk: "profiles.tab.statuses", phone: "profiles.tab.statusesShort" },
  forum: { desk: "profiles.tab.forum", phone: "profiles.tab.forum" },
  habits: { desk: "profiles.tab.habits", phone: "profiles.tab.habits" },
};

/** The editable part of a profile (everything except identity and source). */
export function formOf(p: MockProfile): ProfileForm {
  return {
    nick: p.nick,
    about: p.about,
    interests: p.interests,
    habits: p.habits,
    habitsAuto: p.habitsAuto,
    voice: p.voice,
    forum: p.forum,
    schedule: p.schedule,
  };
}

const BackIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DotsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 6h.01M12 12h.01M12 18h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function ProfileEditor({ profile, tab, onTab, phone, onBack, initialDirty }: EditorProps) {
  const t = useT();
  const [saved, setSaved] = useState<ProfileForm>(() => formOf(profile));
  const [form, setForm] = useState<ProfileForm>(saved);
  const [dirty, setDirty] = useState(!!initialDirty);

  const set = (patch: Partial<ProfileForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const cancel = () => {
    setForm(saved);
    setDirty(false);
  };
  const save = () => {
    setSaved(form);
    setDirty(false);
  };

  const roleplay = profile.source === "roleplay";
  const sourceLabel = t(SOURCE_KEY[profile.source]);
  const subtitle = roleplay
    ? phone
      ? t("profiles.editor.subtitleShort", { source: sourceLabel, date: profile.cardDate ?? "" })
      : t("profiles.editor.subtitleCard", { card: profile.card ?? "", date: profile.cardDate ?? "" })
    : t(profile.source === "own" ? "profiles.editor.subtitleOwn" : "profiles.editor.subtitlePersona");

  const props = { form, set, name: profile.name, hue: profile.hue };
  const body =
    tab === "about" ? <AboutTab {...props} />
    : tab === "voice" ? <VoiceTab {...props} />
    : tab === "statuses" ? <StatusesTab {...props} />
    : tab === "forum" ? <ForumTab {...props} />
    : <HabitsTab {...props} />;

  const tabs = (
    <div className={phone ? "pills" : "etabs"} role="tablist" aria-label={t("profiles.editor.sections")}>
      {TAB_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={`${phone ? "pill" : "et"}${tab === id ? " on" : ""}`}
          onClick={() => onTab(id)}
        >
          {t(TAB_LABEL[id][phone ? "phone" : "desk"])}
        </button>
      ))}
    </div>
  );

  if (phone) {
    return (
      <div className="pe-phone">
        <header className="hd">
          <button type="button" className="hbtn" aria-label={t("profiles.editor.back")} onClick={onBack}>
            <BackIcon />
          </button>
          <Avatar name={profile.name} hue={profile.hue} size={36} />
          <div className="hd-title">
            <span className="hd-name">{profile.name}</span>
            <span className="k">{subtitle}</span>
          </div>
          <button type="button" className="hbtn" aria-label={t("profiles.editor.more")}>
            <DotsIcon />
          </button>
        </header>
        {tabs}
        <div className="pg">{body}</div>
        <div className="sv">
          <span className="warn">{dirty ? t("profiles.save.unsaved") : ""}</span>
          <button type="button" className="btn" disabled={!dirty} onClick={cancel}>{t("profiles.save.cancel")}</button>
          <button type="button" className="btn cta" disabled={!dirty} onClick={save}>{t("profiles.save.save")}</button>
        </div>
      </div>
    );
  }

  return (
    <section className="ed" aria-label={profile.name}>
      <div className="ed-head">
        <Avatar name={profile.name} hue={profile.hue} size={64} radius={8} />
        <div className="ed-title">
          <div className="ed-name">
            <span className="ed-h">{profile.name}</span>
            <span className="chip">{sourceLabel}</span>
          </div>
          <div className="k">{subtitle}</div>
        </div>
        {roleplay && <button type="button" className="btn">{t("profiles.editor.refresh")}</button>}
        <button type="button" className="btn btn-icon" aria-label={t("profiles.editor.more")}>⋯</button>
      </div>
      {tabs}
      <div className="ed-body">{body}</div>
    </section>
  );
}

/** Phone editor: hides the shell's top bar and bottom tabs while it is open. */
export function PhoneEditor(props: EditorProps) {
  useChrome({ bar: false, tabs: false });
  return <ProfileEditor {...props} phone />;
}
