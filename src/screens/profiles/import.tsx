// Roleplay import: the pick dialog (cards and personas with checkboxes), the
// run (progress per card, one card can fail and be retried), and the first-run
// empty state that opens it.
import { useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { IMPORT_ENTRIES, IMPORT_PROFILES, FAILING_IDS, type ImportEntry } from "@/mock/profiles-import";
import { Dialog } from "./dialog";

/** A checkbox that can show the "some of them" state. */
function Check({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="cb" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
}

/** "Create 9 profiles" with the right Ukrainian plural form. */
export function createLabel(t: (k: string, v?: Record<string, number>) => string, n: number): string {
  let form = "other";
  if (currentLang() === "uk") {
    const d10 = n % 10;
    const d100 = n % 100;
    form = d10 === 1 && d100 !== 11 ? "one" : d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14) ? "few" : "many";
  } else {
    form = n === 1 ? "one" : "other";
  }
  return t(`profiles.import.create.${form}`, { n });
}

export function ImportDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (entries: ImportEntry[]) => void }) {
  const t = useT();
  const [sel, setSel] = useState<Set<string>>(() => new Set(IMPORT_PROFILES.map((e) => e.id)));
  const [model, setModel] = useState("default");

  const setMany = (ids: string[], on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const id of ids) if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const membersOf = (pid: string) => IMPORT_ENTRIES.filter((x) => x.parent === pid).map((x) => x.id);
  const stateOf = (ids: string[]) => {
    const n = ids.filter((id) => sel.has(id)).length;
    return { all: ids.length > 0 && n === ids.length, some: n > 0 && n < ids.length };
  };

  const chosen = IMPORT_PROFILES.filter((e) => sel.has(e.id));
  const chars = IMPORT_PROFILES.filter((e) => e.kind !== "persona").map((e) => e.id);
  const personas = IMPORT_PROFILES.filter((e) => e.kind === "persona").map((e) => e.id);

  const rowOf = (e: ImportEntry) => {
    if (e.kind === "narrator") {
      const ms = membersOf(e.id);
      const st = stateOf(ms);
      return (
        <div className="row" key={e.id}>
          <Check checked={st.all} indeterminate={st.some} onChange={(on) => setMany(ms, on)} label={t("profiles.import.groupAll")} />
          {avatar(e, 32)}
          <div className="t">
            <span className="nm">{e.name}</span>
            <span className="s">{t("profiles.import.narratorNote", { n: ms.length })}</span>
          </div>
        </div>
      );
    }
    const narrator = e.parent ? IMPORT_ENTRIES.find((x) => x.id === e.parent) : undefined;
    const note =
      e.kind === "persona" ? t("profiles.import.personaNote")
      : narrator ? t("profiles.import.fromNarrator", { name: narrator.name })
      : t("profiles.import.card", { title: e.card });
    return (
      <div className={`row${narrator ? " sub" : ""}`} key={e.id}>
        <Check checked={sel.has(e.id)} onChange={(on) => setMany([e.id], on)} label={t("profiles.import.pick")} />
        {avatar(e, 32)}
        <div className="t">
          <span className="nm">{e.name}</span>
          <span className="s">{note}</span>
        </div>
        {!e.soul && <span className="tag">{t("profiles.import.noSoul")}</span>}
      </div>
    );
  };

  const group = (name: string, ids: string[], rows: ImportEntry[]) => {
    const st = stateOf(ids);
    return (
      <div key={name}>
        <div className="grp">
          <Check checked={st.all} indeterminate={st.some} onChange={(on) => setMany(ids, on)} label={t("profiles.import.groupAll")} />
          <span>{name}</span>
        </div>
        {rows.map(rowOf)}
      </div>
    );
  };

  const charRows = IMPORT_ENTRIES.filter((e) => e.kind !== "persona");
  const personaRows = IMPORT_ENTRIES.filter((e) => e.kind === "persona");

  return (
    <Dialog title={t("profiles.import.title")} width={760} onClose={onClose}>
      <div className="pf-body">
        <p>{t("profiles.import.intro")}</p>
        <div className="access">
          <span className="chip"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{t("profiles.import.access")}</span>
          <span className="k">{t("profiles.import.accessNote")}</span>
        </div>
      </div>
      <div className="pf-list">
        {group(t("profiles.import.groupChars", { n: chars.length }), chars, charRows)}
        {group(t("profiles.import.groupPersonas", { n: personas.length }), personas, personaRows)}
      </div>
      <p className="pf-note">{t("profiles.import.hidden")}</p>
      <div className="pf-foot">
        <span className="strong">{t("profiles.import.selected", { n: chosen.length, m: IMPORT_PROFILES.length })}</span>
        <span className="k">{t("profiles.import.model")}</span>
        <label className="sel">
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label={t("profiles.import.model")}>
            <option value="default">{t("profiles.import.modelDefault")}</option>
            <option value="economy">{t("profiles.import.modelEconomy")}</option>
          </select>
          <span aria-hidden="true">▾</span>
        </label>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("profiles.import.cancel")}</button>
        <button type="button" className="btn cta" disabled={chosen.length === 0} onClick={() => onCreate(chosen)}>
          {createLabel(t, chosen.length)}
        </button>
      </div>
    </Dialog>
  );
}

