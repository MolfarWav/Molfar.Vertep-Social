// "People she has met": under the diary on the Life tab. The Life plugin counts who the character ran into on the forum and in the
// messenger (seen, spoke to her, she answered) and words an impression of them once a day; the forum and the messenger bring that
// into the prompt. The user may reword an impression, forget a person or everyone. Below: the other characters that remember her.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { forgetPeople, loadPeople, saveNote, type KnownBy, type Person } from "../people-api";

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
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setPeople(null);
    setFailed("");
    setEdit(null);
    loadPeople(profileId)
      .then((v) => {
        if (!alive.current) return;
        setPeople(v.people);
        setKnownBy(v.knownBy ?? []);
      })
      .catch((e: unknown) => alive.current && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive.current = false;
    };
  }, [profileId]);

  const run = useCallback(async (job: () => Promise<{ people: Person[] }>) => {
    setBusy(true);
    try {
      const v = await job();
      if (alive.current) {
        setPeople(v.people);
        setAskAll(false);
        setEdit(null);
      }
    } catch (e) {
      if (alive.current) setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const day = (ms: number) => new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "long" });

  return (
    <section className="people" aria-label={t("profiles.people.title")}>
      <h3 className="people-h">{t("profiles.people.title")}</h3>
      <p className="k">{t("profiles.people.note")}</p>
      {failed && <div className="k life-bad" role="alert">{failed}</div>}
      {people && people.length === 0 && !failed && <p className="k">{t("profiles.people.empty")}</p>}
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
            {p.said.length > 0 && <p className="life-text">{t("profiles.people.said", { text: p.said[p.said.length - 1].text })}</p>}
            {edit?.key === p.key ? (
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
                  <button type="button" className="btn" disabled={busy} aria-label={t("profiles.people.editOne", { name: p.name })} onClick={() => setEdit({ key: p.key, text: p.note })}>
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
