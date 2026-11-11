// The person picker (#369): one place to choose who to add to a character's list. A dialog on a desktop and a bottom sheet on a phone, with a search
// box, the avatar and a line about each person (two "Eva"s are told apart by it), and groups: people already in the list, the other characters,
// the user's personas. In "relative" mode the family comes first (a tap opens that person, no questions) and a new relative is asked for the kind of
// tie once; the answer is kept as an ordinary tie, so the next time they sit in the family group.
import { useState } from "react";
import { useT } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { Dialog } from "../dialog";
import { Gl } from "../glyphs";
import { chipHue } from "../ui";
import { TIE_GROUPS, type Candidate, type Level, type Person, type TieType } from "../people-api";
import { useTieWord } from "./RelationEditor";

export interface Who {
  key: string;
  name: string;
  kind: "character" | "user";
  romance: boolean;
}

interface Row extends Who {
  /** The line under the name: what tells two people of one name apart. */
  line: string;
  person?: Person;
  cand?: Candidate;
}

const FAMILY = TIE_GROUPS.family as readonly string[];
export const familyTies = (p: Person) => (p.ties ?? []).filter((x) => FAMILY.includes(x.type));

export function PersonPicker({ mode, name, people, candidates, sheet, onClose, onOpen, onAdd, onRelative }: {
  mode: "person" | "relative";
  name: string;
  people: Person[];
  candidates: Candidate[];
  sheet: boolean;
  onClose: () => void;
  onOpen: (key: string) => void;
  onAdd: (c: Candidate) => void;
  onRelative: (who: Who, type: TieType) => void;
}) {
  const t = useT();
  const word = useTieWord();
  const [q, setQ] = useState("");
  const [who, setWho] = useState<Who | null>(null);
  const levelName = (l: Level) => t(("profiles.people.level." + l) as never);
  const rel = mode === "relative";

  const have: Row[] = people.map((p) => ({ key: p.key, name: p.name, kind: p.kind, romance: p.romance === true, line: levelName(p.level?.id ?? "stranger"), person: p }));
  const cands: Row[] = candidates.map((c) => ({ key: c.key, name: c.name, kind: c.kind, romance: c.romance, line: c.about || t(c.kind === "user" ? "profiles.people.you" : "profiles.people.character"), cand: c }));
  const needle = q.trim().toLowerCase();
  const fits = (r: Row) => !needle || r.name.toLowerCase().includes(needle) || r.line.toLowerCase().includes(needle);
  const family = rel ? have.filter((r) => r.person && familyTies(r.person).length > 0 && fits(r)) : [];
  const known = have.filter((r) => fits(r) && !(rel && r.person && familyTies(r.person).length > 0));
  const chars = cands.filter((r) => r.kind === "character" && fits(r));
  const users = cands.filter((r) => r.kind === "user" && fits(r));
  const nothing = family.length + known.length + chars.length + users.length === 0;

  const choose = (r: Row) => {
    if (r.person) {
      if (rel && familyTies(r.person).length === 0) setWho(r);
      else onOpen(r.key);
    } else if (r.cand) {
      if (rel) setWho(r);
      else onAdd(r.cand);
    }
  };

  const group = (title: string, rows: Row[], tone?: string) =>
    rows.length > 0 && (
      <section className="pick-group" aria-label={title}>
        <h4 className="pick-gh" style={tone ? ({ "--c": tone } as React.CSSProperties) : undefined}>{title} <span>{rows.length}</span></h4>
        {rows.map((r) => (
          <button key={r.key} type="button" className="pick-row" onClick={() => choose(r)}>
            <Avatar name={r.name} hue={chipHue(r.name)} size={32} radius={16} />
            <span className="pick-mid">
              <b>{r.name}</b>
              <span className="k">{r.line}</span>
            </span>
            {r.person && rel && familyTies(r.person).map((x) => <span key={x.type} className="chip chip-family">{word(x)}</span>)}
            {r.person && !rel && <span className="chip">{t("profiles.pick.already")}</span>}
          </button>
        ))}
      </section>
    );

  const close = <button type="button" className="pick-x" aria-label={t("profiles.picture.close")} onClick={onClose}><Gl name="x" size={18} /></button>;

  if (who) {
    return (
      <Dialog title={<><span className="pf-title">{t("profiles.pick.typeTitle", { who: who.name, name })}</span>{close}</>} width={440} sheet={sheet} onClose={onClose}>
        <div className="pf-body">
          {(TIE_GROUPS.family as readonly TieType[]).map((x) => (
            <button key={x} type="button" className="pick-row" onClick={() => onRelative(who, x)}>
              <span className="pick-ico"><Gl name="users" size={18} /></span>
              <span className="pick-mid"><b>{word({ type: x })}</b></span>
            </button>
          ))}
          <p className="k">{t("profiles.pick.typeKept", { who: who.name })}</p>
          <button type="button" className="btn" onClick={() => setWho(null)}>{t("profiles.pick.back")}</button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={<><span className="pf-title">{rel ? t("profiles.pick.titleRel", { name }) : t("profiles.pick.title")}</span>{close}</>} width={460} sheet={sheet} onClose={onClose}>
      <div className="pf-body pick-body">
        <div className="pick-search">
          <Gl name="search" size={16} />
          <input className="inp" aria-label={t("profiles.pick.search")} placeholder={t("profiles.pick.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {rel && !needle && family.length === 0 && <p className="k">{t("profiles.pick.noFamily")}</p>}
        {group(t("profiles.pick.inFamily"), family, "var(--rel-family)")}
        {rel && family.length > 0 && (known.length + chars.length + users.length > 0) && <p className="pick-more">{t("profiles.pick.addMore")}</p>}
        {group(rel ? t("profiles.pick.notFamily") : t("profiles.pick.known"), known)}
        {group(t("profiles.pick.chars"), chars)}
        {group(t("profiles.pick.users"), users)}
        {nothing && <p className="k">{t("profiles.pick.none")}</p>}
      </div>
    </Dialog>
  );
}
