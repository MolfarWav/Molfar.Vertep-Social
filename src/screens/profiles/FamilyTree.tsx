// The family tree's picture and its text version (issue #366; the rules are in family-model.ts). Each family is one drawing: people as squares in
// rows by generation, a double line between spouses, one bus from parents down to their children, dotted arcs for siblings with no known parent
// and for relatives. Pick a person: the lines they are on light up and the rest fade. People are buttons (Tab goes row by row, Enter picks,
// Escape puts the choice down). The outline is the same trees as nested rows: the text version, and the phone's first view for a wide family.
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { FAMILY_NODE, type FamilyGroup, type OutlineItem } from "./family-model";
import type { MapPerson } from "./RelationMap";

const half = FAMILY_NODE / 2;

export function FamilyTree({ groups, people, selected, onSelect }: { groups: FamilyGroup[]; people: Map<string, MapPerson>; selected: string | null; onSelect: (k: string | null) => void }) {
  const t = useT();
  return (
    <div className="ft" onKeyDown={(e) => e.key === "Escape" && selected && onSelect(null)}>
      {groups.map((g) => {
        const near = new Set<string>(selected ? [selected] : []);
        if (selected) for (const l of g.lines) if (l.members.includes(selected)) for (const m of l.members) near.add(m);
        return (
          <div key={g.id} className="ft-scroll">
            <svg className="ft-svg" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="group" aria-label={t("profiles.family.group")} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
              {g.lines.map((l, i) => (
                <path key={i} className={`ft-l ft-l-${l.kind}${selected ? (l.members.includes(selected) ? " lit" : " dim") : ""}`} d={l.d} fill="none" />
              ))}
              {g.nodes.map((n, i) => {
                const p = people.get(n.key);
                if (!p) return null;
                const isSel = selected === n.key;
                const clip = `ft-clip-${g.id.replace(/[^a-z0-9]/gi, "")}-${i}`;
                return (
                  <g
                    key={n.key}
                    className={`pm-n${isSel ? " sel" : ""}${selected && !near.has(n.key) ? " dim" : ""}${p.kind === "user" ? " you" : ""}`}
                    transform={`translate(${n.x} ${n.y})`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={n.conflict ? t("profiles.family.nodeConflict", { name: p.name }) : t("profiles.family.node", { name: p.name })}
                    onClick={() => onSelect(isSel ? null : n.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(isSel ? null : n.key);
                      }
                    }}
                  >
                    <title>{p.name}</title>
                    <rect className="pm-hit" x={-half - 8} y={-half - 8} width={FAMILY_NODE + 16} height={FAMILY_NODE + 16} rx={12} />
                    <clipPath id={clip}>
                      <rect x={-half} y={-half} width={FAMILY_NODE} height={FAMILY_NODE} rx={8} />
                    </clipPath>
                    <rect className="pm-av" x={-half} y={-half} width={FAMILY_NODE} height={FAMILY_NODE} rx={8} style={{ fill: `hsl(${p.hue} 40% 32%)` }} />
                    {p.picture ? (
                      <image href={p.picture} x={-half} y={-half} width={FAMILY_NODE} height={FAMILY_NODE} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
                    ) : (
                      <text className="pm-ini" y={1} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 19 }}>
                        {p.name.trim().slice(0, 1).toUpperCase()}
                      </text>
                    )}
                    <rect className="pm-ring" x={-half - 2} y={-half - 2} width={FAMILY_NODE + 4} height={FAMILY_NODE + 4} rx={10} />
                    {n.conflict && (
                      <g className="ft-warn" transform={`translate(${half - 2} ${-half + 2})`}>
                        <circle r={8} />
                        <text textAnchor="middle" dominantBaseline="central">!</text>
                      </g>
                    )}
                    <text className="pm-name" y={half + 16} textAnchor="middle">
                      {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
                      {p.kind === "user" ? " · " + t("profiles.people.you") : ""}
                    </text>
                  </g>
                );
              })}
            </svg>
            {g.conflicts.length > 0 && <p className="k ft-conflict" role="note">{t("profiles.family.conflict", { names: [...new Set(g.conflicts.flatMap((c) => [c.a, c.b]))].map((k) => people.get(k)?.name ?? "").join(", ") })}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** The outline: parents with their children nested under them, a couple as one row, relatives beside. */
export function FamilyOutline({ groups, people, selected, onSelect }: { groups: FamilyGroup[]; people: Map<string, MapPerson>; selected: string | null; onSelect: (k: string | null) => void }) {
  const t = useT();
  const one = (k: string, side = false) => {
    const p = people.get(k);
    if (!p) return null;
    return (
      <button key={k} type="button" className={`ft-ol-p${selected === k ? " on" : ""}`} aria-pressed={selected === k} onClick={() => onSelect(selected === k ? null : k)}>
        <Avatar name={p.name} hue={p.hue} size={28} picture={p.picture} />
        <b>{p.name}</b>
        {side && <span className="k">{t("profiles.family.relative")}</span>}
        {p.kind === "user" && <span className="k">{t("profiles.people.you")}</span>}
      </button>
    );
  };
  const rows = (items: OutlineItem[]) => (
    <ul className="ft-ol">
      {items.map((it) => (
        <li key={it.members.join("|")}>
          <div className="ft-ol-row">
            {it.members.map((m) => one(m))}
            {it.side.map((m) => one(m, true))}
          </div>
          {it.children.length > 0 && rows(it.children)}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ft-outline">
      {groups.map((g) => (
        <section key={g.id} className="ft-ol-group">
          {rows(g.outline)}
          {g.conflicts.length > 0 && <p className="k ft-conflict" role="note">{t("profiles.family.conflict", { names: [...new Set(g.conflicts.flatMap((c) => [c.a, c.b]))].map((k) => people.get(k)?.name ?? "").join(", ") })}</p>}
        </section>
      ))}
    </div>
  );
}
