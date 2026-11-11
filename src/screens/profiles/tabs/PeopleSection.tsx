// "Relationships" (#366, redesigned in #369): the people list on the left (search, groups by the seven levels, add a person or a relative, the map
// and the family tree) and the editor of the chosen person on the right (a bottom sheet on a phone). The Life plugin counts who the character ran
// into on the forum and in the messenger and words an impression of them once a day; the user sets the level, the follows and the ties, may
// reword an impression, forget a person or everyone. Below the list: the other characters that remember her.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { useIsPhone } from "@/lib/use-phone";
import { Dialog } from "../dialog";
import { Gl } from "../glyphs";
import { SectionHead } from "../sections";
import { chipHue } from "../ui";
import { loadGraph } from "../map-api";
import { followersOf } from "../map-model";
import { forgetPeople, loadPeople, saveNote, saveRelation, LEVELS, type Candidate, type KnownBy, type Level, type Mark, type Person, type RelationEdit, type TieType } from "../people-api";
import { RelationEditor, useTieWord, type EditTarget } from "./RelationEditor";
import { PersonPicker, familyTies, type Who } from "./PersonPicker";

/** The band of a feeling score, as the Life plugin's `feelWord` names it: "" between -3 and 3. */
const feelBand = (feel?: number): "" | "close" | "warm" | "cold" | "hostile" => {
  const f = feel ?? 0;
  return f >= 7 ? "close" : f >= 3 ? "warm" : f <= -7 ? "hostile" : f <= -3 ? "cold" : "";
};

/** The groups start with the closest people; the two lowest rungs start folded (the choice is kept per browser). */
const GROUPS = [...LEVELS].reverse();
const FOLD_KEY = "social.profiles.people.folded";
const readFolded = (): Record<string, boolean> => {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "null");
    if (v && typeof v === "object") return v as Record<string, boolean>;
  } catch {
    /* no storage: the defaults */
  }
  return { stranger: true, slight: true };
};

const levelOf = (p: Person): Level => p.level?.id ?? "stranger";
const lvStyle = (l: Level) => ({ "--lc": `var(--l-${l})` }) as React.CSSProperties;

/** What the editor needs to know about a person who is in the list or only picked to be added. */
const targetOf = (p: Person): EditTarget => ({ key: p.key, name: p.name, kind: p.kind, romance: p.romance === true, level: p.tier ?? "", pinned: p.pinned === true, ties: p.ties ?? [], auto: p.level?.auto, follow: p.follow ?? "", fol: p.fol === true });
const targetOfCandidate = (c: Candidate): EditTarget => ({ key: c.key, name: c.name, kind: c.kind, romance: c.romance, level: "", pinned: false, ties: [] });

