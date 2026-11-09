// "Update all from Roleplay": one dialog for every profile that came from a card. Steps: (1) the plugin checks which cards
// changed since the profile was made or last updated, with no model; (2) the user picks the profiles to read again (all
// the changed ones are ticked; each is one model call); (3) the cards are read one after another; (4) a list of what would
// change, with a tick per profile; "Apply" writes the ticked ones into the profiles and saves them. Closing the dialog
// while cards are being read stops the run; what was read stays unapplied.
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { canOpenHome, openHome } from "@/lib/shell-home";
import type { MockProfile, ProfileForm } from "@/mock/profiles";
import { Dialog } from "./dialog";
import { checkCards, makeDiff, refreshMany, refreshOne, type CheckItem, type DiffRow, type Refreshed, type RefreshResult } from "./import-api";

/** What "Apply" hands back for one profile: the text to put in, and the date and fingerprint of the card it was read from. */
export interface ApplyItem {
  id: string;
  patch: Partial<ProfileForm>;
  cardDate: string;
  cardHash: string;
}

type View =
  | { phase: "check" }
  | { phase: "closed" }
  | { phase: "error"; message: string }
  | { phase: "none"; total: number }
  | { phase: "pick"; items: CheckItem[]; total: number; truncated: boolean }
  | { phase: "run"; ids: string[]; results: Record<string, RefreshResult> }
  | { phase: "review"; ids: string[]; results: Record<string, RefreshResult> };

const FIELD_KEY: Record<DiffRow["field"], string> = { about: "profiles.tab.about", voice: "profiles.tab.voice", interests: "profiles.about.interests" };

interface Props {
  /** Every profile: the roleplay ones are checked; the rest only give the avatar a face. */
  profiles: MockProfile[];
  /** The form a profile has right now (saved, or the draft open in the editor). */
  formFor: (id: string) => ProfileForm;
  /** Profiles with unsaved changes in the editor: left alone, so a save here never takes someone's half-written draft along. */
  dirty: Set<string>;
  /** Design preview: no plugin, canned answers. */
  preview: boolean;
  onApply: (items: ApplyItem[]) => void;
  onClose: () => void;
}

/** The design preview's canned check: the first two Roleplay profiles changed, the rest did not. */
function previewCheck(profiles: MockProfile[]): CheckItem[] {
  const rp = profiles.filter((p) => p.source === "roleplay");
  return rp.map((p, i) => ({ id: p.id, name: p.name, state: i < 2 ? "changed" : "same", ...(i === 1 ? { first: true } : {}) }));
}

/** The design preview's canned reading: a longer About and one more interest. */
async function previewRefresh(id: string, form: ProfileForm): Promise<Refreshed> {
  await new Promise((r) => setTimeout(r, 500));
  if (id.endsWith("2")) throw new Error("the model did not answer");
  return { digest: { about: `${form.about.trim()} Now also keeps a small diary.`, interests: ["нова цікавість"], voiceText: form.voice.text }, cardDate: "2026-11-09", cardHash: "00000000-0" };
}

