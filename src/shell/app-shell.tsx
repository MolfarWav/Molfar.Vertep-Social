import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { NavProvider, useNav, type Tab } from "@/shell/nav";
import { Messenger } from "@/screens/messenger";
import { Forum } from "@/screens/forum";
import { useBadgePoll } from "@/lib/badges";
import { useImageWorker } from "@/pictures/worker";
import { Profiles } from "@/screens/profiles";
import { Settings } from "@/screens/settings";
import { You } from "@/screens/you";
import { ensureYou, useYou } from "@/screens/you/store";

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
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

function Screen() {
  const { tab } = useNav();
  if (tab === "forum") return <Forum />;
  if (tab === "profiles") return <Profiles />;
  if (tab === "settings") return <Settings />;
  if (tab === "you") return <You />;
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
  const you = useYou();
  const me = you?.personas.find((p) => p.id === you.active);
  // a phone has no "You" chip: Settings opens Your profile, so More stays lit while it is open
  const lit: Tab = tab === "you" ? "settings" : tab;
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
            <button type="button" className={`mebtn${tab === "you" ? " on" : ""}`} aria-label={`${me?.name ?? t("shell.me")}: ${t("shell.you")}`} aria-current={tab === "you" ? "page" : undefined} onClick={() => go("you")}>
              <Avatar name={me?.name ?? t("shell.me")} hue={me?.hue ?? 210} size={28} picture={me?.picture || undefined} />
              <span className="mename">{me?.name ?? t("shell.me")}</span>
            </button>
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
            <button key={x} data-tab={x} className={`ptab${lit === x ? " on" : ""}`} aria-current={lit === x ? "page" : undefined} onClick={() => go(x)}>
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
