// The modal dialog the Profiles screen uses: import, import progress, the
// update diff, the unsaved-changes question, and the new-profile flow. `sheet`
// makes it a bottom sheet (phone). Rendered into <body> (in a
// layer scoped to .s-profiles) so it covers the whole app, shell bar included.
// Focus moves in on open and goes back to the opener on close; Escape closes;
// Tab stays inside the dialog.
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, width = 620, sheet = false, onClose, children }: { title: ReactNode; width?: number; sheet?: boolean; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (box.current?.querySelector<HTMLElement>(FOCUSABLE) ?? box.current)?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close.current();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className={`s-profiles pf-layer${sheet ? " sheet" : ""}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`pf-dlg${sheet ? " sheet" : ""}`}
        style={{ width: sheet ? "100%" : `min(${width}px, 100%)` }}
        ref={box}
        onKeyDown={onKey}
        tabIndex={-1}
      >
        <div className="pf-head" id={id}>{title}</div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
