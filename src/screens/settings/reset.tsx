// Settings > Start over (issue #366): clear parts of Social for good and begin again. The user ticks the parts, presses "Clear…",
// and a second step names what goes and that it cannot be undone. Profiles carry their chats and diaries with them, so those two
// are ticked and locked while profiles is ticked. After it Social reloads, so no screen shows what is gone.
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { clearParts, effectiveParts, loadCounts, RESET_PARTS, WITH_PROFILES, type ResetCounts, type ResetPart } from "./reset-api";

type Step = "pick" | "ask" | "busy" | "done";

export function ResetRows() {
  const t = useT();
  const [counts, setCounts] = useState<ResetCounts | null>(null);
  const [chosen, setChosen] = useState<Set<ResetPart>>(new Set());
  const [step, setStep] = useState<Step>("pick");
  const [problem, setProblem] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void loadCounts()
      .then((c) => alive.current && setCounts(c))
      .catch(() => undefined);
    return () => {
      alive.current = false;
    };
  }, []);

  const going = effectiveParts(chosen);
  const locked = (p: ResetPart) => chosen.has("profiles") && WITH_PROFILES.includes(p);
  const toggle = (p: ResetPart) => {
    if (locked(p) || step !== "pick") return;
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  };
  const names = going.map((p) => t(`settings.reset.${p}`)).join(", ");

  const run = async () => {
    setStep("busy");
    setProblem("");
    try {
      await clearParts(going);
      if (!alive.current) return;
      setStep("done");
      // The screens hold what they loaded (profiles, personas, the open topic): start from the disk again.
      if (!PREVIEW) window.setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      if (!alive.current) return;
      setProblem(e instanceof Error ? e.message : String(e));
      setStep("ask");
    }
  };

  return (
    <div className="reset">
      <div className="k reset-lead">{t("settings.reset.lead")}</div>
      <ul className="reset-list" aria-label={t("settings.reset.list")}>
        {RESET_PARTS.map((p) => {
          const n = counts?.[p];
          const on = going.includes(p);
          return (
            <li key={p}>
              <label className={`reset-row${locked(p) ? " is-locked" : ""}`}>
                <input type="checkbox" className="cb" checked={on} disabled={locked(p) || step !== "pick"} onChange={() => toggle(p)} />
                <span className="t">
                  <b>{t(`settings.reset.${p}`)}</b>
                  <span className="k">
                    {t(`settings.reset.${p}.hint`)}
                    {typeof n === "number" && ` ${t("settings.reset.now", { n })}`}
                    {locked(p) && ` ${t("settings.reset.with")}`}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="k">{t("settings.reset.stays")}</div>

      {step === "done" ? (
        <div className="reset-note" role="status">
          {t("settings.reset.done", { parts: names })}
        </div>
      ) : step === "pick" ? (
        <div className="reset-actions">
          <button type="button" className="btn reset-danger" disabled={going.length === 0} onClick={() => setStep("ask")}>
            {t("settings.reset.clear")}
          </button>
        </div>
      ) : (
        <div className="reset-ask" role="alert">
          <span>{t("settings.reset.ask", { parts: names })}</span>
          {problem && <span className="reset-problem">{t("settings.reset.failed", { message: problem })}</span>}
          <div className="reset-actions">
            <button type="button" className="btn reset-danger" disabled={step === "busy"} onClick={() => void run()}>
              {t(step === "busy" ? "settings.reset.busy" : "settings.reset.go")}
            </button>
            <button type="button" className="btn" disabled={step === "busy"} onClick={() => setStep("pick")}>
              {t("settings.reset.keep")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
