// The editor for one person's level and ties (#366), opened inside the people list. The level is a floor (the meetings may take it higher)
// unless it is pinned; family and work ties show on the other character's list too, a romantic tie belongs to this side and needs adults.
import { useState } from "react";
import { useT } from "@/i18n/index";
import { Chip, Switch } from "../ui";
import { LEVELS, TIE_GROUPS, type Follow, type Level, type RelationEdit, type Tie, type TieType } from "../people-api";

export interface EditTarget {
  key: string;
  name: string;
  kind: "character" | "user";
  /** May a romantic tie be offered for them. */
  romance: boolean;
  /** What the user set before (empty for a person not yet in the list). */
  level: Level | "";
  pinned: boolean;
  ties: Tie[];
  /** What the meetings reached, shown beside "Automatic". */
  auto?: Level;
  /** (#368) The user's say on "follows them" ("" = the rule decides) and what it comes to now. */
  follow?: Follow;
  fol?: boolean;
}

const TIES_MAX = 4;
const GROUPS = ["family", "work", "other", "romance"] as const;

/** The words for a tie: its type, or the user's own label for "other". */
export function useTieWord() {
  const t = useT();
  return (tie: Tie) => (tie.type === "other" && tie.label ? tie.label : t(("profiles.people.tie." + tie.type) as never));
}

export function RelationEditor({ target, busy, onSave, onCancel }: { target: EditTarget; busy: boolean; onSave: (edit: RelationEdit) => void; onCancel: () => void }) {
  const t = useT();
  const word = useTieWord();
  const [level, setLevel] = useState<Level | "">(target.level);
  const [pinned, setPinned] = useState(target.pinned);
  const [mirror, setMirror] = useState(false);
  const [follow, setFollow] = useState<Follow>(target.follow ?? "");
  const [ties, setTies] = useState<Tie[]>(target.ties);
  const [pick, setPick] = useState<TieType | "">("");
  const [label, setLabel] = useState("");
  const character = target.kind === "character";
  const canAdd = ties.length < TIES_MAX && pick !== "" && (pick !== "other" || label.trim() !== "");
  const addTie = () => {
    if (pick === "" || !canAdd) return;
    const tie: Tie = pick === "other" ? { type: "other", label: label.trim() } : { type: pick };
    if (!ties.some((x) => x.type === tie.type && (x.label ?? "") === (tie.label ?? ""))) setTies([...ties, tie]);
    setPick("");
    setLabel("");
  };

  return (
    <div className="life-edit rel-edit" role="group" aria-label={t("profiles.people.relFor", { name: target.name })}>
      <div className="rel-field">
        <label className="lb" htmlFor="rel-level">{t("profiles.people.level")}</label>
        <select id="rel-level" className="inp" value={level} onChange={(e) => setLevel(e.target.value as Level | "")}>
          <option value="">{target.auto ? t("profiles.people.level.autoNow", { level: t(("profiles.people.level." + target.auto) as never) }) : t("profiles.people.level.auto")}</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>{t(("profiles.people.level." + l) as never)}</option>
          ))}
        </select>
        <p className="k">{level === "" ? t("profiles.people.level.autoHint") : t("profiles.people.level.floorHint")}</p>
        {level !== "" && <Switch on={pinned} onChange={setPinned}>{t("profiles.people.pin")}</Switch>}
        {level !== "" && character && <Switch on={mirror} onChange={setMirror}>{t("profiles.people.mirror", { name: target.name })}</Switch>}
      </div>

      <div className="rel-field">
        <Switch on={follow === "yes" ? true : follow === "no" ? false : target.fol === true} onChange={(v) => setFollow(v ? "yes" : "no")}>{t("profiles.people.follows", { name: target.name })}</Switch>
        <p className="k">
          {follow === "" ? t("profiles.people.follows.auto") : t("profiles.people.follows.byYou")}
          {follow !== "" && (
            <>
              {" "}
              <button type="button" className="linkbtn rel-auto" onClick={() => setFollow("")}>{t("profiles.people.follows.back")}</button>
            </>
          )}
        </p>
      </div>

      <div className="rel-field">
        <span className="lb" id="rel-ties">{t("profiles.people.ties")}</span>
        {ties.length > 0 && (
          <div className="chips" role="list" aria-labelledby="rel-ties">
            {ties.map((x) => (
              <span key={x.type + (x.label ?? "")} role="listitem">
                <Chip on onRemove={() => setTies(ties.filter((y) => y !== x))} removeLabel={t("profiles.people.tie.remove", { tie: word(x) })}>{word(x)}</Chip>
              </span>
            ))}
          </div>
        )}
        {ties.length < TIES_MAX ? (
          <div className="rel-add">
            <select className="inp" aria-label={t("profiles.people.tie.add")} value={pick} onChange={(e) => setPick(e.target.value as TieType | "")}>
              <option value="">{t("profiles.people.tie.add")}</option>
              {GROUPS.filter((g) => g !== "romance" || target.romance).map((g) => (
                <optgroup key={g} label={t(("profiles.people.tie.group." + g) as never)}>
                  {TIE_GROUPS[g].map((x) => (
                    <option key={x} value={x}>{t(("profiles.people.tie." + x) as never)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {pick === "other" && (
              <input className="inp" aria-label={t("profiles.people.tie.label")} placeholder={t("profiles.people.tie.labelHint")} maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
            )}
            <button type="button" className="btn" disabled={!canAdd} onClick={addTie}>{t("profiles.people.tie.addBtn")}</button>
          </div>
        ) : (
          <p className="k">{t("profiles.people.tie.max")}</p>
        )}
        {character && <p className="k">{t("profiles.people.tie.mirrorHint", { name: target.name })}</p>}
        {!target.romance && <p className="k">{t("profiles.people.tie.adultHint")}</p>}
      </div>

      <div className="life-actions">
        <button type="button" className="btn cta" disabled={busy} onClick={() => onSave({ level, pinned: level !== "" && pinned, ties, mirror: level !== "" && character && mirror, follow })}>
          {t("profiles.life.save")}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{t("profiles.life.cancel")}</button>
      </div>
    </div>
  );
}

