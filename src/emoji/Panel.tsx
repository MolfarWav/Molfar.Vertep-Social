// The picker itself: a search box, the groups, recent emoji and a skin-tone choice, then one tab per sticker or custom emoji
// pack the user added (issue #329). The same panel is a popover on desktop and a tray under the message box on a phone (the
// host decides, see use-emoji.tsx).
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { currentLang, useT } from "@/i18n/index";
import { findItem, parseToken, searchPacks, tokenOf, type StickerItem, type StickerPack } from "@/stickers/model";
import { usePacks } from "@/stickers/packs";
import "@/stickers/stickers.css";
import { EMOJI, GROUPS, GROUP_ICONS, groupName, labelOf, nameOf, withTone, type Emoji } from "./data";
import { loadRecent, loadTone, pushRecent, saveRecent, saveTone } from "./recent";
import { searchEmoji } from "./search";

export interface PanelProps {
  mode: "popover" | "tray";
  /** An emoji was chosen (a Unicode character, or a custom emoji token). `keepOpen` is true when Shift or Ctrl was held. */
  onPick: (char: string, keepOpen: boolean) => void;
  /** A sticker was chosen. Only the hosts that can send one give it; without it the sticker packs are left out. */
  onSticker?: (pack: StickerPack, item: StickerItem) => void;
  /** Opens the pack manager. */
  onManage?: () => void;
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

function ItemCell({ pack, item, first, label }: { pack: StickerPack; item: StickerItem; first: boolean; label: string }) {
  return (
    <button type="button" className="emo-e" tabIndex={first ? 0 : -1} aria-label={label} title={item.name} data-token={tokenOf(pack.id, item.id)} data-label={item.name} onMouseDown={noFocusSteal}>
      <img className="stk-cell" src={item.url} alt="" loading="lazy" draggable={false} />
    </button>
  );
}

export function Panel({ mode, onPick, onSticker, onManage, onClose }: PanelProps) {
  const t = useT();
  const lang = currentLang();
  const allPacks = usePacks();
  // a host that cannot send a sticker (a new topic) still offers the custom emoji
  const packs = useMemo(() => allPacks.filter((p) => p.items.length > 0 && (p.kind === "emoji" || onSticker)), [allPacks, onSticker]);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState(loadTone);
  const [recent, setRecent] = useState(loadRecent);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState("");
  const [view, setView] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const pending = useRef<number | null>(null);
  const shown = packs.find((p) => p.id === view) ?? null;

  const results = useMemo(() => (query.trim() ? searchEmoji(query, lang) : null), [query, lang]);
  const packHits = useMemo(() => (query.trim() ? searchPacks(packs, query) : []), [query, packs]);
  const byGroup = useMemo(() => {
    const out: Emoji[][] = GROUPS.map(() => []);
    for (const e of EMOJI) out[e.group].push(e);
    return out;
  }, []);
  // a recent custom emoji or sticker whose pack was deleted is left out
  const recentOk = useMemo(
    () =>
      recent.filter((c) => {
        const p = parseToken(c);
        return !p || !!findItem(packs, p.pack, p.item);
      }),
    [recent, packs],
  );

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
  const scrollTo = (i: number) => {
    const el = i < 0 ? null : sections.current[i];
    const box = scroller.current;
    if (box) box.scrollTo({ top: el ? el.offsetTop - box.offsetTop : 0, behavior: "auto" });
    if (i >= 0) setActive(i);
  };
  // a group tab pressed while a pack is open goes back to the Unicode view first, then scrolls
  const jump = (i: number) => {
    if (shown) {
      pending.current = i;
      setView("");
    } else scrollTo(i);
  };
  useEffect(() => {
    if (view === "" && pending.current !== null) {
      const i = pending.current;
      pending.current = null;
      scrollTo(i);
    }
  }, [view]);

  const remember = (key: string) => {
    const next = pushRecent(recent, key);
    setRecent(next);
    saveRecent(next);
  };
  const choose = (char: string, keep: boolean) => {
    remember(char);
    onPick(char, keep);
  };
  // a custom emoji goes into the text; a sticker is sent at once (when the host can)
  const chooseToken = (token: string, keep: boolean) => {
    const p = parseToken(token);
    const hit = p ? findItem(packs, p.pack, p.item) : null;
    if (!hit) return;
    remember(token);
    if (hit.pack.kind === "sticker") onSticker?.(hit.pack, hit.item);
    else onPick(token, keep);
  };
  const changeTone = (n: number) => {
    setTone(n);
    saveTone(n);
  };

  const onGridClick = (ev: MouseEvent) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.emo-e");
    if (!b) return;
    if (b.dataset.token) chooseToken(b.dataset.token, ev.shiftKey || ev.ctrlKey);
    else if (b.dataset.char) choose(b.dataset.char, ev.shiftKey || ev.ctrlKey);
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
    } else if (ev.key === "Enter" && packHits[0]) {
      ev.preventDefault();
      chooseToken(tokenOf(packHits[0].pack.id, packHits[0].item.id), ev.shiftKey || ev.ctrlKey);
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      scroller.current?.querySelector<HTMLButtonElement>("button.emo-e")?.focus();
    }
  };

  // a new search or a new view starts at the top
  useEffect(() => {
    if (scroller.current && pending.current === null) scroller.current.scrollTop = 0;
  }, [query, view]);

  const cell = (e: Emoji, first: boolean) => <Cell key={e.char} char={withTone(e, tone)} label={nameOf(e, lang)} first={first} />;
  const itemLabel = (p: StickerPack, it: StickerItem) => t(p.kind === "sticker" ? "stk.send" : "stk.insert", { name: it.name });
  const noHits = !!results && results.length === 0 && packHits.length === 0;

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
          {recentOk.length > 0 && (
            <button type="button" className="emo-tab" aria-label={t("emoji.recent")} title={t("emoji.recent")} onMouseDown={noFocusSteal} onClick={() => jump(-1)}>
              🕘
            </button>
          )}
          {GROUPS.map((g, i) => (
            <button key={g.id} type="button" className={`emo-tab${!shown && active === i ? " on" : ""}`} aria-label={groupName(g, lang)} title={groupName(g, lang)} aria-current={!shown && active === i} onMouseDown={noFocusSteal} onClick={() => jump(i)}>
              {GROUP_ICONS[i]}
            </button>
          ))}
        </div>
      )}
      {!results && onManage && (
        <div className="emo-tabs emo-packs" role="group" aria-label={t("stk.packs")}>
          {packs.map((p) => (
            <button key={p.id} type="button" className="emo-tab stk-tab" aria-label={t("stk.pack", { name: p.name })} title={p.name} aria-current={shown?.id === p.id} onMouseDown={noFocusSteal} onClick={() => setView(p.id)}>
              <img className="stk-thumb" src={p.items[0]!.url} alt="" draggable={false} />
            </button>
          ))}
          <button type="button" className="emo-tab stk-add" aria-label={t("stk.manage")} title={t("stk.manage")} onMouseDown={noFocusSteal} onClick={onManage}>
            <span aria-hidden="true">＋</span>
            {packs.length === 0 && <span className="stk-add-l">{t("stk.pickerAdd")}</span>}
          </button>
        </div>
      )}
      <div className="emo-scroll" ref={scroller} onScroll={results || shown ? undefined : onScroll} onClick={onGridClick} onMouseOver={onGridOver} onFocus={onGridOver} onKeyDown={onGridKey}>
        {results ? (
          noHits ? (
            <div className="emo-none">{t("emoji.none")}</div>
          ) : (
            <>
              {results.length > 0 && <div className="emo-grid">{results.map((e, i) => cell(e, i === 0))}</div>}
              {Array.from(new Set(packHits.map((h) => h.pack.id))).map((id) => {
                const hits = packHits.filter((h) => h.pack.id === id);
                const pack = hits[0]!.pack;
                return (
                  <section key={id}>
                    <h3 className="emo-h">{pack.name}</h3>
                    <div className={`emo-grid${pack.kind === "sticker" ? " stk-sticker" : ""}`}>
                      {hits.map((h, i) => (
                        <ItemCell key={h.item.id} pack={pack} item={h.item} first={results.length === 0 && i === 0 && id === packHits[0]!.pack.id} label={itemLabel(pack, h.item)} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )
        ) : shown ? (
          <section>
            <h3 className="emo-h">{shown.name}</h3>
            <div className={`emo-grid${shown.kind === "sticker" ? " stk-sticker" : ""}`}>
              {shown.items.map((it, i) => (
                <ItemCell key={it.id} pack={shown} item={it} first={i === 0} label={itemLabel(shown, it)} />
              ))}
            </div>
          </section>
        ) : (
          <>
            {recentOk.length > 0 && (
              <section>
                <h3 className="emo-h">{t("emoji.recent")}</h3>
                <div className="emo-grid">
                  {recentOk.map((c, i) => {
                    const p = parseToken(c);
                    const hit = p ? findItem(packs, p.pack, p.item) : null;
                    return hit ? <ItemCell key={c} pack={hit.pack} item={hit.item} first={i === 0} label={itemLabel(hit.pack, hit.item)} /> : <Cell key={c} char={c} label={labelOf(c, lang)} first={i === 0} />;
                  })}
                </div>
              </section>
            )}
            {GROUPS.map((g, gi) => (
              <section key={g.id} ref={(el) => void (sections.current[gi] = el)}>
                <h3 className="emo-h">{groupName(g, lang)}</h3>
                <div className="emo-grid">{byGroup[gi].map((e, i) => cell(e, gi === 0 && i === 0 && recentOk.length === 0))}</div>
              </section>
            ))}
          </>
        )}
      </div>
      <div className="emo-foot">
        {mode === "popover" && <span className="emo-hint" aria-hidden="true">{hint}</span>}
        {!shown && (
          <div className="emo-tones" role="radiogroup" aria-label={t("emoji.tone")}>
            {TONE_COLORS.map((c, n) => (
              <button key={n} type="button" role="radio" aria-checked={tone === n} aria-label={t(`emoji.tone.${n}`)} title={t(`emoji.tone.${n}`)} className={`emo-tone${tone === n ? " on" : ""}`} style={{ background: c }} onMouseDown={noFocusSteal} onClick={() => changeTone(n)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