export function UpdateAllDialog({ profiles, formFor, dirty, preview, onApply, onClose }: Props) {
  const t = useT();
  const [view, setView] = useState<View>({ phase: "check" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const token = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      token.current += 1; // a run in progress stops at its next card
    };
  }, []);
  const byId = (id: string) => profiles.find((p) => p.id === id);
  const face = (id: string, name: string, size = 28) => <Avatar name={name} hue={byId(id)?.hue ?? 0} size={size} radius={6} picture={byId(id)?.picture || undefined} />;

  const check = () => {
    const mine = ++token.current;
    setView({ phase: "check" });
    const done = (items: CheckItem[], truncated: boolean) => {
      if (token.current !== mine || !live.current) return;
      const changed = items.filter((i) => i.state === "changed");
      if (changed.length === 0) return setView({ phase: "none", total: items.length });
      setPicked(new Set(changed.filter((i) => !dirty.has(i.id)).map((i) => i.id)));
      setView({ phase: "pick", items, total: items.length, truncated });
    };
    if (preview) {
      setTimeout(() => done(previewCheck(profiles), false), 400);
      return;
    }
    checkCards().then(
      (r) => {
        if (token.current !== mine || !live.current) return;
        if (r.state === "closed") setView({ phase: "closed" });
        else done(r.items, r.truncated);
      },
      (e: unknown) => {
        if (token.current === mine && live.current) setView({ phase: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: the check runs once, when the dialog opens
  useEffect(check, []);

  const run = (ids: string[]) => {
    const mine = ++token.current;
    let results: Record<string, RefreshResult> = {};
    setView({ phase: "run", ids, results });
    const exec = (id: string) => (preview ? previewRefresh(id, formFor(id)) : refreshOne(id));
    void refreshMany(
      ids,
      exec,
      (r) => {
        if (token.current !== mine || !live.current) return;
        results = { ...results, [r.id]: r };
        setView({ phase: "run", ids, results });
      },
      () => token.current !== mine || !live.current,
    ).then(() => {
      if (token.current !== mine || !live.current) return;
      const diffs = ids.filter((id) => results[id]?.ok && makeDiff(formFor(id), (results[id] as Refreshed & { ok: true }).digest));
      setApplied(new Set(diffs));
      setView({ phase: "review", ids, results });
    });
  };

  const stop = () => {
    // What was read so far goes to the review; nothing more starts.
    if (view.phase !== "run") return onClose();
    token.current += 1;
    const { ids, results } = view;
    const read = ids.filter((id) => results[id]);
    if (read.length === 0) return onClose();
    setApplied(new Set(read.filter((id) => results[id]?.ok && makeDiff(formFor(id), (results[id] as Refreshed & { ok: true }).digest))));
    setView({ phase: "review", ids: read, results });
  };

  const title = t("profiles.updateAll.title");
  const closeBtn = (key = "profiles.import.cancel") => <button type="button" className="btn cancel" onClick={onClose}>{t(key)}</button>;

  if (view.phase === "check" || view.phase === "none" || view.phase === "error" || view.phase === "closed") {
    return (
      <Dialog title={title} width={560} onClose={onClose}>
        <div className="pf-body" aria-busy={view.phase === "check"}>
          {view.phase === "check" && <p className="k">{t("profiles.updateAll.checking")}</p>}
          {view.phase === "none" && <p>{t("profiles.updateAll.none", { n: view.total })}</p>}
          {view.phase === "error" && <p role="alert">{t("profiles.updateAll.error", { message: view.message })}</p>}
          {view.phase === "closed" && (
            <>
              <p>{t("profiles.import.closed")}</p>
              <p>{t("profiles.import.closedHow")}</p>
            </>
          )}
        </div>
        <div className={view.phase === "closed" ? "pf-foot stack" : "pf-foot"}>
          {view.phase === "closed" && canOpenHome() && (
            <button type="button" className="btn home" onClick={() => { onClose(); openHome(); }}>{t("profiles.import.openHome")}</button>
          )}
          <span className="grow" />
          {closeBtn(view.phase === "none" ? "profiles.diff.close" : "profiles.import.cancel")}
          {(view.phase === "error" || view.phase === "closed") && (
            <button type="button" className="btn cta" onClick={check}>{t(view.phase === "closed" ? "profiles.import.check" : "profiles.retry")}</button>
          )}
        </div>
      </Dialog>
    );
  }

  if (view.phase === "pick") {
    const changed = view.items.filter((i) => i.state === "changed");
    const missing = view.items.filter((i) => i.state === "gone" || i.state === "unreadable" || i.state === "empty").length;
    const free = changed.filter((i) => !dirty.has(i.id));
    const all = free.length > 0 && free.every((i) => picked.has(i.id));
    const some = free.some((i) => picked.has(i.id)) && !all;
    const toggle = (ids: string[], on: boolean) =>
      setPicked((s) => {
        const n = new Set(s);
        for (const id of ids) if (on) n.add(id);
        else n.delete(id);
        return n;
      });
    return (
      <Dialog title={title} width={640} onClose={onClose}>
        <div className="pf-body">
          <p>{t("profiles.updateAll.intro", { n: changed.length, m: view.total })}</p>
        </div>
        <div className="pf-list">
          <div className="grp">
            <input
              type="checkbox"
              className="cb"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = some;
              }}
              disabled={free.length === 0}
              onChange={(e) => toggle(free.map((i) => i.id), e.target.checked)}
              aria-label={t("profiles.import.groupAll")}
            />
            <span>{t("profiles.updateAll.changed", { n: changed.length })}</span>
          </div>
          {changed.map((i) => (
            <div className="row" key={i.id}>
              <input type="checkbox" className="cb" checked={picked.has(i.id)} disabled={dirty.has(i.id)} onChange={(e) => toggle([i.id], e.target.checked)} aria-label={t("profiles.import.pick")} />
              {face(i.id, i.name, 32)}
              <div className="t">
                <span className="nm">{i.name}</span>
                {i.first && <span className="s">{t("profiles.updateAll.first")}</span>}
              </div>
              {dirty.has(i.id) && <span className="tag">{t("profiles.updateAll.unsaved")}</span>}
            </div>
          ))}
        </div>
        {missing > 0 && <p className="pf-note">{t("profiles.updateAll.missing", { n: missing })}</p>}
        {view.truncated && <p className="pf-note">{t("profiles.import.truncated")}</p>}
        <p className="pf-note">{t("profiles.updateAll.cost")}</p>
        <div className="pf-foot">
          <span className="strong">{t("profiles.import.selected", { n: picked.size, m: free.length })}</span>
          <span className="grow" />
          {closeBtn()}
          <button type="button" className="btn cta" disabled={picked.size === 0} onClick={() => run(changed.filter((i) => picked.has(i.id)).map((i) => i.id))}>
            {t("profiles.updateAll.read", { n: picked.size })}
          </button>
        </div>
      </Dialog>
    );
  }

  if (view.phase === "run") {
    const settled = view.ids.filter((id) => view.results[id]).length;
    const at = Math.min(settled + 1, view.ids.length);
    return (
      <Dialog title={t("profiles.updateAll.runTitle", { n: at, m: view.ids.length })} width={560} onClose={stop}>
        <div className="pf-body run">
          <div className="bar"><i style={{ width: `${Math.round((at / Math.max(view.ids.length, 1)) * 100)}%` }} /></div>
          {view.ids.map((id) => {
            const r = view.results[id];
            const name = byId(id)?.name ?? id;
            const s = r ? (r.ok ? "done" : "failed") : id === view.ids[settled] ? "reading" : "queued";
            return (
              <div className="run-row" key={id}>
                {face(id, name)}
                <span className="t">{name}</span>
                <span className={`st st-${s}`}>{t(`profiles.import.status.${s}`)}</span>
              </div>
            );
          })}
        </div>
        <div className="pf-foot">
          <span className="k grow">{t("profiles.updateAll.closeStops")}</span>
          <button type="button" className="btn" onClick={stop}>{t("profiles.import.stop")}</button>
        </div>
      </Dialog>
    );
  }

  // review
  const rows = view.ids.map((id) => ({ id, name: byId(id)?.name ?? id, r: view.results[id] }));
  const withDiff = rows.flatMap((x) => (x.r?.ok ? [{ ...x, r: x.r, diff: makeDiff(formFor(x.id), x.r.digest) }] : [])).filter((x) => x.diff);
  const same = rows.filter((x) => x.r?.ok && !makeDiff(formFor(x.id), x.r.digest));
  const failed = rows.flatMap((x) => (x.r && !x.r.ok ? [{ ...x, error: x.r.error }] : []));
  const apply = () => {
    const items: ApplyItem[] = [];
    for (const x of withDiff) if (applied.has(x.id) && x.diff) items.push({ id: x.id, patch: x.diff.patch, cardDate: x.r.cardDate, cardHash: x.r.cardHash });
    // the card changed but the text stays: nothing to write, the profile is only marked as read again
    for (const x of same) if (x.r?.ok) items.push({ id: x.id, patch: {}, cardDate: x.r.cardDate, cardHash: x.r.cardHash });
    onApply(items);
    onClose();
  };
  const n = withDiff.filter((x) => applied.has(x.id)).length;
  return (
    <Dialog title={t("profiles.updateAll.reviewTitle", { n: withDiff.length })} width={720} onClose={onClose}>
      <div className="pf-body">
        <p className="k">{t("profiles.updateAll.reviewIntro")}</p>
      </div>
      <div className="pf-list ua-list">
        {withDiff.map((x) => (
          <details className="ua-item" key={x.id}>
            <summary>
              <input
                type="checkbox"
                className="cb"
                checked={applied.has(x.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setApplied((s) => {
                    const nx = new Set(s);
                    if (e.target.checked) nx.add(x.id);
                    else nx.delete(x.id);
                    return nx;
                  })
                }
                aria-label={t("profiles.import.pick")}
              />
              {face(x.id, x.name, 32)}
              <div className="t">
                <span className="nm">{x.name}</span>
                <span className="s">{x.diff?.rows.map((row) => t(FIELD_KEY[row.field])).join(", ")}</span>
              </div>
            </summary>
            <div className="diff ua-diff">
              {x.diff?.rows.map((row) => (
                <div key={row.field} className="ua-field">
                  <div className="dl">{t(FIELD_KEY[row.field])}</div>
                  {row.removed.map((y) => (
                    <div key={`d-${y}`} className="del">{y}</div>
                  ))}
                  {row.added.map((y) => (
                    <div key={`a-${y}`} className="add">{y}</div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ))}
        {withDiff.length === 0 && <div className="pf-body"><p>{t("profiles.updateAll.nothingNew")}</p></div>}
        {failed.map((x) => (
          <div className="run-fail ua-fail" key={x.id}>
            {face(x.id, x.name)}
            <div className="t">
              <b>{x.name}</b>
              <span className="k">{t("profiles.import.failWith", { message: x.error })}</span>
            </div>
          </div>
        ))}
      </div>
      {same.length > 0 && <p className="pf-note">{t("profiles.updateAll.same", { n: same.length })}</p>}
      {failed.length > 0 && <p className="pf-note">{t("profiles.updateAll.failedNote", { n: failed.length })}</p>}
      <div className="pf-foot">
        <span className="k grow">{t("profiles.updateAll.savedNote")}</span>
        {closeBtn("profiles.diff.keep")}
        <button type="button" className="btn cta" disabled={n === 0 && same.length === 0} onClick={apply}>
          {t("profiles.updateAll.apply", { n })}
        </button>
      </div>
    </Dialog>
  );
}
