// A small action menu (the "⋯" button): a popup list of buttons. Closes on
// Escape, on a choice and on a click outside; focus goes back to the trigger.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface MenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function ActionMenu({ label, items, trigger, className }: { label: string; items: MenuItem[]; trigger: ReactNode; className: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className="menu-wrap" ref={root}>
      <button
        ref={btn}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className="menu" onKeyDown={onKey}>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