// ---- the run ----

export type RunPreview = "importing" | "importfail";
interface RunState { cur: number; done: string[]; failed: string[]; retry: string | null }

function initRun(ids: string[], preview?: RunPreview): RunState {
  if (preview === "importing") return { cur: 3, done: ids.slice(0, 3), failed: [], retry: null };
  if (preview === "importfail") return { cur: ids.length, done: ids.filter((id) => !FAILING_IDS.has(id)), failed: ids.filter((id) => FAILING_IDS.has(id)), retry: null };
  return { cur: 0, done: [], failed: [], retry: null };
}

/** Creates the profiles one card at a time; a failing card stops only itself. */
export function ImportRun({ entries, preview, onFinish }: { entries: ImportEntry[]; preview?: RunPreview; onFinish: (doneIds: string[]) => void }) {
  const t = useT();
  const ids = entries.map((e) => e.id);
  const [st, setSt] = useState<RunState>(() => initRun(ids, preview));
  const frozen = !!preview;
  const total = entries.length;
  const finished = st.cur >= total && !st.retry;

  useEffect(() => {
    if (frozen || st.retry || st.cur >= total) return;
    const h = window.setTimeout(() => {
      setSt((s) => {
        const id = ids[s.cur];
        return FAILING_IDS.has(id) ? { ...s, cur: s.cur + 1, failed: [...s.failed, id] } : { ...s, cur: s.cur + 1, done: [...s.done, id] };
      });
    }, 700);
    return () => window.clearTimeout(h);
    // ids is derived from entries; the timer restarts only when the step changes
  }, [frozen, st.retry, st.cur, total]);

  useEffect(() => {
    if (frozen || !st.retry) return;
    const h = window.setTimeout(() => setSt((s) => (s.retry ? { ...s, retry: null, done: [...s.done, s.retry] } : s)), 700);
    return () => window.clearTimeout(h);
  }, [frozen, st.retry]);

  const retry = (id: string) => setSt((s) => ({ ...s, failed: s.failed.filter((x) => x !== id), retry: id }));
  const title = finished
    ? t("profiles.import.doneTitle", { n: st.done.length, m: total })
    : t("profiles.import.runTitle", { n: Math.min(st.cur + 1, total), m: total });
  const pct = Math.min(st.cur + 1, total) / total;
  const hasFail = st.failed.length > 0;

  const statusOf = (id: string, i: number): "done" | "failed" | "reading" | "queued" =>
    st.done.includes(id) ? "done"
    : st.failed.includes(id) ? "failed"
    : st.retry === id || (i === st.cur && !finished) ? "reading"
    : "queued";

  return (
    <Dialog title={title} width={620} onClose={() => onFinish(st.done)}>
      <div className="pf-body run">
        {!finished && (
          <div className="bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
        )}
        {entries.map((e, i) => {
          const s = statusOf(e.id, i);
          if (s === "failed") {
            return (
              <div className="run-fail" key={e.id}>
                {avatar(e)}
                <div className="t">
                  <b>{e.name}</b>
                  <span className="k">{t("profiles.import.failMsg")}</span>
                </div>
                <button type="button" className="btn" disabled={!!st.retry} onClick={() => retry(e.id)}>{t("profiles.import.retry")}</button>
              </div>
            );
          }
          return (
            <div className="run-row" key={e.id}>
              {avatar(e)}
              <span className="t">{e.name}</span>
              <span className={`st st-${s}`}>{t(`profiles.import.status.${s}`)}</span>
            </div>
          );
        })}
      </div>
      <div className="pf-foot">
        {!finished ? (
          <>
            <span className="k grow">{t("profiles.import.canClose")}</span>
            <button type="button" className="btn" onClick={() => onFinish(st.done)}>{t("profiles.import.stop")}</button>
          </>
        ) : (
          <>
            <span className="grow" />
            {hasFail && <button type="button" className="btn" onClick={() => onFinish(st.done)}>{t("profiles.import.skip")}</button>}
            <button type="button" className="btn cta" onClick={() => onFinish(st.done)}>{t("profiles.import.toProfiles")}</button>
          </>
        )}
      </div>
    </Dialog>
  );
}

const avatar = (e: ImportEntry, size = 28) => <Avatar name={e.name} hue={e.hue} size={size} radius={6} />;

/** The empty first run: no profiles yet, with the Import call to action. */
export function FirstRun({ phone, onImport }: { phone: boolean; onImport: () => void }) {
  const t = useT();
  return (
    <section className={`first${phone ? " first-p" : ""}`}>
      <h2 className="first-h">{t("profiles.firstrun.title")}</h2>
      <p className="k first-text">{t("profiles.firstrun.text")}</p>
      <button type="button" className="btn cta" onClick={onImport}>{t("profiles.import")}</button>
    </section>
  );
}
