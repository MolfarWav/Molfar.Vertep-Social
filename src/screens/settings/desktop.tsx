import { useT } from "@/i18n/index";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import type { ModelChoice } from "@/lib/api";
import { Row, Segmented, Slider, Stepper, Switch, TimeRange, type Opt } from "./controls";
import { AccessControl, Card, LanguageRows, ModelRows, Notice, NotifyRows, Patch, Summary } from "./parts";
import type { SettingsError } from "./state";

/** Desktop layout: two columns of cards, the same order and placement as the approved board. */
export function DesktopSettings({ s, set, choices, error }: { s: SettingsMock; set: Patch; choices: ModelChoice[]; error: SettingsError | null }) {
  const t = useT();
  const activity: Opt<SettingsMock["activity"]>[] = [
    { value: "quiet", label: t("settings.activity.quiet") },
    { value: "moderate", label: t("settings.activity.moderate") },
    { value: "lively", label: t("settings.activity.lively") },
    { value: "chaotic", label: t("settings.activity.chaotic") },
  ];
  const writers: Opt<SettingsMock["writers"]>[] = [
    { value: "profile", label: t("settings.writers.profile") },
    { value: "equal", label: t("settings.writers.equal") },
  ];
  const chat: Opt<SettingsMock["messengerQuiet"]>[] = [
    { value: "same", label: t("settings.messenger.quiet.same") },
    { value: "own", label: t("settings.messenger.quiet.own") },
  ];

  return (
    <div className="s-settings">
      <Notice error={error} />
      <Card title={t("settings.section.forum")} className="tall">
        <Row title={t("settings.autonomous")} hint={t(s.autonomous ? "settings.autonomous.hintOn" : "settings.autonomous.hint")}>
          {(id) => <Switch labelledBy={id} checked={s.autonomous} onChange={(v) => set({ autonomous: v })} />}
        </Row>

        <div className="blk">
          <div className="lbl" id="settings-activity">
            {t("settings.activity")}
          </div>
          <Segmented labelledBy="settings-activity" options={activity} value={s.activity} onChange={(v) => set({ activity: v })} />
          <div className="k hint">{t("settings.activity.hint")}</div>
        </div>

        <Row title={t("settings.posts.total")} hint={t("settings.posts.total.hint")}>
          {() => (
            <Stepper name={t("settings.posts.total")} value={s.postsPerDay} min={LIMITS.postsPerDay.min} max={LIMITS.postsPerDay.max} onChange={(v) => set({ postsPerDay: v })} />
          )}
        </Row>

        <Row title={t("settings.posts.author")} hint={t("settings.posts.author.hint")}>
          {() => (
            <Stepper name={t("settings.posts.author")} value={s.postsPerAuthor} min={LIMITS.postsPerAuthor.min} max={LIMITS.postsPerAuthor.max} onChange={(v) => set({ postsPerAuthor: v })} />
          )}
        </Row>

        <div className="blk">
          <div className="split">
            <b id="settings-newtopics">{t("settings.newtopics")}</b>
            <span className="k">{t("settings.newtopics.value", { n: s.newTopicShare })}</span>
          </div>
          <Slider
            labelledBy="settings-newtopics"
            value={s.newTopicShare}
            min={0}
            max={100}
            step={5}
            valueText={t("settings.newtopics.value", { n: s.newTopicShare })}
            onChange={(v) => set({ newTopicShare: v })}
          />
          <div className="sll">
            <span>{t("settings.newtopics.min")}</span>
            <span>{t("settings.newtopics.max")}</span>
          </div>
        </div>

        <Row title={t("settings.quiet")} hint={t("settings.quiet.hint")}>
          {() => <TimeRange from={s.quietFrom} to={s.quietTo} onFrom={(v) => set({ quietFrom: v })} onTo={(v) => set({ quietTo: v })} />}
        </Row>

        <Row title={t("settings.writers")} hint={t("settings.writers.hint")}>
          {(id) => <Segmented labelledBy={id} options={writers} value={s.writers} onChange={(v) => set({ writers: v })} />}
        </Row>

        <Summary s={s} phone={false} />
      </Card>

      <Card title={t("settings.section.messenger")}>
        <Row title={t("settings.messenger.first")} hint={t("settings.messenger.first.hint")}>
          {(id) => <Switch labelledBy={id} checked={s.messengerFirst} onChange={(v) => set({ messengerFirst: v })} />}
        </Row>
        <Row title={t("settings.messenger.limit")} hint={t("settings.messenger.limit.hint")}>
          {() => (
            <Stepper name={t("settings.messenger.limit")} value={s.messengerPerDay} min={LIMITS.messengerPerDay.min} max={LIMITS.messengerPerDay.max} onChange={(v) => set({ messengerPerDay: v })} />
          )}
        </Row>
        <Row title={t("settings.quiet")} hint={t("settings.messenger.quiet.hint")}>
          {(id) => <Segmented labelledBy={id} options={chat} value={s.messengerQuiet} onChange={(v) => set({ messengerQuiet: v })} />}
        </Row>
      </Card>

      <Card title={t("settings.section.models")}>
        <ModelRows s={s} set={set} choices={choices} />
        <div className="k hint">{t("settings.models.hint")}</div>
      </Card>

      <Card title={t("settings.section.notify")}>
        <NotifyRows s={s} set={set} />
      </Card>

      <Card title={t("settings.section.language")}>
        <LanguageRows />
      </Card>

      <Card title={t("settings.section.access")}>
        <AccessControl granted={s.roleplayAccess} onToggle={() => set({ roleplayAccess: !s.roleplayAccess })} />
      </Card>
    </div>
  );
}
