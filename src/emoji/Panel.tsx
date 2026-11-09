// The picker itself: a search box, the groups, recent emoji and a skin-tone choice. The same panel is a popover on
// desktop and a tray under the message box on a phone (the host decides, see use-emoji.tsx).
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { currentLang, useT } from "@/i18n/index";
import { EMOJI, GROUPS, GROUP_ICONS, groupName, labelOf, nameOf, withTone, type Emoji } from "./data";
import { loadRecent, loadTone, pushRecent, saveRecent, saveTone } from "./recent";
import { searchEmoji } from "./search";

export interface PanelProps {
  mode: "popover" | "tray";
  /** An emoji was chosen. `keepOpen` is true when Shift or Ctrl was held. */
  onPick: (char: string, keepOpen: boolean) => void;
  onClose: () => void;
}

const TONE_COLORS = ["#ffcc33", "#f7d7c4", "#e3b995", "#c08f67", "#8f5d3b", "#4f3a30"];
const noFocusSteal = (e: MouseEvent) => e.preventDefault();

// Only the first emoji is a tab stop; the arrow keys move between the others.
function Cell({ char, label, first }: { char: string; label: string; first: boolean }) {
  return (
    <button type="button" className="emo-e" tabIndex={first ? 0 : -1} aria-label={label} title={label} data-char={char} data-label={label} onMouseDown={noFocusSteal}>
      {char}
    </button>
  );
}

export function Panel({ mode, onPick, onClose }: PanelProps) {
  const t = useT();
  const lang = currentLang();
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState(loadTone);
  const [recent, setRecent] = useState(loadRecent);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);

  const results = useMemo(() => (query.trim() ? searchEmoji(query, lang) : null), [query, lang]);
  const byGroup = useMemo(() => {
    const out: Emoji[][] = GROUPS.map(() => []);
    for (const e of EMOJI) out[e.group].push(e);
    return out;
  }, []);

  // the tab strip follows the scroll position: the last section whose top has passed the top edge
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    let at = 0;
    sections.current.forEach((el, i) => {
      if (el && el.offsetTop - box.offsetTop <= box.scrollTop + 8) at = i;
    });
    setActive(at);
  };
  const jump = (i: number) => {
    const el = sections.current[i];
    const box = scroller.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - box.offsetTop, behavior: "auto" });
    setActive(i);
  };

  const choose = (char: string, keep: boolean) => {
    const next = pushRecent(recent, char);
    setRecent(next);
    saveRecent(next);
    onPick(char, keep);
  };
  const changeTone = (n: number) => {
    setTone(n);
    saveTone(n);
  };

  const onGridClick = (ev: MouseEvent) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.emo-e");
    if (b?.dataset.char) choose(b.dataset.char, ev.shiftKey || ev.ctrlKey);
  };
  const onGridOver = (ev: MouseEvent | FocusEvent) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.emo-e");
    setHint(b?.dataset.label ?? "");
  };

  // arrows move between emoji: left and right by one, up and down by a row
  const onGridKey = (ev: KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!keys.includes(ev.key)) return;
    const cur = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.emo-e");
    if (!cur || !scroller.current) return;
    ev.preventDefault();
    const all = Array.from(scroller.current.querySelectorAll<HTMLButtonElement>("button.emo-e"));
    const at = all.indexOf(cur);
    const grid = cur.parentElement;
    const cols = grid ? Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length) : 8;
    const step = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : ev.key === "ArrowUp" ? -cols : cols;
    const next = all[Math.min(all.length - 1, Math.max(0, at + step))];
    if (next) {
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    }
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      onClose();
    }
  };
  const onSearchKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter" && results && results[0]) {
      ev.preventDefault();
      choose(withTone(results[0], tone), ev.shiftKey || ev.ctrlKey);
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      scroller.current?.querySelector<HTMLButtonElement>("button.emo-e")?.focus();
    }
  };

  // a new search starts at the top
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [query]);

  const cell = (e: Emoji, first: boolean) => <Cell key={e.char} char={withTone(e, tone)} label={nameOf(e, lang)} first={first} />;

  return (
    <div className={`emo-panel ${mode}`} role="dialog" aria-label={t("emoji.panel")} onKeyDown={onKey}>
      <div className="emo-head">
        <input
          className="emo-search"
          type="search"
          autoFocus={mode === "popover"}
          value={query}
          placeholder={t("emoji.search")}
          aria-label={t("emoji.search")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        {mode === "tray" && (
          <button type="button" className="emo-close" aria-label={t("emoji.close")} title={t("emoji.close")} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      {!results && (
        <div className="emo-tabs" role="group" aria-label={t("emoji.groups")}>
          {recent.length > 0 && (
            <button type="button" className="emo-tab" aria-label={t("emoji.recent")} title={t("emoji.recent")} onMouseDown={noFocusSteal} onClick={() => scroller.current?.scrollTo({ top: 0 })}>
              🕘
            </button>
          )}
          {GROUPS.map((g, i) => (
            <button key={g.id} type="button" className={`emo-tab${active === i ? " on" : ""}`} aria-label={groupName(g, lang)} title={groupName(g, lang)} aria-current={active === i} onMouseDown={noFocusSteal} onClick={() => jump(i)}>
              {GROUP_ICONS[i]}
            </button>
          ))}
        </div>
      )}
      <div className="emo-scroll" ref={scroller} onScroll={results ? undefined : onScroll} onClick={onGridClick} onMouseOver={onGridOver} onFocus={onGridOver} onKeyDown={onGridKey}>
        {results ? (
          results.length ? (
            <div className="emo-grid">{results.map((e, i) => cell(e, i === 0))}</div>
          ) : (
            <div className="emo-none">{t("emoji.none")}</div>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <h3 className="emo-h">{t("emoji.recent")}</h3>
                <div className="emo-grid">
                  {recent.map((c, i) => (
                    <Cell key={c} char={c} label={labelOf(c, lang)} first={i === 0} />
                  ))}
                </div>
              </section>
            )}
            {GROUPS.map((g, gi) => (
              <section key={g.id} ref={(el) => void (sections.current[gi] = el)}>
                <h3 className="emo-h">{groupName(g, lang)}</h3>
                <div className="emo-grid">{byGroup[gi].map((e, i) => cell(e, gi === 0 && i === 0 && recent.length === 0))}</div>
              </section>
            ))}
          </>
        )}
      </div>
      <div className="emo-foot">
        {mode === "popover" && <span className="emo-hint" aria-hidden="true">{hint}</span>}
        <div className="emo-tones" role="radiogroup" aria-label={t("emoji.tone")}>
          {TONE_COLORS.map((c, n) => (
            <button key={n} type="button" role="radio" aria-checked={tone === n} aria-label={t(`emoji.tone.${n}`)} title={t(`emoji.tone.${n}`)} className={`emo-tone${tone === n ? " on" : ""}`} style={{ background: c }} onMouseDown={noFocusSteal} onClick={() => changeTone(n)} />
          ))}
        </div>
      </div>
    </div>
  );
}
