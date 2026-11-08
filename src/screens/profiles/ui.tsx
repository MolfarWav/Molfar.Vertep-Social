// Small controls the editor tabs share: fields, a segmented choice, a slider,
// a switch and a chip. Plain buttons and inputs, styled in profiles.css.
import { useId, useState, type ReactNode } from "react";
import { PREVIEW } from "@/lib/api";

export function Field({ label, children, wide }: { label: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`f${wide ? " f-wide" : ""}`}>
      <label htmlFor={id} className="lb">{label}</label>
      {children(id)}
    </div>
  );
}

export function Seg<T extends number | string>({ label, options, value, onChange, full }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`seg${full ? " full" : ""}`}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A 0..100 slider with a label at each end, drawn like the board (track, fill, knob). */
export function Slider({ label, value, onChange, left, right, middle }: { label: string; value: number; onChange: (v: number) => void; left: string; right: string; middle?: string }) {
  return (
    <div className="slider">
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-label={label}
        className="slide"
        style={{ background: `linear-gradient(to right, var(--accent) 0 ${value}%, var(--line) ${value}% 100%)` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="sll">
        <span>{left}</span>
        {middle && <span>{middle}</span>}
        <span>{right}</span>
      </div>
    </div>
  );
}

export function Switch({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="tg" onClick={() => onChange(!on)}>
      <span className={`sw${on ? " on" : ""}`} aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

export function Chip({ on, onClick, onRemove, removeLabel, children }: { on?: boolean; onClick?: () => void; onRemove?: () => void; removeLabel?: string; children: ReactNode }) {
  const chip = onClick ? (
    <button type="button" aria-pressed={!!on} className={`chip${on ? " on" : ""}`} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={`chip${on ? " on" : ""}`}>{children}</span>
  );
  // the approved boards draw plain chips: the remove button is the app's only
  if (!onRemove || PREVIEW) return chip;
  return (
    <span className="chip-rm">
      {chip}
      <button type="button" className="chip-x" aria-label={removeLabel} onClick={onRemove}>×</button>
    </span>
  );
}

/** "+ add": a chip that turns into a one-line input; Enter or leaving the field adds the text, Escape drops it. */
export function AddChip({ label, inputLabel, onAdd }: { label: string; inputLabel: string; onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const close = (keep: boolean) => {
    const text = value.trim();
    setValue("");
    setOpen(false);
    if (keep && text) onAdd(text);
  };
  if (!open) return <button type="button" className="chip" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <input
      className="inp chip-in"
      aria-label={inputLabel}
      value={value}
      maxLength={40}
      // biome-ignore lint/a11y/noAutofocus: the chip was just opened by the user to type into
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          close(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setValue("");
          close(false);
        }
      }}
    />
  );
}

/** A list of short texts with one more added, no duplicates, at most `max` entries. */
export function withItem(list: string[], text: string, max = 12): string[] {
  const t = text.trim();
  return !t || list.includes(t) || list.length >= max ? list : [...list, t];
}
