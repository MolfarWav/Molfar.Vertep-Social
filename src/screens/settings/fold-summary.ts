// The one-line state a folded group shows on a phone (Settings), so a closed group still says what it is set to.
import type { SettingsMock } from "@/mock/settings";

export type FoldGroup = "forum" | "messenger" | "life" | "community" | "members" | "pictures";

/** The switches of a group: how many are on is its state. A group with one main switch says On or Off. */
export function flagsOf(s: SettingsMock, g: FoldGroup): boolean[] {
  const c = s.community;
  switch (g) {
    case "forum":
      return [s.autonomous];
    case "messenger":
      return [s.messengerFirst, s.messengerSummary, s.messengerRecall, s.messengerPlace, s.factsShare];
    case "life":
      return [s.life.on];
    case "community":
      return [c.reactions, c.modCloses, c.chronicle, c.stories, c.storiesToJournal, c.journalPosts, c.journalPictures, c.journalComments, c.chats, c.clubs, c.clubsMod];
    case "members":
      return [c.gossip, c.jealousy, c.reposts];
    case "pictures":
      return [s.images.on];
  }
}

type T = (key: never, vars?: Record<string, string | number>) => string;

/** "Off", "On", "Moderate, 30 a day" or "3 of 11 on", by group. */
export function foldSummary(t: T, s: SettingsMock, g: FoldGroup): string {
  const tt = t as (key: string, vars?: Record<string, string | number>) => string;
  const flags = flagsOf(s, g);
  const on = flags.filter(Boolean).length;
  if (on === 0) return tt("settings.fold.off");
  if (g === "forum") {
    const activity = tt(`settings.activity.${s.activity === "chaotic" ? "chaotic.short" : s.activity}`);
    return `${activity} · ${tt("settings.fold.perday", { n: s.postsPerDay })}`;
  }
  if (g === "pictures") return `${tt("settings.fold.on")} · ${tt("settings.fold.perday", { n: s.images.perDay })}`;
  if (flags.length === 1) return tt("settings.fold.on");
  return tt("settings.fold.count", { on, all: flags.length });
}
