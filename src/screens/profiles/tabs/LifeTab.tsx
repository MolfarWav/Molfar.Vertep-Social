// "Життя" (Life): whether the profile keeps a diary and follows the outside world (two switches in the draft, saved with the
// Save bar) and the diary itself (entries, mood, plan). Diary changes are saved at once: the tab says so. Issue #311.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { ApiError } from "@/lib/api";
import { Switch } from "../ui";
import { deleteEntry, forgetDiary, loadDiary, saveEntry, saveState, writeDay, type DiaryEntry, type DiaryView } from "../life-api";
import type { TabProps } from "./types";

type Ask = { kind: "edit"; id: string; text: string } | { kind: "new"; text: string } | { kind: "delete"; id: string } | { kind: "forget" } | null;

const dayLabel = (e: DiaryEntry, lang: string) => {
  const d = new Date(e.at);
  return Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(lang, { day: "numeric", month: "long" });
};

export function LifeTab({ form, set, profileId }: TabProps) {
  const t = useT();
  const lang = currentLang();
  const [view, setView] = useState<DiaryView | null>(null);
  const [failed, setFailed] = useState("");
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState("");
  const [plan, setPlan] = useState("");
  const alive = useRef(true);

  const adopt = useCallback((v: DiaryView) => {
    setView(v);
    setMood(v.diary.mood);
    setPlan(v.diary.plan);
  }, []);

  useEffect(() => {
    alive.current = true;
    setView(null);
    setFailed("");
    if (profileId) {
      loadDiary(profileId)
        .then((v) => alive.current && adopt(v))
        .catch((e: unknown) => alive.current && setFailed(e instanceof Error ? e.message : String(e)));
    }
    return () => {
      alive.current = false;
    };
  }, [profileId, adopt]);

  const run = async (job: () => Promise<DiaryView>) => {
    setBusy(true);
    setNote("");
    try {
      const v = await job();
      if (alive.current) {
        adopt(v);
        setAsk(null);
      }
    } catch (e) {
      if (alive.current) setNote(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const write = async () => {
    if (!profileId) return;
    setBusy(true);
    setNote("");
    try {
      const r = await writeDay(profileId);
      if (!alive.current) return;
      adopt(r);
      if (!r.ok) setNote(r.code === "no-model" ? t("profiles.life.noModel") : r.error || t("profiles.life.writeFailed"));
    } catch (e) {
      if (alive.current) setNote(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const flags = view?.flags;
  const appOff = flags ? !flags.on : false;
  const worldOff = flags ? !flags.world : false;
  const entries = view?.diary.entries ?? [];

  const editor = (text: string, onText: (v: string) => void, onSave: () => void) => (
    <div className="life-edit">
      <textarea className="inp inp-area" aria-label={t("profiles.life.entryLabel")} value={text} maxLength={400} rows={3} autoFocus onChange={(e) => onText(e.target.value)} />
      <div className="life-actions">
        <button type="button" className="btn cta" disabled={busy || !text.trim()} onClick={onSave}>{t("profiles.life.save")}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => setAsk(null)}>{t("profiles.life.cancel")}</button>
      </div>
    </div>
  );

  return (
    <div className="tab-stack tab-life">
      <div className="life-flags">
        <Switch on={form.life.on} onChange={(on) => set({ life: { ...form.life, on } })}>{t("profiles.life.on")}</Switch>
        <div className="k">{t(appOff ? "profiles.life.appOff" : "profiles.life.onNote")}</div>
        <Switch on={form.life.world} onChange={(world) => set({ life: { ...form.life, world } })}>{t("profiles.life.world")}</Switch>
        <div className="k">{t(worldOff && !appOff ? "profiles.life.worldAppOff" : "profiles.life.worldNote")}</div>
      </div>

      <div className="pv">
        <div className="pvh">{t("profiles.life.diary")}</div>
        <div className="log">
          <div className="k">{t("profiles.life.savedAtOnce")}</div>
          {!profileId && <div className="k">{t("profiles.life.unsaved")}</div>}
          {failed && <div className="k life-bad" role="alert">{t("profiles.life.loadFailed", { message: failed })}</div>}
          {profileId && !view && !failed && <div className="k">{t("profiles.life.loading")}</div>}
        </div>
      </div>

      {view && (
        <>
          <div className="life-state">
            <label className="life-f">
              <span className="lb">{t("profiles.life.mood")}</span>
              <input
                className="inp"
                value={mood}
                maxLength={24}
                onChange={(e) => setMood(e.target.value)}
                onBlur={() => mood !== view.diary.mood && run(() => saveState(profileId!, { mood }))}
              />
            </label>
            <label className="life-f life-f-wide">
              <span className="lb">{t("profiles.life.plan")}</span>
              <input
                className="inp"
                value={plan}
                maxLength={200}
                onChange={(e) => setPlan(e.target.value)}
                onBlur={() => plan !== view.diary.plan && run(() => saveState(profileId!, { plan }))}
              />
            </label>
          </div>

          <div className="life-actions">
            <button type="button" className="btn cta" disabled={busy} onClick={() => setAsk({ kind: "new", text: "" })}>{t("profiles.life.add")}</button>
            <button type="button" className="btn" disabled={busy || appOff || !form.life.on} onClick={write}>{busy ? t("profiles.life.writing") : t("profiles.life.writeNow")}</button>
          </div>
          {note && <div className="k life-bad" role="alert">{note}</div>}

          {ask?.kind === "new" && editor(ask.text, (text) => setAsk({ kind: "new", text }), () => run(() => saveEntry(profileId!, "new", ask.text)))}

          {entries.length === 0 && ask?.kind !== "new" && (
            <div className="life-empty">
              <h3 className="empty-h">{t("profiles.life.emptyTitle")}</h3>
              <p className="k empty-text">{t("profiles.life.emptyText")}</p>
            </div>
          )}

          <ul className="life-list">
            {entries.map((e) => (
              <li key={e.id} className="life-entry">
                {ask?.kind === "edit" && ask.id === e.id ? (
                  editor(ask.text, (text) => setAsk({ kind: "edit", id: e.id, text }), () => run(() => saveEntry(profileId!, e.id, ask.text)))
                ) : (
                  <>
                    <div className="life-meta">
                      <span>{dayLabel(e, lang)}</span>
                      {e.by === "you" && <span className="life-you">{t("profiles.life.byYou")}</span>}
                    </div>
                    <p className="life-text">{e.text}</p>
                    {ask?.kind === "delete" && ask.id === e.id ? (
                      <div className="life-actions" role="group" aria-label={t("profiles.life.deleteAsk")}>
                        <span className="k">{t("profiles.life.deleteAsk")}</span>
                        <button type="button" className="btn life-danger" disabled={busy} onClick={() => run(() => deleteEntry(profileId!, e.id))}>{t("profiles.life.delete")}</button>
                        <button type="button" className="btn" disabled={busy} onClick={() => setAsk(null)}>{t("profiles.life.keep")}</button>
                      </div>
                    ) : (
                      <div className="life-actions">
                        <button type="button" className="btn" disabled={busy} onClick={() => setAsk({ kind: "edit", id: e.id, text: e.text })}>{t("profiles.life.edit")}</button>
                        <button type="button" className="btn" disabled={busy} onClick={() => setAsk({ kind: "delete", id: e.id })}>{t("profiles.life.delete")}</button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          {entries.length > 0 && (
            <div className="life-actions">
              {ask?.kind === "forget" ? (
                <>
                  <span className="k">{t("profiles.life.forgetAsk")}</span>
                  <button type="button" className="btn life-danger" disabled={busy} onClick={() => run(() => forgetDiary(profileId!))}>{t("profiles.life.forget")}</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setAsk(null)}>{t("profiles.life.keep")}</button>
                </>
              ) : (
                <button type="button" className="btn" disabled={busy} onClick={() => setAsk({ kind: "forget" })}>{t("profiles.life.forget")}</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
