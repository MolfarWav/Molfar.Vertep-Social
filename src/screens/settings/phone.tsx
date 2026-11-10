import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { useNav } from "@/shell/nav";
import { useYou } from "@/screens/you/store";
import { useT, useLangPref } from "@/i18n/index";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import { PREVIEW, type ModelChoice } from "@/lib/api";
import { Row, Segmented, Stepper, Switch, TimeRange, type Opt } from "./controls";
import { CommunityRows } from "./community";
import { LifeMain, LifeWorld } from "./life";
import { PicturesRows } from "./pictures";
import { ResetRows } from "./reset";
import { AccessControl, GroupHead, LanguageRows, languageHint, ModelRows, Notice, NotifyRows, Patch, Summary } from "./parts";
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

/** Phone layout: one scrolling page with its own header. The shell's bottom tabs stay (tab "More"). */
export function PhoneSettings({ s, set, choices, error }: { s: SettingsMock; set: Patch; choices: ModelChoice[]; error: SettingsError | null }) {
  const t = useT();
  const { go } = useNav();
  const you = useYou();
  const { pref, lang } = useLangPref();
  const me = you?.personas.find((p) => p.id === you.active);
  const [open, setOpen] = useState<Open>(null);
  const toggle = (id: Open) => setOpen(id);

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
        <button type="button" className="hd-back" aria-label={t("settings.back")} onClick={() => go("messenger")}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="hd-title">{t("settings.title")}</h1>
      </header>

      <div className="pg">
        <Notice error={error} />
        <section className="sec" aria-label={t("you.title")}>
          <button type="button" className="ln row" onClick={() => go("you")}>
            <Avatar name={me?.name ?? t("shell.me")} hue={me?.hue ?? 210} size={36} picture={me?.picture || undefined} />
            <span className="t">
              <b>{t("you.title")}</b>
              <span className="k">{me ? me.name : t("you.subtitle")}</span>
            </span>
            <span className="go" aria-hidden="true">›</span>
          </button>
        </section>
        <GroupHead title={t("settings.group.forum")} glyph="forum" />
        <section className="sec" aria-label={t("settings.group.forum")}>
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
        </section>
        <Summary s={s} phone />

        <GroupHead title={t("settings.group.messenger")} glyph="messenger" />
        <section className="sec" aria-label={t("settings.group.messenger")}>
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
          <Row title={t("settings.messenger.knows")} hint={t("settings.messenger.knows.phone.hint")}>
            {(id) => <Segmented labelledBy={id} options={knows} value={s.messengerKnows} onChange={(v) => set({ messengerKnows: v })} />}
          </Row>
        </section>

        <GroupHead title={t("settings.group.life")} glyph="life" />
        <section className="sec" aria-label={t("settings.group.life")}>
          <LifeMain s={s} set={set} phone />
          <Disclosure id="life" open={open} onToggle={toggle} title={t("settings.life.world.phone")} hint={t("settings.life.world.phone.hint")}>
            <LifeWorld s={s} set={set} />
          </Disclosure>
        </section>

        <GroupHead title={t("settings.group.community")} glyph="community" />
        <section className="sec" aria-label={t("settings.group.community")}>
          <CommunityRows s={s} set={set} phone />
        </section>

        <GroupHead title={t("settings.group.pictures")} glyph="pictures" />
        <section className="sec" aria-label={t("settings.group.pictures")}>
          <PicturesRows s={s} set={set} phone />
        </section>

        <GroupHead title={t("settings.group.other")} glyph="other" />
        <section className="sec" aria-label={t("settings.group.other")}>
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
        </section>
      </div>
    </div>
  );
}
