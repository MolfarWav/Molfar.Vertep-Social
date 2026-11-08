// "Fill empty": the status line and button under the About note (desktop: in
// the note's row; phone: a 44px button under the note), and the review dialog
// that lists the model's proposals with a checkbox each (all on by default).
import { useState } from "react";
import { useT } from "@/i18n/index";
import { useNav } from "@/shell/nav";
import { Dialog } from "./dialog";
import type { FillItem, FillKey } from "./fill";

export type FillPhase = "busy" | "fail" | "nomodel" | "none";

export interface FillProps {
  /** How many fields are empty now. */
  empty: number;
  /** The run's phase when it is showing a status; null when idle. */
  phase: FillPhase | null;
  layout: "desk" | "phone";
  onStart: () => void;
  onStop: () => void;
}

const FIELD_LABEL: Record<FillKey, string> = {
  about: "profiles.fill.field.about",
  interests: "profiles.fill.field.interests",
  habits: "profiles.fill.field.habits",
  voiceText: "profiles.fill.field.voiceText",
  rank: "profiles.fill.field.rank",
  signature: "profiles.fill.field.signature",
};

export function FillActions({ fill }: { fill: FillProps }) {
  const t = useT();
  const busy = fill.phase === "busy";
  const phone = fill.layout === "phone";
  const nothing = fill.empty === 0;

  return (
    <div className={`fill ${phone ? "fill-phone" : "fill-desk"}`}>
      {busy ? (
        <div className="fill-run" role="status">
          <span className="spin" aria-hidden="true" />
          <span>{t("profiles.model.thinking")}</span>
          <button type="button" className="btn" onClick={fill.onStop}>{t("profiles.model.stop")}</button>
        </div>
      ) : (
        <button type="button" className={`btn${phone ? " fill-btn" : ""}`} disabled={nothing} onClick={fill.onStart}>
          {t("profiles.fill.button")}
        </button>
      )}
      {!busy && nothing && <span className="sys">{t("profiles.fill.nothing")}</span>}
      {fill.phase === "fail" && (
        <div className="fill-msg" role="alert">
          <span>{t("profiles.fill.failMsg")}</span>
          <button type="button" className="linkbtn" onClick={fill.onStart}>{t("profiles.model.retry")}</button>
        </div>
      )}
      {fill.phase === "none" && <p className="fill-msg k">{t("profiles.fill.none")}</p>}
      {fill.phase === "nomodel" && <NoModelLine />}
    </div>
  );
}

/** "No model is chosen for importing profiles" with a link to the settings. */
export function NoModelLine() {
  const t = useT();
  const { go } = useNav();
  return (
    <div className="fill-msg" role="alert">
      <span>{t("profiles.model.none")}</span>
      <button type="button" className="linkbtn" onClick={() => go("settings")}>{t("profiles.model.choose")}</button>
    </div>
  );
}

const shown = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);

/** The review: the proposals as checkboxes, all on; Apply writes the chosen ones. */
export function FillReview({ items, onDiscard, onApply }: { items: FillItem[]; onDiscard: () => void; onApply: (chosen: FillItem[]) => void }) {
  const t = useT();
  const [on, setOn] = useState(() => items.map(() => true));
  const chosen = items.filter((_, i) => on[i]);
  return (
    <Dialog title={t("profiles.fill.title")} width={560} onClose={onDiscard}>
      <div className="pf-body">
        <p className="k">{t("profiles.fill.intro")}</p>
        <div className="fill-list">
          {items.map((it, i) => (
            <label key={it.key} className="fill-item">
              <input
                type="checkbox"
                checked={on[i]}
                onChange={(e) => setOn((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
              />
              <span className="fill-text">
                <span className="fill-field">{t(FIELD_LABEL[it.key])}</span>
                <span className="fill-val">{shown(it.value)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onDiscard}>{t("profiles.fill.discard")}</button>
        <button type="button" className="btn cta" disabled={chosen.length === 0} onClick={() => onApply(chosen)}>{t("profiles.fill.apply")}</button>
      </div>
    </Dialog>
  );
}

