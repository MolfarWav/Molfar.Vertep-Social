// "People she has met": under the diary on the Life tab. The Life plugin counts who the character ran into on the forum and in the
// messenger (seen, spoke to her, she answered) and words an impression of them once a day; the forum and the messenger bring that
// into the prompt. The user may reword an impression, forget a person or everyone. Below: the other characters that remember her.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { forgetPeople, loadPeople, saveNote, saveRelation, type Candidate, type KnownBy, type Mark, type Person, type RelationEdit } from "../people-api";
import { RelationEditor, useTieWord, type EditTarget } from "./RelationEditor";

/** The band of a feeling score, as the Life plugin's `feelWord` names it: "" between -3 and 3. */
const feelBand = (feel?: number): "" | "close" | "warm" | "cold" | "hostile" => {
  const f = feel ?? 0;
  return f >= 7 ? "close" : f >= 3 ? "warm" : f <= -7 ? "hostile" : f <= -3 ? "cold" : "";
};

export function PeopleSection({ profileId }: { profileId: string }) {
  const t = useT();
  const lang = currentLang();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [knownBy, setKnownBy] = useState<KnownBy[]>([]);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [askAll, setAskAll] = useState(false);
  const [edit, setEdit] = useState<{ key: string; text: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [rel, setRel] = useState<EditTarget | null>(null);
  const tieWord = useTieWord();
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setPeople(null);
    setFailed("");
    setEdit(null);
    setRel(null);
    loadPeople(profileId)
      .then((v) => {
        if (!alive.current) return;
        setPeople(v.people);
        setKnownBy(v.knownBy ?? []);
        setCandidates(v.candidates ?? []);
      })
      .catch((e: unknown) => alive.current && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive.current = false;
    };
  }, [profileId]);

  const run = useCallback(async (job: () => Promise<{ people: Person[]; candidates?: Candidate[] }>) => {
    setBusy(true);
    try {
      const v = await job();
      if (alive.current) {
        setPeople(v.people);
        if (v.candidates) setCandidates(v.candidates);
        setAskAll(false);
        setEdit(null);
        setRel(null);
      }
    } catch (e) {
      if (alive.current) setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const day = (ms: number) => new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "long" });
  const levelName = (l: string) => t(("profiles.people.level." + l) as never);
  const markText = (m: Mark) =>
    m.k === "level"
      ? t(m.up ? "profiles.people.mark.up" : "profiles.people.mark.down", { level: levelName(m.v) })
      : m.k === "feel"
        ? t(("profiles.people.mark.feel." + m.v) as never)
        : t("profiles.people.mark.tie", { tie: tieWord({ type: m.v as never }) });
  const relOf = (p: Person): EditTarget => ({ key: p.key, name: p.name, kind: p.kind, romance: p.romance === true, level: p.tier ?? "", pinned: p.pinned === true, ties: p.ties ?? [], auto: p.level?.auto });
  const save = (target: EditTarget, e: RelationEdit) => run(() => saveRelation(profileId, target.key, e, target.name));

  return (
    <section className="people" aria-label={t("profiles.people.title")}>
      <h3 className="people-h">{t("profiles.people.title")}</h3>
      <p className="k">{t("profiles.people.note")}</p>
      {failed && <div className="k life-bad" role="alert">{failed}</div>}
      {candidates.length > 0 && !rel && (
        <div className="rel-addperson">
          <select
            className="inp"
            aria-label={t("profiles.people.addPerson")}
            value=""
            disabled={busy}
            onChange={(e) => {
              const c = candidates.find((x) => x.key === e.target.value);
              if (c) setRel({ key: c.key, name: c.name, kind: c.kind, romance: c.romance, level: "", pinned: false, ties: [] });
            }}
          >
            <option value="">{t("profiles.people.addPerson")}</option>
            {candidates.map((c) => (
              <option key={c.key} value={c.key}>{c.name} · {t(c.kind === "user" ? "profiles.people.you" : "profiles.people.character")}</option>
            ))}
          </select>
          <p className="k">{t("profiles.people.addHint")}</p>
        </div>
      )}
      {rel && !(people ?? []).some((p) => p.key === rel.key) && (
        <div className="life-entry">
          <div className="life-meta">
            <b>{rel.name}</b>
            <span className="life-you">{t(rel.kind === "user" ? "profiles.people.you" : "profiles.people.character")}</span>
          </div>
          <RelationEditor target={rel} busy={busy} onSave={(e) => save(rel, e)} onCancel={() => setRel(null)} />
        </div>
      )}
      {people && people.length === 0 && !failed && !rel && <p className="k">{t("profiles.people.empty")}</p>}
      <ul className="life-list">
        {(people ?? []).map((p) => (
          <li key={p.key} className="life-entry">
            <div className="life-meta">
              <b>{p.name}</b>
              <span className="life-you">{t(p.kind === "user" ? "profiles.people.you" : "profiles.people.character")}</span>
              {feelBand(p.feel) && (
                <span className={"life-you people-feel people-feel-" + feelBand(p.feel)} title={t("profiles.people.feelTip")}>
                  {t(("profiles.people.feel." + feelBand(p.feel)) as never)}
                </span>
              )}
              <span>{t("profiles.people.counts", { seen: String(p.seen), last: day(p.last) })}</span>
            </div>
            {(p.level || (p.ties ?? []).length > 0) && (
              <div className="chips">
                {p.level && (
                  <span className="chip on" title={t("profiles.people.levelTip")}>
                    {t("profiles.people.levelChip", { level: levelName(p.level.id) })}
                  </span>
                )}
                {(p.ties ?? []).map((x) => (
                  <span key={x.type + (x.label ?? "")} className={"chip" + (["crush", "dating", "partner", "ex"].includes(x.type) ? " chip-romance" : "")}>{tieWord(x)}</span>
                ))}
              </div>
            )}
            {p.level && p.level.id !== "stranger" && !p.level.manual && p.level.talks + p.level.seen > 0 && (
              <p className="k">{t("profiles.people.levelWhy", { seen: String(p.level.seen), talks: String(p.level.talks) })}</p>
            )}
            {p.level && p.level.manual && p.level.manual !== p.level.id && !p.level.pinned && (
              <p className="k">{t("profiles.people.levelGrew", { level: levelName(p.level.id), floor: levelName(p.level.manual) })}</p>
            )}
            {(p.marks ?? []).length > 0 && (
              <ul className="people-marks" aria-label={t("profiles.people.marks")}>
                {[...(p.marks ?? [])].sort((x, y) => y.at - x.at).slice(0, 3).map((m) => (
                  <li key={m.k + m.v + m.at} className="k">{markText(m)} · {day(m.at)}</li>
                ))}
              </ul>
            )}
            {p.said.length > 0 && <p className="life-text">{t("profiles.people.said", { text: p.said[p.said.length - 1].text })}</p>}
            {rel?.key === p.key ? (
              <RelationEditor target={rel} busy={busy} onSave={(e) => save(rel, e)} onCancel={() => setRel(null)} />
            ) : edit?.key === p.key ? (
              <div className="life-edit">
                <textarea className="inp inp-area" aria-label={t("profiles.people.noteLabel", { name: p.name })} value={edit.text} maxLength={160} rows={2} autoFocus onChange={(e) => setEdit({ key: p.key, text: e.target.value })} />
                <div className="life-actions">
                  <button type="button" className="btn cta" disabled={busy} onClick={() => run(() => saveNote(profileId, p.key, edit.text))}>{t("profiles.life.save")}</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setEdit(null)}>{t("profiles.life.cancel")}</button>
                </div>
              </div>
            ) : (
              <>
                {p.note && <p className="life-text people-note">{p.note}</p>}
                <div className="life-actions">
                  <button type="button" className="btn" disabled={busy} aria-label={t("profiles.people.relOne", { name: p.name })} onClick={() => { setEdit(null); setRel(relOf(p)); }}>
                    {t("profiles.people.rel")}
                  </button>
                  <button type="button" className="btn" disabled={busy} aria-label={t("profiles.people.editOne", { name: p.name })} onClick={() => { setRel(null); setEdit({ key: p.key, text: p.note }); }}>
                    {t("profiles.people.edit")}
                  </button>
                  <button type="button" className="btn" disabled={busy} aria-label={t("profiles.people.forgetOne", { name: p.name })} onClick={() => run(() => forgetPeople(profileId, p.key))}>
                    {t("profiles.people.forget")}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {people && people.length > 1 && (
        <div className="life-actions">
          {askAll ? (
            <>
              <span className="k">{t("profiles.people.forgetAllAsk")}</span>
              <button type="button" className="btn life-danger" disabled={busy} onClick={() => run(() => forgetPeople(profileId))}>{t("profiles.people.forgetAll")}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setAskAll(false)}>{t("profiles.life.keep")}</button>
            </>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setAskAll(true)}>{t("profiles.people.forgetAll")}</button>
          )}
        </div>
      )}
      {knownBy.length > 0 && (
        <>
          <h3 className="people-h">{t("profiles.people.knownBy")}</h3>
          <ul className="life-list">
            {knownBy.map((k) => (
              <li key={k.id} className="life-entry">
                <div className="life-meta">
                  <b>{k.name}</b>
                  <span>{t("profiles.people.knownBySeen", { seen: String(k.seen) })}</span>
                </div>
                {k.note && <p className="life-text people-note">{k.note}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
