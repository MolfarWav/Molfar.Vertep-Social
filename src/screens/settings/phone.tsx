import { useState, type ReactNode } from "react";
import { useNav } from "@/shell/nav";
import { useT, useLangPref } from "@/i18n/index";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import { PREVIEW, type ModelChoice } from "@/lib/api";
import { Row, Segmented, Stepper, Switch, TimeRange, type Opt } from "./controls";
import { CommunityRows, MembersRows } from "./community";
import { LifeMain, LifeWorld } from "./life";
import { PicturesRows } from "./pictures";
import { ResetRows } from "./reset";
import { AccessControl, GroupFold, LanguageRows, languageHint, ModelRows, Notice, NotifyRows, Patch, Summary } from "./parts";
import { foldSummary, type FoldGroup } from "./fold-summary";
import type { SettingsError } from "./state";

type Open = "quiet" | "life" | "models" | "notify" | "access" | "language" | "reset" | null;

/** A row that opens a section underneath it. Only one is open at a time. */
function Disclosure({ id, open, onToggle, title, hint, children }: { id: Exclude<Open, null>; open: Open; onToggle: (id: Open) => void; title: string; hint: string; children: ReactNode }) {
  const on = open === id;
  return (
    <>
      <button type="button" className="ln row" aria-expanded={on} aria-controls={on ? `settings-${id}` : undefined} onClick={() => onToggle(on ? null : id)}>
        <span className="t">
          <b>{title}</b>
          <span className="k">{hint}</span>
        </span>
        <span className={`go${on ? " on" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>
      {on && (
        <div className="sub" id={`settings-${id}`}>
          {children}
        </div>
      )}
    </>
  );
}

/** Phone layout: one scrolling page with its own header and seven groups that open and close. The shell's bottom tabs
 *  stay (tab "More", which also opens Your profile, the Journal and the City). */
export function PhoneSettings({ s, set, choices, error }: { s: SettingsMock; set: Patch; choices: ModelChoice[]; error: SettingsError | null }) {
  const t = useT();
  const { go } = useNav();
  const { pref, lang } = useLangPref();
  const [open, setOpen] = useState<Open>(null);
  const toggle = (id: Open) => setOpen(id);
  const sum = (g: FoldGroup) => foldSummary(t as never, s, g);

  const activity: Opt<SettingsMock["activity"]>[] = [
    { value: "quiet", label: t("settings.activity.quiet") },
    { value: "moderate", label: t("settings.activity.moderate") },
    { value: "lively", label: t("settings.activity.lively") },
    { value: "chaotic", label: t("settings.activity.chaotic.short") },
  ];
  const knows: Opt<SettingsMock["messengerKnows"]>[] = [
    { value: "knows", label: t("settings.messenger.knows.knows") },
    { value: "name", label: t("settings.messenger.knows.name") },
    { value: "stranger", label: t("settings.messenger.knows.stranger") },
  ];
  const quietRange = t("settings.quiet.range", { from: s.quietFrom, to: s.quietTo });

  return (
    <div className="s-settings is-phone">
      <header className="hd">
        <button type="button" className="hd-back" aria-label={t("settings.back")} onClick={() => go("more")}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="hd-title">{t("settings.title")}</h1>
      </header>

      <div className="pg">
        <Notice error={error} />
        <GroupFold id="forum" title={t("settings.group.forum")} glyph="forum" summary={sum("forum")}>
          <Row title={t("settings.autonomous.phone")}>
            {(id) => <Switch labelledBy={id} checked={s.autonomous} onChange={(v) => set({ autonomous: v })} />}
          </Row>
          <div className="ln col">
            <b id="settings-p-activity">{t("settings.activity")}</b>
            <Segmented labelledBy="settings-p-activity" options={activity} value={s.activity} onChange={(v) => set({ activity: v })} />
          </div>
          <Row title={t("settings.posts.total.phone")} hint={t("settings.posts.total.phone.hint")}>
            {() => (
              <Stepper name={t("settings.posts.total.phone")} value={s.postsPerDay} min={LIMITS.postsPerDay.min} max={LIMITS.postsPerDay.max} onChange={(v) => set({ postsPerDay: v })} />
            )}
          </Row>
          <Row title={t("settings.posts.author.phone")} hint={t("settings.posts.author.phone.hint")}>
            {() => (
              <Stepper name={t("settings.posts.author.phone")} value={s.postsPerAuthor} min={LIMITS.postsPerAuthor.min} max={LIMITS.postsPerAuthor.max} onChange={(v) => set({ postsPerAuthor: v })} />
            )}
          </Row>
          <Disclosure id="quiet" open={open} onToggle={toggle} title={t("settings.quiet")} hint={quietRange}>
            <TimeRange from={s.quietFrom} to={s.quietTo} onFrom={(v) => set({ quietFrom: v })} onTo={(v) => set({ quietTo: v })} />
          </Disclosure>
          <Summary s={s} phone />
        </GroupFold>

        <GroupFold id="messenger" title={t("settings.group.messenger")} glyph="messenger" summary={sum("messenger")}>
          <Row title={t("settings.messenger.first.phone")}>
            {(id) => <Switch labelledBy={id} checked={s.messengerFirst} onChange={(v) => set({ messengerFirst: v })} />}
          </Row>
          <Row title={t("settings.messenger.limit")}>
            {() => (
              <Stepper name={t("settings.messenger.limit")} value={s.messengerPerDay} min={LIMITS.messengerPerDay.min} max={LIMITS.messengerPerDay.max} onChange={(v) => set({ messengerPerDay: v })} />
            )}
          </Row>
          <Row title={t("settings.messenger.context")} hint={t("settings.messenger.context.phone.hint")}>
            {() => (
              <Stepper name={t("settings.messenger.context")} step={4} value={s.messengerContext} min={LIMITS.messengerContext.min} max={LIMITS.messengerContext.max} onChange={(v) => set({ messengerContext: v })} />
            )}
          </Row>
          <Row title={t("settings.messenger.summary")} hint={t("settings.messenger.summary.phone.hint")}>
            {(id) => <Switch labelledBy={id} checked={s.messengerSummary} onChange={(v) => set({ messengerSummary: v })} />}
          </Row>
          <Row title={t("settings.messenger.recall")} hint={t("settings.messenger.recall.phone.hint")}>
            {(id) => <Switch labelledBy={id} checked={s.messengerRecall} onChange={(v) => set({ messengerRecall: v })} />}
          </Row>
          <Row title={t("settings.messenger.place")} hint={t("settings.messenger.place.phone.hint")}>
            {(id) => <Switch labelledBy={id} checked={s.messengerPlace} onChange={(v) => set({ messengerPlace: v })} />}
          </Row>
          <Row title={t("settings.messenger.share")} hint={t("settings.messenger.share.phone.hint")}>
            {(id) => <Switch labelledBy={id} checked={s.factsShare} onChange={(v) => set({ factsShare: v })} />}
          </Row>
          <Row className="stack" title={t("settings.messenger.knows")} hint={t("settings.messenger.knows.phone.hint")}>
            {(id) => <Segmented labelledBy={id} options={knows} value={s.messengerKnows} onChange={(v) => set({ messengerKnows: v })} />}
          </Row>
        </GroupFold>

        <GroupFold id="life" title={t("settings.group.life")} glyph="life" summary={sum("life")}>
          <LifeMain s={s} set={set} phone />
          <Disclosure id="life" open={open} onToggle={toggle} title={t("settings.life.world.phone")} hint={t("settings.life.world.phone.hint")}>
            <LifeWorld s={s} set={set} />
          </Disclosure>
        </GroupFold>

        <GroupFold id="community" title={t("settings.group.community")} glyph="community" summary={sum("community")}>
          <CommunityRows s={s} set={set} phone />
        </GroupFold>

        <GroupFold id="members" title={t("settings.group.members")} glyph="members" summary={sum("members")}>
          <MembersRows s={s} set={set} phone />
        </GroupFold>

        <GroupFold id="pictures" title={t("settings.group.pictures")} glyph="pictures" summary={sum("pictures")}>
          <PicturesRows s={s} set={set} phone />
        </GroupFold>

        <GroupFold id="other" title={t("settings.group.other")} glyph="other">
          <Disclosure id="language" open={open} onToggle={toggle} title={t("settings.section.language")} hint={languageHint(t, pref, lang)}>
            <LanguageRows />
          </Disclosure>
          <Disclosure id="models" open={open} onToggle={toggle} title={t("settings.section.models")} hint={t("settings.models.phone.hint")}>
            <ModelRows s={s} set={set} choices={choices} />
          </Disclosure>
          <Disclosure id="notify" open={open} onToggle={toggle} title={t("settings.section.notify")} hint={t("settings.notify.phone.hint")}>
            <NotifyRows s={s} set={set} />
          </Disclosure>
          <Disclosure
            id="access"
            open={open}
            onToggle={toggle}
            title={t("settings.section.access")}
            hint={t(PREVIEW && s.roleplayAccess ? "settings.access.on" : "settings.access.off")}
          >
            <AccessControl granted={s.roleplayAccess} onToggle={() => set({ roleplayAccess: !s.roleplayAccess })} />
          </Disclosure>
          <Disclosure id="reset" open={open} onToggle={toggle} title={t("settings.section.reset")} hint={t("settings.reset.phone.hint")}>
            <ResetRows />
          </Disclosure>
        </GroupFold>
      </div>
    </div>
  );
}
