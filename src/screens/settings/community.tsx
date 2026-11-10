// Settings > Community (issue #358): what happens around the posts by itself. The Moderator (events, comments, closing topics),
// reactions, stories, and characters talking to each other. Everything that needs a model says so; the rest costs nothing.
// Reactions are on by default (no model call); the rest that spends tokens is off or weekly/rare.
import { useT } from "@/i18n/index";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import { Row, Segmented, Stepper, Switch, type Opt } from "./controls";
import type { Patch } from "./parts";

export function CommunityRows({ s, set, phone = false }: { s: SettingsMock; set: Patch; phone?: boolean }) {
  const t = useT();
  const c = s.community;
  const change = (patch: Partial<typeof c>) => set({ community: { ...c, ...patch } });
  const events: Opt<typeof c.events>[] = [
    { value: "off", label: t("settings.community.off") },
    { value: "daily", label: t("settings.community.daily") },
    { value: "weekly", label: t("settings.community.weekly") },
  ];
  const comments: Opt<typeof c.modComments>[] = [
    { value: "off", label: t("settings.community.off") },
    { value: "rare", label: t("settings.community.rare") },
    { value: "often", label: t("settings.community.often") },
  ];
  const hint = (key: string, phoneKey?: string) => t((phone && phoneKey ? phoneKey : key) as never);
  return (
    <>
      <div className="blk">
        <div className="lbl">{t("settings.community.mod")}</div>
        <div className="k hint">{t("settings.community.mod.hint")}</div>
      </div>
      <Row title={t("settings.community.events")} hint={phone ? undefined : t("settings.community.events.hint")}>
        {(id) => <Segmented labelledBy={id} options={events} value={c.events} onChange={(v) => change({ events: v })} />}
      </Row>
      <Row title={t("settings.community.comments")} hint={phone ? undefined : t("settings.community.comments.hint")}>
        {(id) => <Segmented labelledBy={id} options={comments} value={c.modComments} onChange={(v) => change({ modComments: v })} />}
      </Row>
      <Row title={t("settings.community.closes")} hint={phone ? undefined : t("settings.community.closes.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.modCloses} onChange={(v) => change({ modCloses: v })} />}
      </Row>

      <Row title={t("settings.community.reactions")} hint={hint("settings.community.reactions.hint", "settings.community.reactions.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.reactions} onChange={(v) => change({ reactions: v })} />}
      </Row>
      <div className={`pictures-more${c.reactions ? "" : " is-off"}`} aria-disabled={!c.reactions || undefined}>
        <Row title={t("settings.community.reactions.limit")}>
          {() => <Stepper name={t("settings.community.reactions.limit")} value={c.reactionsPerDay} min={LIMITS.reactionsPerDay.min} max={LIMITS.reactionsPerDay.max} onChange={(v) => change({ reactionsPerDay: v })} />}
        </Row>
      </div>

      <Row title={t("settings.community.stories")} hint={hint("settings.community.stories.hint", "settings.community.stories.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.stories} onChange={(v) => change({ stories: v })} />}
      </Row>
      <div className={`pictures-more${c.stories ? "" : " is-off"}`} aria-disabled={!c.stories || undefined}>
        <Row title={t("settings.community.stories.limit")}>
          {() => <Stepper name={t("settings.community.stories.limit")} value={c.storiesPerDay} min={LIMITS.storiesPerDay.min} max={LIMITS.storiesPerDay.max} onChange={(v) => change({ storiesPerDay: v })} />}
        </Row>
      </div>

      <Row title={t("settings.community.chats")} hint={hint("settings.community.chats.hint", "settings.community.chats.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.chats} onChange={(v) => change({ chats: v })} />}
      </Row>
      <div className={`pictures-more${c.chats ? "" : " is-off"}`} aria-disabled={!c.chats || undefined}>
        <Row title={t("settings.community.chats.limit")} hint={phone ? undefined : t("settings.community.chats.limit.hint")}>
          {() => <Stepper name={t("settings.community.chats.limit")} value={c.chatsPerDay} min={LIMITS.chatsPerDay.min} max={LIMITS.chatsPerDay.max} onChange={(v) => change({ chatsPerDay: v })} />}
        </Row>
      </div>
    </>
  );
}
