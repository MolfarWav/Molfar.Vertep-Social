// "Invent with the model" under the signature words (#375): the model reads the saved profile and proposes a few words and turns of speech;
// the user keeps the ones they like in a review (a checkbox each, all on), like "Fill empty". Nothing is added until "Add selected".
import { useRef, useState } from "react";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { Dialog } from "../dialog";
import { Gl } from "../glyphs";
import { NoModelLine } from "../fill-ui";
import { inventWords } from "../model-api";

type Phase = "idle" | "busy" | "fail" | "none" | "nomodel" | "full";

export const WORDS_MAX = 12;

export function WordsInvent({ name, profileId, have, onAdd }: { name: string; profileId?: string; have: string[]; onAdd: (words: string[]) => void }) {
  const t = useT();
  const phone = useIsPhone();
  const [phase, setPhase] = useState<Phase>("idle");
  const [review, setReview] = useState<{ words: string[]; on: boolean[] } | null>(null);
  // a counter that tells a stopped run's late answer from the current one
  const run = useRef(0);

  const start = async () => {
    if (!profileId) return;
    if (have.length >= WORDS_MAX) {
      setPhase("full");
      return;
    }
    const mine = ++run.current;
    setPhase("busy");
    const r = await inventWords(profileId);
    if (mine !== run.current) return;
    if (!r.ok) {
      setPhase(r.code === "no-model" ? "nomodel" : "fail");
      return;
    }
    const fresh = r.words.filter((w) => !have.some((x) => x.toLowerCase() === w.toLowerCase()));
    if (fresh.length === 0) {
      setPhase("none");
      return;
    }
    setPhase("idle");
    setReview({ words: fresh, on: fresh.map(() => true) });
  };
  const stop = () => {
    run.current++;
    setPhase("idle");
  };
  const chosen = review ? review.words.filter((_, i) => review.on[i]) : [];

  return (
    <div className="words-invent">
      {phase === "busy" ? (
        <div className="fill-run" role="status">
          <span className="spin" aria-hidden="true" />
          <span>{t("profiles.model.thinking")}</span>
          <button type="button" className="btn" onClick={stop}>{t("profiles.model.stop")}</button>
        </div>
      ) : (
        <button type="button" className="btn" disabled={!profileId} onClick={start}>
          <Gl name="spark" size={15} />
          {t("profiles.voice.wordsInvent")}
        </button>
      )}
      {!profileId && <p className="k">{t("profiles.voice.wordsUnsaved")}</p>}
      {phase === "fail" && (
        <div className="fill-msg" role="alert">
          <span>{t("profiles.fill.failMsg")}</span>
          <button type="button" className="linkbtn" onClick={start}>{t("profiles.model.retry")}</button>
        </div>
      )}
      {phase === "none" && <p className="fill-msg k">{t("profiles.voice.wordsNone")}</p>}
      {phase === "full" && <p className="fill-msg k">{t("profiles.voice.wordsFull")}</p>}
      {phase === "nomodel" && <NoModelLine />}
      {review && (
        <Dialog title={t("profiles.voice.wordsTitle")} width={520} sheet={phone} onClose={() => setReview(null)}>
          <div className="pf-body">
            <p className="k">{t("profiles.voice.wordsIntro", { name })}</p>
            <div className="fill-list">
              {review.words.map((w, i) => (
                <label key={w} className="fill-item">
                  <input type="checkbox" checked={review.on[i]} onChange={(e) => setReview({ ...review, on: review.on.map((v, j) => (j === i ? e.target.checked : v)) })} />
                  <span className="fill-text"><span className="fill-val">{w}</span></span>
                </label>
              ))}
            </div>
          </div>
          <div className="pf-foot">
            <span className="grow" />
            <button type="button" className="btn" onClick={() => setReview(null)}>{t("profiles.fill.discard")}</button>
            <button
              type="button"
              className="btn cta"
              disabled={chosen.length === 0}
              onClick={() => {
                onAdd(chosen);
                setReview(null);
              }}
            >
              {t("profiles.voice.wordsApply")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
