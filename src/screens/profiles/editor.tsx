// The profile editor: header, the five tabs, and on the phone a save bar.
// The draft lives in index.tsx (the store), so leaving with unsaved changes can
// be asked for on both layouts. Desktop has no save bar (the board has none);
// its unsaved changes are asked about when leaving the profile.
import { useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { useChrome } from "@/shell/nav";
import { SOURCE_KEY, type MockProfile, type ProfileForm } from "@/mock/profiles";
import { AboutTab } from "./tabs/AboutTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { StatusesTab } from "./tabs/StatusesTab";
import { ForumTab } from "./tabs/ForumTab";
import { HabitsTab } from "./tabs/HabitsTab";
import { LifeTab } from "./tabs/LifeTab";
import { ModelTab } from "./tabs/ModelTab";
import { TAB_IDS, type TabId } from "./tabs/types";
import { ActionMenu, type MenuItem } from "./menu";
import type { FillProps } from "./fill-ui";
import { cardDateLabel } from "./import-api";
import { PictureDialog } from "./picture-dialog";

export interface EditorProps {
  profile: MockProfile;
  /** The draft (or the saved form when nothing is edited). */
  form: ProfileForm;
  dirty: boolean;
  tab: TabId;
  onTab: (tab: TabId) => void;
  phone: boolean;
  onSet: (patch: Partial<ProfileForm>) => void;
  onSave: () => void;
  onDiscard: () => void;
  /** Opens "Оновити з Roleplay: що зміниться". */
  onRefresh: () => void;
  /** Phone: back to the list (index asks first when there are unsaved changes). */
  onBack?: () => void;
  /** "Fill empty": the run's state and actions; the layout comes from `phone`. */
  fill: Omit<FillProps, "layout">;
  /** Opens the delete question. Not given in preview, so the menu has no delete item there. */
  onDelete?: () => void;
}

const TAB_LABEL: Record<TabId, { desk: string; phone: string }> = {
  about: { desk: "profiles.tab.about", phone: "profiles.tab.about" },
  voice: { desk: "profiles.tab.voice", phone: "profiles.tab.voiceShort" },
  statuses: { desk: "profiles.tab.statuses", phone: "profiles.tab.statusesShort" },
  forum: { desk: "profiles.tab.forum", phone: "profiles.tab.forum" },
  habits: { desk: "profiles.tab.habits", phone: "profiles.tab.habits" },
  life: { desk: "profiles.tab.life", phone: "profiles.tab.life" },
  model: { desk: "profiles.tab.model", phone: "profiles.tab.model" },
};

/** The editable part of a profile (everything except identity and source). */
export function formOf(p: MockProfile): ProfileForm {
  return {
    nick: p.nick,
    about: p.about,
    interests: p.interests,
    tags: p.tags,
    habits: p.habits,
    habitsAuto: p.habitsAuto,
    life: p.life,
    model: p.model,
    knows: p.knows,
    stickerPacks: p.stickerPacks,
    imageModel: p.imageModel,
    picture: p.picture,
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

export function ProfileEditor({ profile, form, dirty, tab, onTab, phone, onSet, onSave, onDiscard, onRefresh, onBack, fill, onDelete }: EditorProps) {
  const t = useT();
  const [picOpen, setPicOpen] = useState(() => PREVIEW && new URLSearchParams(location.search).get("dialog") === "picture");
  const roleplay = profile.source === "roleplay";
  const sourceLabel = t(SOURCE_KEY[profile.source]);
  const subtitle = roleplay
    ? phone
      ? t("profiles.editor.subtitleShort", { source: sourceLabel, date: cardDateLabel(profile.cardDate, currentLang()) })
      : t("profiles.editor.subtitleCard", { card: profile.card ?? "", date: cardDateLabel(profile.cardDate, currentLang()) })
    : t("profiles.editor.subtitleOwn");

  const fillProps: FillProps = { ...fill, layout: phone ? "phone" : "desk" };
  const props = { form, set: onSet, name: profile.name, hue: profile.hue, source: profile.source, onRefresh, fill: fillProps, profileId: profile.id };
  // The "⋯" menu: Fill empty (opens About first) and, for Roleplay profiles, the update.
  const menu: MenuItem[] = [
    {
      key: "fill",
      label: t("profiles.fill.button"),
      disabled: fill.empty === 0 || fill.phase === "busy",
      onSelect: () => {
        onTab("about");
        fill.onStart();
      },
    },
    { key: "picture", label: t("profiles.picture.menu"), onSelect: () => setPicOpen(true) },
    ...(roleplay ? [{ key: "refresh", label: t("profiles.editor.refresh"), onSelect: onRefresh }] : []),
    ...(onDelete ? [{ key: "delete", label: t("profiles.menu.delete"), onSelect: onDelete }] : []),
  ];
  const body =
    tab === "about" ? <AboutTab {...props} />
    : tab === "voice" ? <VoiceTab {...props} />
    : tab === "statuses" ? <StatusesTab {...props} />
    : tab === "forum" ? <ForumTab {...props} />
    : tab === "life" ? <LifeTab {...props} />
    : tab === "model" ? <ModelTab {...props} />
    : <HabitsTab {...props} />;

  const picDialog = picOpen && (
    <PictureDialog
      name={profile.name}
      hue={profile.hue}
      about={form.about}
      interests={form.interests}
      current={form.picture}
      phone={phone}
      onUse={(picture) => onSet({ picture })}
      onRemove={() => onSet({ picture: "" })}
      onClose={() => setPicOpen(false)}
    />
  );
  const picLabel = t("profiles.picture.open", { name: profile.name });

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
          <button type="button" className="pic-btn" aria-label={picLabel} onClick={() => setPicOpen(true)}>
            <Avatar name={profile.name} hue={profile.hue} size={36} picture={form.picture || undefined} />
          </button>
          <div className="hd-title">
            <span className="hd-name">{profile.name}</span>
            <span className="k">{subtitle}</span>
          </div>
          <ActionMenu className="hbtn" label={t("profiles.editor.more")} items={menu} trigger={<DotsIcon />} />
        </header>
        {tabs}
        <div className="pg">{body}</div>
        <div className="sv">
          <span className="warn">{dirty ? t("profiles.save.unsaved") : ""}</span>
          <button type="button" className="btn" disabled={!dirty} onClick={onDiscard}>{t("profiles.save.cancel")}</button>
          <button type="button" className="btn cta" disabled={!dirty} onClick={onSave}>{t("profiles.save.save")}</button>
        </div>
        {picDialog}
      </div>
    );
  }

  return (
    <section className="ed" aria-label={profile.name}>
      <div className="ed-head">
        <button type="button" className="pic-btn pic-btn-big" aria-label={picLabel} title={t("profiles.picture.menu")} onClick={() => setPicOpen(true)}>
          <Avatar name={profile.name} hue={profile.hue} size={64} radius={8} picture={form.picture || undefined} />
          <span className="pic-badge" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </span>
        </button>
        <div className="ed-title">
          <div className="ed-name">
            <span className="ed-h">{profile.name}</span>
            <span className="chip">{sourceLabel}</span>
          </div>
          <div className="k">{subtitle}</div>
        </div>
        {roleplay && <button type="button" className="btn" onClick={onRefresh}>{t("profiles.editor.refresh")}</button>}
        <ActionMenu className="btn btn-icon" label={t("profiles.editor.more")} items={menu} trigger="⋯" />
      </div>
      {tabs}
      <div className="ed-body">{body}</div>
      {dirty && (
        <div className="sv sv-desk" role="region" aria-label={t("profiles.save.unsaved")}>
          <span className="warn">{t("profiles.save.unsaved")}</span>
          <button type="button" className="btn" onClick={onDiscard}>{t("profiles.save.cancel")}</button>
          <button type="button" className="btn cta" onClick={onSave}>{t("profiles.save.save")}</button>
        </div>
      )}
      {picDialog}
    </section>
  );
}

/** Phone editor: hides the shell's top bar and bottom tabs while it is open. */
export function PhoneEditor(props: EditorProps) {
  useChrome({ bar: false, tabs: false });
  return <ProfileEditor {...props} phone />;
}
