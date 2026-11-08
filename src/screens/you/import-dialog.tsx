// "Import from Roleplay": the personas there, one click each. Names only are listed; the text of a persona is read
// when one is picked, once, and copied (no model).
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { Dialog } from "../profiles/dialog";
import { errorText } from "../profiles/persist";
import { scanPersonas } from "./api";
import { MOCK_ROLEPLAY, haveFrom, type PersonaScan, type YouState } from "./model";

type Phase = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "scan"; scan: PersonaScan };

export function ImportDialog({ you, phone, preview, onPick, onClose }: { you: YouState; phone: boolean; preview?: "closed"; onPick: (rpId: string) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>(() => {
    if (!PREVIEW) return { kind: "loading" };
    return { kind: "scan", scan: preview === "closed" ? { state: "closed" } : { state: "ready", personas: MOCK_ROLEPLAY, truncated: false } };
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (PREVIEW) return;
    let live = true;
    scanPersonas()
      .then((scan) => live && setPhase({ kind: "scan", scan }))
      .catch((e) => live && setPhase({ kind: "failed", message: errorText(e) }));
    return () => {
      live = false;
    };
  }, []);

  const pick = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await onPick(id);
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  };

  const scan = phase.kind === "scan" ? phase.scan : null;
  return (
    <Dialog title={t("you.import.title")} width={520} sheet={phone} onClose={onClose}>
      <div className="pf-body" aria-busy={phase.kind === "loading"}>
        {phase.kind === "loading" && <p className="k">{t("you.import.loading")}</p>}
        {phase.kind === "failed" && <p role="alert">{t("you.import.failed", { message: phase.message })}</p>}
        {scan?.state === "closed" && <p>{t(PREVIEW ? "you.import.closedPreview" : "you.import.closed")}</p>}
        {scan?.state === "ready" && scan.personas.length === 0 && <p>{t("you.import.empty")}</p>}
        {scan?.state === "ready" && scan.personas.length > 0 && <p className="k">{t("you.import.intro")}</p>}
      </div>
      {scan?.state === "ready" && scan.personas.length > 0 && (
        <div className="pf-list">
          {scan.personas.map((p) => {
            const have = haveFrom(you, p.id);
            return (
              <button key={p.id} type="button" className="row you-pick" disabled={have || !!busy} onClick={() => pick(p.id)}>
                <Avatar name={p.name} hue={p.hue} size={32} />
                <span className="t">
                  <span className="nm">{p.name}</span>
                </span>
                {have ? <span className="tag muted">{t("you.import.have")}</span> : <span className="chip">{busy === p.id ? t("you.import.busy") : t("you.import.add")}</span>}
              </button>
            );
          })}
        </div>
      )}
      {scan?.state === "ready" && scan.truncated && <p className="pf-note">{t("you.import.truncated")}</p>}
      {error && (
        <p className="pf-note" role="alert">
          {t("you.import.failed", { message: error })}
        </p>
      )}
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("you.close")}</button>
      </div>
    </Dialog>
  );
}
