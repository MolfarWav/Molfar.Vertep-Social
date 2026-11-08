// The model picker used in the real app: a button that opens a searchable list, grouped by provider.
// (The design preview keeps the plain select in controls.tsx.) The list is drawn with position: fixed
// because the settings cards clip their content.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "@/i18n/index";
import type { Opt } from "./controls";

const GAP = 4;
const MAX_H = 380;

export function ModelPick({ value, options, onChange, labelledBy }: { value: string; options: Opt<string>[]; onChange: (v: string) => void; labelledBy: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  // place the list under the button, or above it when there is more room there
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const place = () => {
      const r = root.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - GAP - 8;
      const above = r.top - GAP - 8;
      const phone = window.innerWidth < 600;
      const width = phone ? window.innerWidth - 24 : Math.max(r.width, 340);
      const left = phone ? 12 : Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      if (below >= 240 || below >= above) setBox({ left, width, top: r.bottom + GAP, maxH: Math.min(MAX_H, below) });
      else setBox({ left, width, bottom: window.innerHeight - r.top + GAP, maxH: Math.min(MAX_H, above) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const el = e.target as Node;
      if (!root.current?.contains(el) && !list.current?.contains(el)) close();
    };
    // a scroll outside the list moves the button away from it
    const scroll = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.value === "" ? false : `${o.label} ${o.sub ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // keep the first appearance order of the groups; options with no group come first
  const groups = useMemo(() => {
    const out: { name: string; items: Opt<string>[] }[] = [];
    for (const o of shown) {
      const name = o.group ?? "";
      let g = out.find((x) => x.name === name);
      if (!g) out.push((g = { name, items: [] }));
      g.items.push(o);
    }
    return out;
  }, [shown]);

  const pick = (v: string) => {
    onChange(v);
    close();
    root.current?.querySelector("button")?.focus();
  };

  const items = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button.opt") ?? []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      root.current?.querySelector("button")?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Enter" && at === -1) {
      // Enter in the search box takes the first match
      const first = shown.find((o) => o.value !== "") ?? shown[0];
      if (first) pick(first.value);
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? Math.min(all.length - 1, at + 1) : at - 1;
    if (next < 0) (list.current?.querySelector("input") as HTMLInputElement | null)?.focus();
    else all[next]?.focus();
  };

  return (
    <div className="sel-wrap" ref={root}>
      <button type="button" className="sel pickbtn" aria-labelledby={labelledBy} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => (open ? close() : setOpen(true))}>
        <span className="pickval">{current?.label ?? value}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && box && (
        <div
          ref={list}
          id={listId}
          className="pickpop"
          style={{ left: box.left, width: box.width, top: box.top, bottom: box.bottom, maxHeight: box.maxH }}
          onKeyDown={onKey}
        >
          <input
            className="picksearch"
            type="search"
            autoFocus
            value={query}
            placeholder={t("settings.model.search")}
            aria-label={t("settings.model.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picklist" role="listbox" aria-labelledby={labelledBy}>
            {groups.map((g) => (
              <div key={g.name} role="group" aria-label={g.name || undefined}>
                {g.name && <div className="pickgrp">{g.name}</div>}
                {g.items.map((o) => (
                  <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={`opt${o.value === value ? " on" : ""}`} onClick={() => pick(o.value)}>
                    <span className="optl">{o.label}</span>
                    {o.sub && <span className="opts">{o.sub}</span>}
                  </button>
                ))}
              </div>
            ))}
            {shown.length === 0 && <div className="pickno">{t("settings.model.none")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
