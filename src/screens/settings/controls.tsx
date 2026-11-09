import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "@/i18n/index";
import { TIME_OPTIONS } from "@/mock/settings";

export interface Opt<T extends string> {
  value: T;
  label: string;
  /** Picker only: the group heading (the provider) and the small line under the label (the model id). */
  group?: string;
  sub?: string;
}

/** A label row: title, optional hint, and the control. The control gets the id of the title. */
export function Row({ title, hint, className = "", children }: { title: string; hint?: string; className?: string; children: (labelId: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`ln ${className}`.trim()}>
      <div className="t">
        <b id={id}>{title}</b>
        {hint && <span className="k">{hint}</span>}
      </div>
      {children(id)}
    </div>
  );
}

/** role="switch": a button, so Space and Enter work. Its name comes from the title. */
export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      className={`sw${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}

/** role="radiogroup" with roving focus: arrows, Home and End move and select. */
export function Segmented<T extends string>({ options, value, onChange, labelledBy }: { options: Opt<T>[]; value: T; onChange: (v: T) => void; labelledBy: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (i: number) => {
    const next = options[i];
    onChange(next.value);
    refs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = options.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: i === last ? 0 : i + 1,
      ArrowDown: i === last ? 0 : i + 1,
      ArrowLeft: i === 0 ? last : i - 1,
      ArrowUp: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    };
    if (e.key in keys) {
      e.preventDefault();
      pick(keys[e.key]);
    }
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="seg">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** − value + with a clamped range. The value is an output, so screen readers hear the change. */
export function Stepper({ value, min, max, onChange, name, step = 1 }: { value: number; min: number; max: number; onChange: (v: number) => void; name: string; step?: number }) {
  const t = useT();
  return (
    <div className="stp" role="group" aria-label={name}>
      <button type="button" className="b" aria-label={t("settings.stepper.less", { name })} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <output className="v" aria-live="polite">
        {value}
      </output>
      <button type="button" className="b" aria-label={t("settings.stepper.more", { name })} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

/** A select drawn as the board's model row. Native, so it works with the keyboard and on phones. */
export function Pick<T extends string>({ value, options, onChange, labelledBy }: { value: T; options: Opt<T>[]; onChange: (v: T) => void; labelledBy: string }) {
  return (
    <div className="sel">
      <select aria-labelledby={labelledBy} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true">▾</span>
    </div>
  );
}

/** Quiet hours as two time boxes with a dash between them, drawn like the board's stepper. */
export function TimeRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const t = useT();
  return (
    <div className="stp time">
      <select className="tm first" aria-label={t("settings.quiet.from")} value={from} onChange={(e) => onFrom(e.target.value)}>
        {TIME_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <span className="b" aria-hidden="true">
        –
      </span>
      <select className="tm last" aria-label={t("settings.quiet.to")} value={to} onChange={(e) => onTo(e.target.value)}>
        {TIME_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A range input drawn as the board's slider. `--stop` paints the filled part up to the thumb centre. */
export function Slider({ value, min, max, step, onChange, labelledBy, valueText }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; labelledBy: string; valueText: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  const style = { "--stop": `calc(11px + (100% - 22px) * ${pct / 100})` } as CSSProperties;
  return (
    <input
      type="range"
      className="sl-in"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-labelledby={labelledBy}
      aria-valuetext={valueText}
      style={style}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
