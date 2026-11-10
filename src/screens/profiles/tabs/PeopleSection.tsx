// "People she has met": under the diary on the Life tab. The Life plugin counts who the character ran into on the forum and in the
// messenger (seen, spoke to her, she answered) and words an impression of them once a day; the forum and the messenger bring that
// into the prompt. Forgetting a person (or everyone) is the only edit.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { forgetPeople, loadPeople, type Person } from "../people-api";

export function PeopleSection({ profileId }: { profileId: string }) {
  const t = useT();
  const lang = currentLang();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [askAll, setAskAll] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setPeople(null);
    setFailed("");
    loadPeople(profileId)
      .then((v) => alive.current && setPeople(v.people))
      .catch((e: unknown) => alive.current && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive.current = false;
    };
  }, [profileId]);

  const forget = useCallback(
    async (key?: string) => {
      setBusy(true);
      try {
        const v = await forgetPeople(profileId, key);
        if (alive.current) {
          setPeople(v.people);
          setAskAll(false);
        }
      } catch (e) {
        if (alive.current) setFailed(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [profileId],
  );

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
              <span>{t("profiles.people.counts", { seen: String(p.seen), last: day(p.last) })}</span>
            </div>
            {p.said.length > 0 && <p className="life-text">{t("profiles.people.said", { text: p.said[p.said.length - 1].text })}</p>}
            {p.note && <p className="life-text people-note">{p.note}</p>}
            <div className="life-actions">
              <button type="button" className="btn" disabled={busy} aria-label={t("profiles.people.forgetOne", { name: p.name })} onClick={() => forget(p.key)}>
                {t("profiles.people.forget")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {people && people.length > 1 && (
        <div className="life-actions">
          {askAll ? (
            <>
              <span className="k">{t("profiles.people.forgetAllAsk")}</span>
              <button type="button" className="btn life-danger" disabled={busy} onClick={() => forget()}>{t("profiles.people.forgetAll")}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setAskAll(false)}>{t("profiles.life.keep")}</button>
            </>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setAskAll(true)}>{t("profiles.people.forgetAll")}</button>
          )}
        </div>
      )}
    </section>
  );
}
