import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { ME } from "@/mock/characters";
import { NavProvider, useNav, type Tab } from "@/shell/nav";
import { Messenger } from "@/screens/messenger";
import { Forum } from "@/screens/forum";
import { ForumSoon } from "@/shell/forum-soon";
import { PREVIEW } from "@/lib/api";
import { Profiles } from "@/screens/profiles";
import { Settings } from "@/screens/settings";

const MAIN: Tab[] = ["messenger", "forum", "profiles"];

function TabIcon({ tab, size = 22 }: { tab: Tab; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (tab === "messenger") return <svg {...p}><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
  if (tab === "forum") return <svg {...p}><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  if (tab === "profiles") return <svg {...p}><circle cx="12" cy="9" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <svg {...p}><circle cx="5.5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="18.5" cy="12" r="1.6" fill="currentColor" /></svg>;
}

const GEAR = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function Screen() {
  const { tab } = useNav();
  if (tab === "forum") return PREVIEW ? <Forum /> : <ForumSoon />;
  if (tab === "profiles") return <Profiles />;
  if (tab === "settings") return <Settings />;
  return <Messenger />;
}

function Chrome() {
  const t = useT();
  const phone = useIsPhone();
  const nav = useNav();
  const { tab, go, badges, chrome } = nav;
  const badgeOf = (x: Tab) => (x === "messenger" ? badges.messenger : x === "forum" ? badges.forum : 0);

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
            <Avatar name={t("shell.me")} hue={ME.hue} size={28} />
            {t("shell.me")}
            <button className={`gear${tab === "settings" ? " on" : ""}`} aria-label={t("shell.settings")} onClick={() => go("settings")}>{GEAR}</button>
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
          {(["messenger", "forum", "profiles", "settings"] as Tab[]).map((x) => (
            <button key={x} data-tab={x} className={`ptab${tab === x ? " on" : ""}`} aria-current={tab === x ? "page" : undefined} onClick={() => go(x)}>
              <TabIcon tab={x} />
              {t(x === "settings" ? "shell.more" : `shell.${x}`)}
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
