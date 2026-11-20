import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { NavProvider, useNav, type Tab } from "@/shell/nav";
import { Gear, TabIcon } from "@/shell/icons";
import { Messenger } from "@/screens/messenger";
import { Forum } from "@/screens/forum";
import { useBadgePoll } from "@/lib/badges";
import { onShellView } from "@/lib/shell-view";
import { useImageWorker } from "@/pictures/worker";
import { City } from "@/screens/city";
import { Journal } from "@/screens/journal";
import { More } from "@/screens/more";
import { Profiles } from "@/screens/profiles";
import { Settings } from "@/screens/settings";
import { You } from "@/screens/you";
import { ensureYou, useYou } from "@/screens/you/store";

const MAIN: Tab[] = ["messenger", "forum", "profiles", "journal", "city"];

function Screen() {
  const { tab } = useNav();
  if (tab === "forum") return <Forum />;
  if (tab === "profiles") return <Profiles />;
  if (tab === "journal") return <Journal />;
  if (tab === "city") return <City />;
  if (tab === "settings") return <Settings />;
  if (tab === "you") return <You />;
  if (tab === "more") return <More />;
  return <Messenger />;
}

function Chrome() {
  const t = useT();
  const phone = useIsPhone();
  const nav = useNav();
  const { tab, go, badges, chrome } = nav;
  useBadgePoll();
  useImageWorker();
  useEffect(ensureYou, []);
  // the shell's Settings lists Social under "App settings" (manifest `settingsView`) and opens it on Settings
  useEffect(() => onShellView((v) => { if (v === "settings") go("settings"); }), [go]);
  const you = useYou();
  const me = you?.personas.find((p) => p.id === you.active);
  // a phone has no "You" chip, no gear and no Journal or City tab: More opens Your profile, the Journal, the City and Settings, so it stays lit while they are open
  const lit: Tab = tab === "you" || tab === "journal" || tab === "city" || tab === "settings" ? "more" : tab;
  // (#453) the journal's new comments: on its tab on desktop, on More on a phone (the Journal tile there shows it too)
  const badgeOf = (x: Tab) => (x === "messenger" ? badges.messenger : x === "forum" ? badges.forum : x === "journal" && !phone ? badges.journal : x === "more" && phone ? badges.journal : 0);

  return (
    <div className="soc">
      {!phone && (
        <header className="bar">
          <div className="brand"><Logo />Social</div>
          <nav className="tabs" aria-label="Social">
            {MAIN.map((x) => (
              <button key={x} data-tab={x} className={`tab${tab === x ? " on" : ""}`} aria-current={tab === x ? "page" : undefined} onClick={() => go(x)}>
                <TabIcon tab={x} size={18} />
                {t(`shell.${x}`)}
                {badgeOf(x) > 0 && <span className="badge">{badgeOf(x)}</span>}
              </button>
            ))}
          </nav>
          <div className="me">
            <button type="button" className={`mebtn${tab === "you" ? " on" : ""}`} aria-label={`${me?.name ?? t("shell.me")}: ${t("shell.you")}`} aria-current={tab === "you" ? "page" : undefined} onClick={() => go("you")}>
              <Avatar name={me?.name ?? t("shell.me")} hue={me?.hue ?? 210} size={28} picture={me?.picture || undefined} />
              <span className="mename">{me?.name ?? t("shell.me")}</span>
            </button>
            <button className={`gear${tab === "settings" ? " on" : ""}`} aria-label={t("shell.settings")} onClick={() => go("settings")}><Gear /></button>
          </div>
        </header>
      )}
      {phone && chrome.bar && (
        <header className="bar bar-phone">
          <div className="brand"><Logo />Social</div>
          <div ref={nav.setSlot} style={{ display: "contents" }} />
        </header>
      )}
      <main className="main"><Screen /></main>
      {phone && chrome.tabs && (
        <nav className="ptabs" aria-label="Social">
          {(["messenger", "forum", "profiles", "more"] as Tab[]).map((x) => (
            <button key={x} data-tab={x} className={`ptab${lit === x ? " on" : ""}`} aria-current={lit === x ? "page" : undefined} onClick={() => go(x)}>
              <TabIcon tab={x} />
              {t(`shell.${x}`)}
              {badgeOf(x) > 0 && <span className="pbadge">{badgeOf(x)}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export function AppShell() {
  return (
    <NavProvider>
      <Chrome />
    </NavProvider>
  );
}
