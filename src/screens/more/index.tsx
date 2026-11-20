import type { ReactNode } from "react";
import "./more.css";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { useNav, type Tab } from "@/shell/nav";
import { Gear, TabIcon } from "@/shell/icons";
import { useYou } from "@/screens/you/store";

// The phone's "More" tab: what has no tab of its own, as a grid of icon tiles (the way Roleplay's "All sections" sheet does it).
// Desktop has all of these in its top bar, so this page is for phones; on a wide window it is the same grid, centred.
//
// Preview: ?screen=more

interface Tile {
  tab: Tab;
  tone: "violet" | "amber" | "sky" | "teal";
  icon: ReactNode;
  title: string;
  hint: string;
  badge?: number;
}

export function More() {
  const t = useT();
  const { go, badges } = useNav();
  const you = useYou();
  const me = you?.personas.find((p) => p.id === you.active);
  const tiles: Tile[] = [
    {
      tab: "you",
      tone: "violet",
      icon: <Avatar name={me?.name ?? t("shell.me")} hue={me?.hue ?? 210} size={40} picture={me?.picture || undefined} />,
      title: t("you.title"),
      hint: me ? me.name : t("you.subtitle"),
    },
    { tab: "journal", tone: "amber", icon: <TabIcon tab="journal" size={26} />, title: t("journal.title"), hint: t("settings.journal.hint"), badge: badges.journal },
    { tab: "city", tone: "sky", icon: <TabIcon tab="city" size={26} />, title: t("city.title"), hint: t("settings.city.hint") },
    { tab: "settings", tone: "teal", icon: <Gear size={26} />, title: t("settings.title"), hint: t("more.settings.hint") },
  ];
  return (
    <div className="s-more">
      <h1 className="mh">{t("shell.more")}</h1>
      <div className="mg">
        {tiles.map((x) => (
          <button key={x.tab} type="button" className="mt" data-tone={x.tone} data-tile={x.tab} onClick={() => go(x.tab)}>
            <span className="mi" aria-hidden="true">{x.icon}</span>
            <b>{x.title}</b>
            <span className="k">{x.hint}</span>
            {x.badge ? <span className="mb" aria-label={t("journal.comments.new", { n: x.badge })}>{x.badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
