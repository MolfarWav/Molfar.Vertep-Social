// Roleplay import: the pick dialog (cards with checkboxes, or the reason there is nothing to pick),
// the run (progress per card, one card can fail and be retried), and the first-run empty state that opens it.
// The list comes from the plugin in the app and from the mock in the design preview; the run is an ImportRunner
// (import-api.ts) that lives outside the dialog, so closing the window does not stop it.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT, currentLang } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import type { ModelChoice } from "@/lib/api";
import { canOpenHome, openHome } from "@/lib/shell-home";
import type { ImportEntry } from "@/mock/profiles-import";
import { Dialog } from "./dialog";
import type { HiddenCounts, ImportRunner, RunStatus } from "./import-api";

/** A checkbox that can show the "some of them" state. */
function Check({ checked, indeterminate = false, disabled = false, onChange, label }: { checked: boolean; indeterminate?: boolean; disabled?: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="cb" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
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

/** What the dialog shows: the list is being read, Roleplay is out of reach, the read failed, or the list itself. */
export type ImportSource =
  | { phase: "loading" }
  | { phase: "closed" }
  | { phase: "error"; message: string }
  | { phase: "ready"; entries: ImportEntry[]; hidden: HiddenCounts; truncated: boolean };

interface PickProps {
  source: ImportSource;
  /** Ids of the profiles that already exist: those rows are shown as imported and cannot be picked. */
  taken: Set<string>;
  /** The models to choose from; null in the design preview, which has two fixed choices. */
  models: ModelChoice[] | null;
  /** The app reads the list (and says how it is allowed); the design preview shows the approved note. */
  preview: boolean;
  onClose: () => void;
  onCreate: (entries: ImportEntry[], model: string) => void;
  /** Reads the list again (Check again, Try again). */
  onRetry: () => void;
}

export function ImportDialog(props: PickProps) {
  const t = useT();
  const { source, onClose, onRetry } = props;
  if (source.phase === "ready") return <PickDialog {...props} source={source} />;
  const body =
    source.phase === "loading" ? (
      <p className="k">{t("profiles.import.loading")}</p>
    ) : source.phase === "error" ? (
      <p role="alert">{t("profiles.import.errorText", { message: source.message })}</p>
    ) : (
      <>
        <p>{t("profiles.import.closed")}</p>
        <p>{t("profiles.import.closedHow")}</p>
        <p className="k">{t("profiles.import.closedOther")}</p>
      </>
    );
  return (
    <Dialog title={t("profiles.import.title")} width={560} onClose={onClose}>
      <div className="pf-body" aria-busy={source.phase === "loading"}>{body}</div>
      <div className={source.phase === "closed" ? "pf-foot stack" : "pf-foot"}>
        {source.phase === "closed" && canOpenHome() && (
          <button type="button" className="btn home" onClick={() => { onClose(); openHome(); }}>{t("profiles.import.openHome")}</button>
        )}
        <span className="grow" />
        <button type="button" className="btn cancel" onClick={onClose}>{t("profiles.import.cancel")}</button>
        {source.phase !== "loading" && (
          <button type="button" className="btn cta" onClick={onRetry}>{t(source.phase === "closed" ? "profiles.import.check" : "profiles.retry")}</button>
        )}
      </div>
    </Dialog>
  );
}

/** The model picker of the footer: the engine's default, then the models the user switched on, grouped by connection. */
function ModelSelect({ models, value, onChange, label }: { models: ModelChoice[] | null; value: string; onChange: (v: string) => void; label: string }) {
  const t = useT();
  if (!models) {
    return (
      <select value={value || "default"} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="default">{t("profiles.import.modelDefault")}</option>
        <option value="economy">{t("profiles.import.modelEconomy")}</option>
      </select>
    );
  }
  const groups = new Map<string, ModelChoice[]>();
  for (const m of models) groups.set(m.provider ?? "", [...(groups.get(m.provider ?? "") ?? []), m]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{t("profiles.import.modelDefault")}</option>
      {[...groups].map(([provider, list]) => (
        <optgroup key={provider} label={provider}>
          {list.map((m) => (
            <option key={m.ref} value={m.ref}>{m.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function PickDialog({ source, taken, models, preview, onClose, onCreate }: PickProps & { source: Extract<ImportSource, { phase: "ready" }> }) {
  const t = useT();
  const entries = source.entries;
  const profiles = entries.filter((e) => e.kind !== "narrator");
  const free = profiles.filter((e) => !taken.has(e.id));
  const [sel, setSel] = useState<Set<string>>(() => new Set(free.map((e) => e.id)));
  const [model, setModel] = useState("");

  const setMany = (ids: string[], on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const id of ids) if (on && !taken.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });
  const membersOf = (pid: string) => entries.filter((x) => x.parent === pid).map((x) => x.id);
  const stateOf = (ids: string[]) => {
    const pickable = ids.filter((id) => !taken.has(id));
    const n = pickable.filter((id) => sel.has(id)).length;
    return { all: pickable.length > 0 && n === pickable.length, some: n > 0 && n < pickable.length, none: pickable.length === 0 };
  };

  const chosen = profiles.filter((e) => sel.has(e.id));
  const chars = profiles.map((e) => e.id);

  const rowOf = (e: ImportEntry) => {
    if (e.kind === "narrator") {
      const ms = membersOf(e.id);
      const st = stateOf(ms);
      return (
        <div className="row" key={e.id}>
          <Check checked={st.all} indeterminate={st.some} disabled={st.none} onChange={(on) => setMany(ms, on)} label={t("profiles.import.groupAll")} />
          {avatar(e, 32)}
          <div className="t">
            <span className="nm">{e.name}</span>
            <span className="s">{t("profiles.import.narratorNote", { n: ms.length })}</span>
          </div>
        </div>
      );
    }
    const narrator = e.parent ? entries.find((x) => x.id === e.parent) : undefined;
    const note =
      narrator ? t("profiles.import.fromNarrator", { name: narrator.name })
      : t("profiles.import.card", { title: e.card });
    const have = taken.has(e.id);
    return (
      <div className={`row${narrator ? " sub" : ""}`} key={e.id}>
        <input type="checkbox" className="cb" checked={sel.has(e.id)} disabled={have} onChange={(ev) => setMany([e.id], ev.target.checked)} aria-label={t("profiles.import.pick")} />
        {avatar(e, 32)}
        <div className="t">
          <span className="nm">{e.name}</span>
          <span className="s">{note}</span>
        </div>
        {have ? <span className="tag muted">{t("profiles.import.taken")}</span> : !e.soul && <span className="tag">{t("profiles.import.noSoul")}</span>}
      </div>
    );
  };

  const group = (name: string, ids: string[], rows: ImportEntry[]) => {
    const st = stateOf(ids);
    return (
      <div key={name}>
        <div className="grp">
          <Check checked={st.all} indeterminate={st.some} disabled={st.none} onChange={(on) => setMany(ids, on)} label={t("profiles.import.groupAll")} />
          <span>{name}</span>
        </div>
        {rows.map(rowOf)}
      </div>
    );
  };

  const nothing = profiles.length === 0;
  return (
    <Dialog title={t("profiles.import.title")} width={760} onClose={onClose}>
      <div className="pf-body">
        <p>{t("profiles.import.intro")}</p>
        <div className="access">
          <span className="chip"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{t("profiles.import.access")}</span>
          <span className="k">{t(preview ? "profiles.import.accessNote" : "profiles.import.accessNoteHome")}</span>
        </div>
      </div>
      {nothing ? (
        <div className="pf-body"><p className="k">{t("profiles.import.empty")}</p></div>
      ) : (
        <div className="pf-list">
          {chars.length > 0 && group(t("profiles.import.groupChars", { n: chars.length }), chars, entries)}
        </div>
      )}
      {!nothing && free.length === 0 && <p className="pf-note">{t("profiles.import.allTaken")}</p>}
      <p className="pf-note">{t(preview ? "profiles.import.hidden" : "profiles.import.noteReal")}</p>
      {source.hidden.unreadable > 0 && <p className="pf-note">{t("profiles.import.unreadable", { n: source.hidden.unreadable })}</p>}
      {source.truncated && <p className="pf-note">{t("profiles.import.truncated")}</p>}
      <div className="pf-foot">
        <span className="strong">{t("profiles.import.selected", { n: chosen.length, m: free.length })}</span>
        <span className="k">{t("profiles.import.model")}</span>
        <label className="sel">
          <ModelSelect models={models} value={model} onChange={setModel} label={t("profiles.import.model")} />
          <span aria-hidden="true">▾</span>
        </label>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("profiles.import.cancel")}</button>
        <button type="button" className="btn cta" disabled={chosen.length === 0} onClick={() => onCreate(chosen, model === "default" ? "" : model)}>
          {createLabel(t, chosen.length)}
        </button>
      </div>
    </Dialog>
  );
}

// ---- the run ----

/** The progress of an ImportRunner: one row per card, a failing card stops only itself and can be retried. */
export function ImportRun({ runner, preview, onClose }: { runner: ImportRunner; preview: boolean; onClose: () => void }) {
  const t = useT();
  const snap = useSyncExternalStore(runner.subscribe, runner.snapshot);
  const entries = snap.entries;
  const total = entries.length;
  const count = (s: RunStatus) => entries.filter((e) => snap.status[e.id] === s).length;
  const done = count("done");
  const settled = done + count("failed");
  const finished = runner.finished;
  const title = finished ? t("profiles.import.doneTitle", { n: done, m: total }) : t("profiles.import.runTitle", { n: Math.min(settled + 1, total), m: total });
  const pct = Math.min(settled + 1, total) / Math.max(total, 1);
  const hasFail = count("failed") > 0;
  const retrying = count("reading") > 0;

  return (
    <Dialog title={title} width={620} onClose={onClose}>
      <div className="pf-body run">
        {!finished && (
          <div className="bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
        )}
        {entries.map((e) => {
          const s = snap.status[e.id] ?? "queued";
          if (s === "failed") {
            const why = snap.errors[e.id];
            return (
              <div className="run-fail" key={e.id}>
                {avatar(e)}
                <div className="t">
                  <b>{e.name}</b>
                  <span className="k">{why && !preview ? t("profiles.import.failWith", { message: sentence(why) }) : t("profiles.import.failMsg")}</span>
                </div>
                <button type="button" className="btn" disabled={retrying} onClick={() => runner.retry(e.id)}>{t("profiles.import.retry")}</button>
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
            <button type="button" className="btn" onClick={() => { runner.stop(); onClose(); }}>{t("profiles.import.stop")}</button>
          </>
        ) : (
          <>
            <span className="grow" />
            {hasFail && <button type="button" className="btn" onClick={onClose}>{t("profiles.import.skip")}</button>}
            <button type="button" className="btn cta" onClick={onClose}>{t("profiles.import.toProfiles")}</button>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** A plugin error as the start of a sentence: capital first letter, no final full stop. */
const sentence = (s: string) => {
  const t = s.replace(/[.\s]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const avatar = (e: ImportEntry, size = 28) => <Avatar name={e.name} hue={e.hue} size={size} radius={6} />;

/** The empty first run: no profiles yet. The Import call to action first, "New profile" beside it (alone when import is not offered). */
export function FirstRun({ phone, onImport, onNew }: { phone: boolean; onImport?: () => void; onNew?: () => void }) {
  const t = useT();
  return (
    <section className={`first${phone ? " first-p" : ""}`}>
      <h2 className="first-h">{t("profiles.firstrun.title")}</h2>
      <p className="k first-text">{t(onImport ? "profiles.firstrun.text" : "profiles.firstrun.textNew")}</p>
      {onImport && <button type="button" className="btn cta" onClick={onImport}>{t("profiles.import")}</button>}
      {onNew && <button type="button" className={onImport ? "btn" : "btn cta"} onClick={onNew}>{t("profiles.new")}</button>}
    </section>
  );
}