export function PeopleSection({ profileId, name, onView }: { profileId: string; name: string; onView?: (mode: "map" | "family") => void }) {
  const t = useT();
  const lang = currentLang();
  const phone = useIsPhone();
  const tieWord = useTieWord();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [knownBy, setKnownBy] = useState<KnownBy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [askAll, setAskAll] = useState(false);
  const [q, setQ] = useState("");
  const [folded, setFolded] = useState(readFolded);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<"person" | "relative" | null>(null);
  const [editNote, setEditNote] = useState<string | null>(null);
  // a counter in the editor's key: "Cancel" puts the fields back as they were saved
  const [round, setRound] = useState(0);
  // (#368) how many people follow this character, from the map's data; null until it is known
  const [followers, setFollowers] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setPeople(null);
    setFailed("");
    setSel(null);
    setDraft(null);
    setOpen(false);
    setEditNote(null);
    loadPeople(profileId)
      .then((v) => {
        if (!alive.current) return;
        setPeople(v.people);
        setKnownBy(v.knownBy ?? []);
        setCandidates(v.candidates ?? []);
      })
      .catch((e: unknown) => alive.current && setFailed(e instanceof Error ? e.message : String(e)));
    setFollowers(null);
    loadGraph()
      .then((g) => alive.current && setFollowers(followersOf("c:" + profileId, g.links)))
      .catch(() => undefined);
    return () => {
      alive.current = false;
    };
  }, [profileId]);

  const run = useCallback(async (job: () => Promise<{ people: Person[]; candidates?: Candidate[] }>, keep?: string) => {
    setBusy(true);
    try {
      const v = await job();
      if (alive.current) {
        setPeople(v.people);
        if (v.candidates) setCandidates(v.candidates);
        setAskAll(false);
        setEditNote(null);
        setDraft(null);
        setRound((n) => n + 1);
        if (keep !== undefined) setSel(v.people.some((p) => p.key === keep) ? keep : null);
      }
    } catch (e) {
      if (alive.current) setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const list = people ?? [];
  const needle = q.trim().toLowerCase();
  const shown = list.filter((p) => !needle || p.name.toLowerCase().includes(needle));
  const byGroup = (l: Level) => shown.filter((p) => levelOf(p) === l);
  const selPerson = list.find((p) => p.key === sel) ?? null;
  const target: EditTarget | null = selPerson ? targetOf(selPerson) : draft && draft.key === sel ? targetOfCandidate(draft) : null;

  // on a wide screen the editor is always there: the closest person is open at first
  useEffect(() => {
    if (!phone && sel === null && !draft && list.length > 0) setSel([...list].sort((a, b) => LEVELS.indexOf(levelOf(b)) - LEVELS.indexOf(levelOf(a)))[0]!.key);
  }, [phone, sel, draft, list]);

  const day = (ms: number) => new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "long" });
  const levelName = (l: string) => t(("profiles.people.level." + l) as never);
  const markText = (m: Mark) =>
    m.k === "level"
      ? t(m.up ? "profiles.people.mark.up" : "profiles.people.mark.down", { level: levelName(m.v) })
      : m.k === "feel"
        ? t(("profiles.people.mark.feel." + m.v) as never)
        : m.k === "follow"
          ? t("profiles.people.mark.follow")
          : t("profiles.people.mark.tie", { tie: tieWord({ type: m.v as never }) });
  const feelText = (p: Person) => {
    const b = feelBand(p.feel);
    return b ? t(("profiles.people.feel." + b) as never) : "";
  };

  const pick = (key: string) => {
    setSel(key);
    setDraft(null);
    setEditNote(null);
    setRound((n) => n + 1);
    if (phone) setOpen(true);
  };
  const toggleFold = (l: string) =>
    setFolded((f) => {
      const next = { ...f, [l]: !f[l] };
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(next));
      } catch {
        /* the choice is simply not kept */
      }
      return next;
    });

  // an added relative is saved at once as an ordinary tie: the picker's second step is the whole form
  const addRelative = (who: Who, type: TieType) => {
    setPicker(null);
    const had = list.find((p) => p.key === who.key);
    const ties = [...(had?.ties ?? []).filter((x) => x.type !== type), { type }];
    void run(() => saveRelation(profileId, who.key, { level: had?.tier ?? "", pinned: had?.pinned === true, ties, follow: had?.follow ?? "" }, who.name), who.key).then(() => phone && setOpen(true));
  };
  const addPerson = (c: Candidate) => {
    setPicker(null);
    setDraft(c);
    setSel(c.key);
    setEditNote(null);
    setRound((n) => n + 1);
    if (phone) setOpen(true);
  };
  const save = (e: EditTarget, edit: RelationEdit) => run(() => saveRelation(profileId, e.key, edit, e.name), e.key).then(() => phone && setOpen(false));

  const row = (p: Person) => {
    const l = levelOf(p);
    const feel = feelText(p);
    const tie = (p.ties ?? [])[0];
    return (
      <li key={p.key}>
        <button type="button" className={`prow${p.key === sel && !phone ? " on" : ""}`} style={lvStyle(l)} aria-current={p.key === sel ? "true" : undefined} onClick={() => pick(p.key)}>
          <span className="prow-av"><Avatar name={p.name} hue={chipHue(p.name)} size={32} radius={16} /></span>
          <span className="prow-mid">
            <b>{p.name}</b>
            <span className="k">{t("profiles.people.counts", { seen: String(p.seen), last: day(p.last) })}</span>
          </span>
          {feel && <span className={`prow-feel people-feel-${feelBand(p.feel)}`} title={t("profiles.people.feelTip")}>{feel}</span>}
          {p.fol && <span className="prow-ic" title={t("profiles.people.followsChip")}><Gl name="eye" size={16} /><span className="sr">{t("profiles.people.followsChip")}</span></span>}
          {tie && <span className="prow-ic" title={tieWord(tie)}><Gl name={tie.type === "other" ? "tag" : familyTies(p).length ? "users" : ["crush", "dating", "partner", "ex"].includes(tie.type) ? "heart" : "brief"} size={16} /><span className="sr">{tieWord(tie)}</span></span>}
          {phone && <Gl name="chevR" size={16} />}
        </button>
      </li>
    );
  };

  const detail = (
    <PersonDetail
      key={`${sel}:${round}`}
      target={target}
      person={selPerson}
      busy={busy}
      editNote={editNote}
      name={name}
      onEditNote={setEditNote}
      onSaveNote={(text) => selPerson && run(() => saveNote(profileId, selPerson.key, text))}
      onSave={save}
      onCancel={() => {
        setDraft(null);
        setEditNote(null);
        if (draft) setSel(null);
        setRound((n) => n + 1);
        if (phone) setOpen(false);
      }}
      onForget={() => selPerson && run(() => forgetPeople(profileId, selPerson.key), selPerson.key).then(() => phone && setOpen(false))}
      onAddRelative={() => target && setPicker("relative")}
      day={day}
      markText={markText}
      levelName={levelName}
      feel={selPerson ? feelText(selPerson) : ""}
    />
  );

  return (
    <div className="relsplit">
      <div className="rellist">
        <div className="rel-search">
          <Gl name="search" size={16} />
          <input className="inp" aria-label={t("profiles.rel.search")} placeholder={t("profiles.rel.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rel-actions">
          <button type="button" className="btn tonal" disabled={busy} aria-label={t("profiles.rel.addPersonAria")} onClick={() => setPicker("person")}><Gl name="plus" size={15} />{t("profiles.rel.person")}</button>
          <button type="button" className="btn" disabled={busy} aria-label={t("profiles.rel.addRelativeAria")} onClick={() => setPicker("relative")}><Gl name="users" size={15} />{t("profiles.rel.relative")}</button>
        </div>
        {onView && (
          <div className="rel-actions">
            <button type="button" className="btn" onClick={() => onView("map")}><Gl name="map" size={15} />{t("profiles.rel.map")}</button>
            <button type="button" className="btn" onClick={() => onView("family")}><Gl name="tree" size={15} />{t("profiles.rel.tree")}</button>
          </div>
        )}
        <p className="k rel-steps">
          {t("profiles.rel.steps")}
          {list.length > 0 && <> {t("profiles.people.followCounts", { follows: String(list.filter((p) => p.fol).length) })}{followers !== null && " · " + t("profiles.people.followedBy", { n: String(followers) })}</>}
        </p>
        {failed && <div className="k life-bad" role="alert">{failed}</div>}
        {people === null && !failed && <p className="k">{t("profiles.life.loading")}</p>}
        {people && list.length === 0 && !failed && <p className="k">{t("profiles.people.empty")}</p>}
        {people && list.length > 0 && shown.length === 0 && <p className="k">{t("profiles.rel.noMatch", { q })}</p>}
        {GROUPS.map((l) => {
          const rows = byGroup(l);
          if (rows.length === 0) return null;
          const fold = folded[l] === true && !needle;
          return (
            <section key={l} className="pgroup" style={lvStyle(l)} aria-label={t(("profiles.people.level." + l) as never)}>
              <button type="button" className="pgroup-h" aria-expanded={!fold} onClick={() => toggleFold(l)}>
                <Gl name={fold ? "chevR" : "chevD"} size={16} />
                <span className="pgroup-t">{t(("profiles.people.level." + l) as never)}</span>
                <span className="pgroup-n">{rows.length}</span>
              </button>
              {!fold && <ul className="plist">{rows.map(row)}</ul>}
            </section>
          );
        })}
        {list.length > 1 && (
          <div className="life-actions">
            {askAll ? (
              <>
                <span className="k">{t("profiles.people.forgetAllAsk")}</span>
                <button type="button" className="btn life-danger" disabled={busy} onClick={() => run(() => forgetPeople(profileId), "")}>{t("profiles.people.forgetAll")}</button>
                <button type="button" className="btn" disabled={busy} onClick={() => setAskAll(false)}>{t("profiles.life.keep")}</button>
              </>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => setAskAll(true)}>{t("profiles.people.forgetAll")}</button>
            )}
          </div>
        )}
        {knownBy.length > 0 && (
          <section className="pgroup" aria-label={t("profiles.people.knownBy")}>
            <h4 className="pgroup-h static"><span className="pgroup-t">{t("profiles.people.knownBy")}</span><span className="pgroup-n">{knownBy.length}</span></h4>
            <ul className="plist">
              {knownBy.map((k) => (
                <li key={k.id} className="prow static">
                  <span className="prow-av"><Avatar name={k.name} hue={chipHue(k.name)} size={32} radius={16} /></span>
                  <span className="prow-mid">
                    <b>{k.name}</b>
                    <span className="k">{t("profiles.people.knownBySeen", { seen: String(k.seen) })}</span>
                    {k.note && <span className="k people-note">{k.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {!phone && <div className="reldetail">{detail}</div>}
      {phone && open && target && (
        <Dialog title={<><span className="pf-title">{target.name}</span><button type="button" className="pick-x" aria-label={t("profiles.picture.close")} onClick={() => setOpen(false)}><Gl name="x" size={18} /></button></>} sheet onClose={() => setOpen(false)}>
          <div className="pf-body reldetail-sheet">{detail}</div>
        </Dialog>
      )}
      {picker && (
        <PersonPicker
          mode={picker}
          name={name}
          people={list}
          candidates={candidates}
          sheet={phone}
          onClose={() => setPicker(null)}
          onOpen={(key) => {
            setPicker(null);
            pick(key);
          }}
          onAdd={addPerson}
          onRelative={addRelative}
        />
      )}
    </div>
  );
}

function PersonDetail({ target, person, busy, editNote, name, onEditNote, onSaveNote, onSave, onCancel, onForget, onAddRelative, day, markText, levelName, feel }: {
  target: EditTarget | null;
  person: Person | null;
  busy: boolean;
  editNote: string | null;
  name: string;
  onEditNote: (v: string | null) => void;
  onSaveNote: (text: string) => void;
  onSave: (e: EditTarget, edit: RelationEdit) => void;
  onCancel: () => void;
  onForget: () => void;
  onAddRelative: () => void;
  day: (ms: number) => string;
  markText: (m: Mark) => string;
  levelName: (l: string) => string;
  feel: string;
}) {
  const t = useT();
  if (!target) {
    return (
      <div className="rel-none">
        <Gl name="heart" size={32} />
        <h3 className="empty-h">{t("profiles.rel.pickTitle")}</h3>
        <p className="k">{t("profiles.relations.intro", { name })}</p>
      </div>
    );
  }
  const l = person ? levelOf(person) : "stranger";
  const marks = [...(person?.marks ?? [])].sort((x, y) => y.at - x.at).slice(0, 3);
  const lastSaid = person && person.said.length > 0 ? person.said[person.said.length - 1] : null;
  const lv = person?.level;
  return (
    <div className="pdetail">
      <header className="pd-head">
        <span className="pd-av" style={lvStyle(l)}><Avatar name={target.name} hue={chipHue(target.name)} size={56} radius={28} /></span>
        <div className="pd-title">
          <h3 className="pd-name">{target.name}</h3>
          <div className="row-wrap">
            <span className="chip">{t(target.kind === "user" ? "profiles.people.you" : "profiles.people.character")}</span>
            {person && <span className="chip lvchip" style={lvStyle(l)}>{t("profiles.people.levelChip", { level: levelName(l) })}</span>}
            {feel && <span className={`chip people-feel-${feelBand(person?.feel)}`} title={t("profiles.people.feelTip")}>{feel}</span>}
          </div>
          {person && <span className="k">{t("profiles.people.counts", { seen: String(person.seen), last: day(person.last) })}</span>}
        </div>
      </header>
      {lastSaid && <p className="k pd-said">{t("profiles.people.said", { text: lastSaid.text })}</p>}
      {!person && <p className="k">{t("profiles.people.addHint")}</p>}
      <RelationEditor
        target={target}
        busy={busy}
        onSave={(e) => onSave(target, e)}
        onCancel={onCancel}
        levelNote={
          <>
            {lv && lv.id !== "stranger" && !lv.manual && lv.talks + lv.seen > 0 && <p className="k">{t("profiles.people.levelWhy", { seen: String(lv.seen), talks: String(lv.talks) })}</p>}
            {lv && lv.manual && lv.manual !== lv.id && !lv.pinned && <p className="k">{t("profiles.people.levelGrew", { level: levelName(lv.id), floor: levelName(lv.manual) })}</p>}
          </>
        }
        extra={
          <>
            <div className="rel-field">
              <button type="button" className="chip add" onClick={onAddRelative}><Gl name="users" size={14} />{t("profiles.rel.relativeOf", { name: target.name })}</button>
            </div>
            {person && marks.length > 0 && (
              <section className="rel-field">
                <SectionHead tone="amber" icon="clock" title={t("profiles.people.marks")} />
                <ul className="people-marks">{marks.map((m) => <li key={m.k + m.v + m.at} className="k">{markText(m)} · {day(m.at)}</li>)}</ul>
              </section>
            )}
            {person && (
              <section className="rel-field">
                <SectionHead tone="violet" icon="book" title={t("profiles.people.noteHead")} />
                {editNote !== null ? (
                  <>
                    <textarea className="inp inp-area" aria-label={t("profiles.people.noteLabel", { name: target.name })} value={editNote} maxLength={160} rows={2} onChange={(e) => onEditNote(e.target.value)} />
                    <div className="life-actions">
                      <button type="button" className="btn tonal" disabled={busy} onClick={() => onSaveNote(editNote)}>{t("profiles.life.save")}</button>
                      <button type="button" className="btn" disabled={busy} onClick={() => onEditNote(null)}>{t("profiles.life.cancel")}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="life-text people-note">{person.note || t("profiles.rel.noNote")}</p>
                    <div className="life-actions">
                      <button type="button" className="btn" disabled={busy} aria-label={t("profiles.people.editOne", { name: target.name })} onClick={() => onEditNote(person.note)}>{t("profiles.people.edit")}</button>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        }
        side={person ? <button type="button" className="btn life-danger" disabled={busy} aria-label={t("profiles.people.forgetOne", { name: target.name })} onClick={onForget}>{t("profiles.people.forget")}</button> : null}
      />
    </div>
  );
}
