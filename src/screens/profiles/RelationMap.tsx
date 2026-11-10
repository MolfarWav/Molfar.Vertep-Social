// The relationship map's picture: people on a ring, one line per pair (see map-model.ts for what a line means). A line's look carries the
// meaning twice, not by colour alone: romance is pink with a heart, rivalry or being at odds is red and dashed, family is a double line.
// Pick a person and their lines light up while the rest fade. Every person is a button (Enter or Space picks, arrows walk the ring, Escape
// puts the choice down); the list view is the text version of the same thing.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "@/i18n/index";
import { crowd, neighboursOf, ringPoints, type Edge, type GNode } from "./map-model";

export interface MapPerson extends GNode {
  hue: number;
  picture?: string;
}

const NAME_ROOM = 30;

const heart = (x: number, y: number) => `M${x} ${y + 4.5} C${x - 8} ${y - 1} ${x - 4.5} ${y - 7} ${x} ${y - 3} C${x + 4.5} ${y - 7} ${x + 8} ${y - 1} ${x} ${y + 4.5}Z`;

export function RelationMap({ people, edges, order, selected, onSelect, phone }: { people: MapPerson[]; edges: Edge[]; order: string[]; selected: string | null; onSelect: (key: string | null) => void; phone: boolean }) {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(phone ? 360 : 640);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const c = crowd(people.length);
  const height = phone ? Math.min(Math.round(width * 1.02), 560) : Math.max(380, Math.min(Math.round(width * 0.62), 600));
  const pts = ringPoints(order.length, width, height, c.size / 2 + NAME_ROOM + 4);
  const at = new Map(order.map((k, i) => [k, pts[i]]));
  const by = new Map(people.map((p) => [p.key, p]));
  const near = new Set(selected ? [selected, ...neighboursOf(selected, edges)] : []);
  const count = (k: string) => edges.filter((e) => e.a === k || e.b === k).length;
  const [hover, setHover] = useState<string | null>(null);

  const walk = (i: number, step: number) => {
    const k = order[(i + step + order.length) % order.length];
    nodeRefs.current.get(k)?.focus();
  };
  const onKey = (e: KeyboardEvent<SVGGElement>, key: string, i: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(selected === key ? null : key);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      walk(i, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      walk(i, -1);
    }
  };

  return (
    <div ref={wrap} className="pm-wrap" onKeyDown={(e) => e.key === "Escape" && selected && onSelect(null)}>
      <svg className="pm" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t("profiles.map.aria")} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
        {edges.map((e) => {
          const p = at.get(e.a);
          const q = at.get(e.b);
          if (!p || !q) return null;
          const lit = selected ? e.a === selected || e.b === selected : true;
          const w = 1 + e.weight * 0.5;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * 1.6;
          const ny = (dx / len) * 1.6;
          const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          return (
            <g key={e.a + e.b} className={`pm-e pm-e-${e.kind}${selected ? (lit ? " lit" : " dim") : ""}`}>
              {e.kind === "family" ? (
                <>
                  <line x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} strokeWidth={Math.max(1, w - 0.5)} />
                  <line x1={p.x - nx} y1={p.y - ny} x2={q.x - nx} y2={q.y - ny} strokeWidth={Math.max(1, w - 0.5)} />
                </>
              ) : (
                <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={w} />
              )}
              {e.kind === "romance" && <path className="pm-heart" d={heart(mid.x, mid.y)} />}
            </g>
          );
        })}
        {order.map((k, i) => {
          const p = by.get(k);
          const pt = at.get(k);
          if (!p || !pt) return null;
          const half = c.size / 2;
          const isSel = selected === k;
          const showName = c.allNames || isSel || near.has(k) || hover === k;
          const n = count(k);
          const clip = "pm-clip-" + i;
          return (
            <g
              key={k}
              ref={(el) => {
                if (el) nodeRefs.current.set(k, el);
                else nodeRefs.current.delete(k);
              }}
              className={`pm-n${isSel ? " sel" : ""}${selected && !near.has(k) ? " dim" : ""}${p.kind === "user" ? " you" : ""}`}
              transform={`translate(${pt.x} ${pt.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              aria-label={t("profiles.map.node", { name: p.name, n })}
              onClick={() => onSelect(isSel ? null : k)}
              onKeyDown={(e) => onKey(e, k, i)}
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover((h) => (h === k ? null : h))}
            >
              <title>{p.name}</title>
              <rect className="pm-hit" x={-half - 8} y={-half - 8} width={c.size + 16} height={c.size + 16} rx={12} />
              <clipPath id={clip}>
                <rect x={-half} y={-half} width={c.size} height={c.size} rx={8} />
              </clipPath>
              <rect className="pm-av" x={-half} y={-half} width={c.size} height={c.size} rx={8} style={{ fill: `hsl(${p.hue} 40% 32%)` }} />
              {p.picture ? (
                <image href={p.picture} x={-half} y={-half} width={c.size} height={c.size} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <text className="pm-ini" y={1} textAnchor="middle" dominantBaseline="central" style={{ fontSize: Math.round(c.size * 0.44) }}>
                  {p.name.trim().slice(0, 1).toUpperCase()}
                </text>
              )}
              <rect className="pm-ring" x={-half - 2} y={-half - 2} width={c.size + 4} height={c.size + 4} rx={10} />
              {showName && (
                <text className="pm-name" y={half + 16} textAnchor="middle">
                  {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
                  {p.kind === "user" ? " · " + t("profiles.people.you") : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
