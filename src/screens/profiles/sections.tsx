// The section page every profile tab but Relationships is made of (#369): a menu of the tab's sections (desktop: a column on the left;
// phone: a strip of icons, the open one with its name) and the sections one under another, each under a heading with an outlined icon
// square in its own tone. A click in the menu scrolls to the section and the menu follows the scroll. The section the user was on is
// remembered per tab for the session, so coming back to a tab lands where they left it.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Gl, type GlyphName, type Tone } from "./glyphs";

export interface Section {
  id: string;
  title: string;
  icon: GlyphName;
  tone: Tone;
  /** A small mark beside the heading ("new"). */
  badge?: string;
  /** What sits at the right end of the heading (a button). */
  action?: ReactNode;
  children: ReactNode;
}

const KEY = "social.profiles.section.";
const read = (tab: string): string => {
  try {
    return sessionStorage.getItem(KEY + tab) ?? "";
  } catch {
    return "";
  }
};
const write = (tab: string, id: string) => {
  try {
    sessionStorage.setItem(KEY + tab, id);
  } catch {
    /* private window: the choice is simply not kept */
  }
};

export function SectionHead({ tone, icon, title, badge, action, id }: { tone: Tone; icon: GlyphName; title: string; badge?: string; action?: ReactNode; id?: string }) {
  return (
    <h3 className="sec-h" data-tone={tone} id={id}>
      <i className="sec-i"><Gl name={icon} /></i>
      <span className="sec-t">{title}</span>
      {badge && <span className="sec-badge">{badge}</span>}
      {action && <span className="sec-act">{action}</span>}
    </h3>
  );
}

export function SectionPage({ tab, label, sections }: { tab: string; label: string; sections: Section[] }) {
  const body = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => {
    const was = read(tab);
    return sections.some((s) => s.id === was) ? was : (sections[0]?.id ?? "");
  });
  const lock = useRef(0);

  // the menu follows the scroll: the last section whose top has passed the top of the page
  const spy = useCallback(() => {
    const el = body.current;
    if (!el || Date.now() < lock.current) return;
    const top = el.getBoundingClientRect().top;
    let cur = sections[0]?.id ?? "";
    for (const s of sections) {
      const sec = el.querySelector<HTMLElement>(`[data-sec="${s.id}"]`);
      if (sec && sec.getBoundingClientRect().top - top <= 32) cur = s.id;
    }
    // at the very end the last section may be too short to reach the top: it is the one in view then
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && sections.length > 0) cur = sections[sections.length - 1]!.id;
    setActive((a) => {
      if (a === cur) return a;
      write(tab, cur);
      return cur;
    });
  }, [sections, tab]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.addEventListener("scroll", spy, { passive: true });
    return () => el.removeEventListener("scroll", spy);
  }, [spy]);

  // coming back to a tab: scroll to the remembered section (no animation, nothing was seen yet)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on the tab's first show
  useEffect(() => {
    const el = body.current?.querySelector<HTMLElement>(`[data-sec="${active}"]`);
    if (el && active !== sections[0]?.id) el.scrollIntoView({ block: "start" });
  }, []);

  const go = (id: string) => {
    setActive(id);
    write(tab, id);
    // while the smooth scroll runs the spy would flip the menu back and forth
    lock.current = Date.now() + 700;
    body.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="secpage">
      <nav className="secnav" aria-label={label}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`secnav-i${s.id === active ? " on" : ""}`}
            data-tone={s.tone}
            aria-current={s.id === active ? "true" : undefined}
            aria-label={s.title}
            onClick={() => go(s.id)}
          >
            <i className="sec-i"><Gl name={s.icon} /></i>
            <span className="secnav-t">{s.title}</span>
          </button>
        ))}
      </nav>
      <div className="secbody" ref={body}>
        <div className="secstack">
          {sections.map((s) => (
            <section key={s.id} className="sec" data-sec={s.id} aria-labelledby={`sh-${tab}-${s.id}`}>
              <SectionHead id={`sh-${tab}-${s.id}`} tone={s.tone} icon={s.icon} title={s.title} badge={s.badge} action={s.action} />
              <div className="sec-b">{s.children}</div>
            </section>
          ))}
          <div className="sec-end" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
