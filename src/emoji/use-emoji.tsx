// The emoji button of a text box, and what it opens. `useEmoji` gives the host two nodes: `button` goes next to the
// box, `tray` goes right under the message bar of a phone layout (null on desktop and while closed). On desktop the
// panel is a popover drawn by the button itself.
//
//   const emoji = useEmoji({ target: boxRef, value: draft, onChange: setDraft, phone });
//   ... {emoji.button} ... {emoji.tray}
//
// The picker keeps the caret: it reads the box's selection (which a box keeps after losing focus), inserts there and
// puts the caret behind the new emoji.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/index";
import { insertAt } from "./insert";
import type { Attached } from "@/pictures/use-picture";
import { Manager } from "@/stickers/Manager";
import { refOf } from "@/stickers/model";
import { Panel } from "./Panel";

export interface EmojiOptions {
  target: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  phone: boolean;
  /** Gives the picker the sticker packs: a tap on a sticker sends it at once. Without it only custom emoji are offered. */
  onSticker?: (sticker: Attached) => void;
}

const WIDTH = 352;
const HEIGHT = 400;
const GAP = 6;

function SmileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 14.2c.9 1.5 2.2 2.3 3.8 2.3s2.9-.8 3.8-2.3" />
      <circle cx="9" cy="9.7" r=".9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.7" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function useEmoji({ target, value, onChange, phone, onSticker }: EmojiOptions): { button: ReactNode; tray: ReactNode; open: boolean } {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  const panelId = useId();

  const close = (back = false) => {
    setOpen(false);
    if (back && !phone) target.current?.focus();
  };

  // after an insert the box has the new text: put the caret behind the emoji
  useLayoutEffect(() => {
    const at = caret.current;
    const el = target.current;
    if (at === null || !el) return;
    caret.current = null;
    try {
      el.setSelectionRange(at, at);
    } catch {
      // a box type without a selection
    }
  }, [value, target]);

  const pick = (char: string, keepOpen: boolean) => {
    const el = target.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const r = insertAt(value, start, end, char);
    caret.current = r.caret;
    onChange(r.value);
    if (!phone && !keepOpen) {
      setOpen(false);
      el.focus();
    }
  };

  const sendSticker = onSticker
    ? (pack: { id: string }, item: { id: string; name: string; url: string }) => {
        onSticker({ url: item.url, alt: item.name, gen: false, sticker: refOf(pack.id, item.id) });
        setOpen(false);
      }
    : undefined;
  const manage = () => {
    setOpen(false);
    setManaging(true);
  };

  // desktop popover: above the button when there is more room there (the message bars sit at the bottom)
  useLayoutEffect(() => {
    if (!open || phone || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - GAP - 8;
      const above = r.top - GAP - 8;
      const width = Math.min(WIDTH, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      if (above >= HEIGHT || above >= below) setBox({ left, width, bottom: window.innerHeight - r.top + GAP, maxH: Math.min(HEIGHT, above) });
      else setBox({ left, width, top: r.bottom + GAP, maxH: Math.min(HEIGHT, below) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, phone]);

  useEffect(() => {
    if (!open || phone) return;
    const down = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!anchor.current?.contains(n) && !pop.current?.contains(n)) setOpen(false);
    };
    // a scroll outside the panel moves the button away from it
    const scroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, phone]);

  // a layout switch between phone and desktop closes the panel instead of leaving it in the wrong place
  useEffect(() => setOpen(false), [phone]);

  const toggle = () => {
    if (open) return close();
    // on a phone the keyboard gives way to the tray; the box keeps its caret
    if (phone) target.current?.blur();
    setOpen(true);
  };

  const button = (
    <>
      <button
        ref={anchor}
        type="button"
        className={`ib emo-btn${phone ? " p" : ""}${open ? " on" : ""}`}
        aria-label={t("emoji.open")}
        title={t("emoji.open")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <SmileIcon />
      </button>
      {open && !phone && box
        ? createPortal(
            <div ref={pop} id={panelId} className="emo-pop" style={{ left: box.left, width: box.width, top: box.top, bottom: box.bottom, maxHeight: box.maxH }}>
              <Panel mode="popover" onPick={pick} onSticker={sendSticker} onManage={manage} onClose={() => close(true)} />
            </div>,
            document.querySelector(".soc") ?? document.body,
          )
        : null}
      {managing && <Manager phone={phone} onClose={() => setManaging(false)} />}
    </>
  );
  const tray =
    open && phone ? (
      <div id={panelId} className="emo-tray">
        <Panel mode="tray" onPick={pick} onSticker={sendSticker} onManage={manage} onClose={() => close()} />
      </div>
    ) : null;
  return { button, tray, open };
}
