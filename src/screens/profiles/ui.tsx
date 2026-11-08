// Small controls the editor tabs share: fields, a segmented choice, a slider,
// a switch and a chip. Plain buttons and inputs, styled in profiles.css.
import { useId, type ReactNode } from "react";

export function Field({ label, children, wide }: { label: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`f${wide ? " f-wide" : ""}`}>
      <label htmlFor={id} className="lb">{label}</label>
      {children(id)}
    </div>
  );
}

export function Seg<T extends number | string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="seg">
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

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) {
  if (!onClick) return <span className={`chip${on ? " on" : ""}`}>{children}</span>;
  return (
    <button type="button" aria-pressed={!!on} className={`chip${on ? " on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}
