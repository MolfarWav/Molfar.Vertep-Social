import { useState, type ReactNode } from "react";
import { useNav } from "@/shell/nav";
import { useT } from "@/i18n/index";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import { Row, Segmented, Stepper, Switch, TimeRange, type Opt } from "./controls";
import { AccessControl, ModelRows, NotifyRows, Patch, Summary } from "./parts";

type Open = "quiet" | "models" | "notify" | "access" | null;

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
export function PhoneSettings({ s, set }: { s: SettingsMock; set: Patch }) {
  const t = useT();
  const { go } = useNav();
  const [open, setOpen] = useState<Open>(null);
  const toggle = (id: Open) => setOpen(id);

  const activity: Opt<SettingsMock["activity"]>[] = [
    { value: "quiet", label: t("settings.activity.quiet") },
    { value: "moderate", label: t("settings.activity.moderate") },
    { value: "lively", label: t("settings.activity.lively") },
    { value: "chaotic", label: t("settings.activity.chaotic.short") },
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
        <h2 className="gl">{t("settings.group.forum")}</h2>
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

        <h2 className="gl">{t("settings.group.messenger")}</h2>
        <section className="sec" aria-label={t("settings.group.messenger")}>
          <Row title={t("settings.messenger.first.phone")}>
            {(id) => <Switch labelledBy={id} checked={s.messengerFirst} onChange={(v) => set({ messengerFirst: v })} />}
          </Row>
          <Row title={t("settings.messenger.limit")}>
            {() => (
              <Stepper name={t("settings.messenger.limit")} value={s.messengerPerDay} min={LIMITS.messengerPerDay.min} max={LIMITS.messengerPerDay.max} onChange={(v) => set({ messengerPerDay: v })} />
            )}
          </Row>
        </section>

        <h2 className="gl">{t("settings.group.other")}</h2>
        <section className="sec" aria-label={t("settings.group.other")}>
          <Disclosure id="models" open={open} onToggle={toggle} title={t("settings.section.models")} hint={t("settings.models.phone.hint")}>
            <ModelRows s={s} set={set} />
          </Disclosure>
          <Disclosure id="notify" open={open} onToggle={toggle} title={t("settings.section.notify")} hint={t("settings.notify.phone.hint")}>
            <NotifyRows s={s} set={set} />
          </Disclosure>
          <Disclosure
            id="access"
            open={open}
            onToggle={toggle}
            title={t("settings.section.access")}
            hint={t(s.roleplayAccess ? "settings.access.on" : "settings.access.off")}
          >
            <AccessControl granted={s.roleplayAccess} onToggle={() => set({ roleplayAccess: !s.roleplayAccess })} />
            <div className="k hint">{t("settings.access.note")}</div>
          </Disclosure>
        </section>
      </div>
    </div>
  );
}
