// Settings > Community (issue #358): what happens around the posts by itself. The Moderator (events, comments, closing topics),
// reactions, stories, and characters talking to each other. Everything that needs a model says so; the rest costs nothing.
// Reactions are on by default (no model call); the rest that spends tokens is off or weekly/rare.
import { useId } from "react";
import { useT } from "@/i18n/index";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import { Row, Segmented, Stepper, Switch, type Opt } from "./controls";
import type { Patch } from "./parts";

export function CommunityRows({ s, set, phone = false }: { s: SettingsMock; set: Patch; phone?: boolean }) {
  const t = useT();
  const toneId = useId();
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
  const tones: Opt<typeof c.tone>[] = [
    { value: "none", label: t("settings.community.tone.none") },
    { value: "warm", label: t("settings.community.tone.warm") },
    { value: "flirty", label: t("settings.community.tone.flirty") },
  ];
  const hint = (key: string, phoneKey?: string) => t((phone && phoneKey ? phoneKey : key) as never);
  return (
    <>
      <div className="ln col">
        <b>{t("settings.community.mod")}</b>
        <span className="k">{t("settings.community.mod.hint")}</span>
      </div>
      <Row className="stack" title={t("settings.community.events")} hint={phone ? undefined : t("settings.community.events.hint")}>
        {(id) => <Segmented labelledBy={id} options={events} value={c.events} onChange={(v) => change({ events: v })} />}
      </Row>
      <Row className="stack" title={t("settings.community.comments")} hint={phone ? undefined : t("settings.community.comments.hint")}>
        {(id) => <Segmented labelledBy={id} options={comments} value={c.modComments} onChange={(v) => change({ modComments: v })} />}
      </Row>
      <Row title={t("settings.community.closes")} hint={phone ? undefined : t("settings.community.closes.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.modCloses} onChange={(v) => change({ modCloses: v })} />}
      </Row>
      <Row title={t("settings.community.chronicle")} hint={phone ? undefined : t("settings.community.chronicle.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.chronicle} onChange={(v) => change({ chronicle: v })} />}
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

      <Row title={t("settings.community.clubs")} hint={hint("settings.community.clubs.hint", "settings.community.clubs.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.clubs} onChange={(v) => change({ clubs: v })} />}
      </Row>
      <div className={`pictures-more${c.clubs ? "" : " is-off"}`} aria-disabled={!c.clubs || undefined}>
        <Row title={t("settings.community.clubs.limit")} hint={phone ? undefined : t("settings.community.clubs.limit.hint")}>
          {() => <Stepper name={t("settings.community.clubs.limit")} value={c.clubsPerDay} min={LIMITS.clubsPerDay.min} max={LIMITS.clubsPerDay.max} onChange={(v) => change({ clubsPerDay: v })} />}
        </Row>
        <Row title={t("settings.community.clubsMod")} hint={hint("settings.community.clubsMod.hint", "settings.community.clubsMod.phone.hint")}>
          {(id) => <Switch labelledBy={id} checked={c.clubsMod} onChange={(v) => change({ clubsMod: v })} />}
        </Row>
      </div>
    </>
  );
}

/** Settings > Community > Between members (issues #366, #367): what the characters do about each other, by rules; none of it costs a model call. Its own card. */
export function MembersRows({ s, set, phone = false }: { s: SettingsMock; set: Patch; phone?: boolean }) {
  const t = useT();
  const toneId = useId();
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
  const tones: Opt<typeof c.tone>[] = [
    { value: "none", label: t("settings.community.tone.none") },
    { value: "warm", label: t("settings.community.tone.warm") },
    { value: "flirty", label: t("settings.community.tone.flirty") },
  ];
  const hint = (key: string, phoneKey?: string) => t((phone && phoneKey ? phoneKey : key) as never);
  return (
    <>
      <p className="k hint">{t("settings.community.life.hint")}</p>
      {phone ? (
        // on a phone the three choices need the whole width: title, choices, hint, stacked
        <div className="ln col">
          <b id={toneId}>{t("settings.community.tone")}</b>
          <Segmented labelledBy={toneId} options={tones} value={c.tone} onChange={(v) => change({ tone: v })} />
          <span className="k">{t("settings.community.tone.phone.hint")}</span>
        </div>
      ) : (
        <Row className="stack" title={t("settings.community.tone")} hint={t("settings.community.tone.hint")}>
          {(id) => <Segmented labelledBy={id} options={tones} value={c.tone} onChange={(v) => change({ tone: v })} />}
        </Row>
      )}
      <Row title={t("settings.community.gossip")} hint={hint("settings.community.gossip.hint", "settings.community.gossip.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.gossip} onChange={(v) => change({ gossip: v })} />}
      </Row>
      <div className={`pictures-more${c.gossip ? "" : " is-off"}`} aria-disabled={!c.gossip || undefined}>
        <Row title={t("settings.community.gossip.limit")}>
          {() => <Stepper name={t("settings.community.gossip.limit")} value={c.gossipPerDay} min={LIMITS.gossipPerDay.min} max={LIMITS.gossipPerDay.max} onChange={(v) => change({ gossipPerDay: v })} />}
        </Row>
      </div>
      <Row title={t("settings.community.jealousy")} hint={hint("settings.community.jealousy.hint", "settings.community.jealousy.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.jealousy} onChange={(v) => change({ jealousy: v })} />}
      </Row>
      <Row title={t("settings.community.reposts")} hint={hint("settings.community.reposts.hint", "settings.community.reposts.phone.hint")}>
        {(id) => <Switch labelledBy={id} checked={c.reposts} onChange={(v) => change({ reposts: v })} />}
      </Row>
      <div className={`pictures-more${c.reposts ? "" : " is-off"}`} aria-disabled={!c.reposts || undefined}>
        <Row title={t("settings.community.reposts.limit")}>
          {() => <Stepper name={t("settings.community.reposts.limit")} value={c.repostsPerDay} min={LIMITS.repostsPerDay.min} max={LIMITS.repostsPerDay.max} onChange={(v) => change({ repostsPerDay: v })} />}
        </Row>
      </div>
    </>
  );
}
