// "Memory and conversation" (issue #333): the note the character keeps of older messages (read it, edit it), a new
// conversation (a divider; the character sees nothing from before it, except the note if it is kept) and clearing the
// whole chat. One dialog, a bottom sheet on a phone, with the two questions asked inside it (no browser confirm).
import { useState } from "react";
import { useT } from "@/i18n/index";
import { Dialog } from "@/screens/profiles/dialog";

const NOTE_MAX = 1500;
type Step = "main" | "new" | "clear";

export interface MemoryDialogProps {
  name: string;
  /** The note now ("" = none) and whether the user wrote it. */
  note: string;
  edited: boolean;
  /** How many messages the chat holds. */
  count: number;
  phone: boolean;
  onClose: () => void;
  /** Each resolves with "" when it worked, or an error text. */
  onSave: (text: string) => Promise<string>;
  onNew: (keepNote: boolean) => Promise<{ error: string; warn: boolean }>;
  onClear: () => Promise<string>;
}

export function MemoryDialog(p: MemoryDialogProps) {
  const t = useT();
  const [step, setStep] = useState<Step>("main");
  const [draft, setDraft] = useState(p.note);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const dirty = draft.trim() !== p.note.trim();
  const empty = p.count === 0;

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setError("");
    setInfo("");
    try {
      await job();
    } finally {
      setBusy("");
    }
  };
  const save = () =>
    run(t("messenger.memory.saving"), async () => {
      const err = await p.onSave(draft);
      if (err) setError(t("messenger.memory.failed"));
      else setInfo(t("messenger.memory.saved"));
    });
  const startNew = (keep: boolean) =>
    run(keep ? t("messenger.memory.writing") : t("messenger.memory.starting"), async () => {
      const r = await p.onNew(keep);
      if (r.error) return setError(t("messenger.memory.failed"));
      if (r.warn) {
        setStep("main");
        setInfo(t("messenger.memory.warn"));
        return;
      }
      p.onClose();
    });
  const clearAll = () =>
    run(t("messenger.memory.clearing"), async () => {
      const err = await p.onClear();
      if (err) setError(t("messenger.memory.failed"));
      else p.onClose();
    });

  return (
    <Dialog title={t("messenger.memory.title", { name: p.name })} width={520} sheet={p.phone} onClose={p.onClose}>
      {step === "main" && (
        <>
          <div className="pf-body">
            <div className="f f-wide">
              <label htmlFor="mem-note" className="lb">{t("messenger.memory.note")}</label>
              <textarea
                id="mem-note"
                className="inp inp-area inp-tall"
                rows={7}
                maxLength={NOTE_MAX}
                placeholder={t("messenger.memory.empty")}
                value={draft}
                disabled={!!busy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setInfo("");
                }}
              />
              <div className="k">{p.edited ? t("messenger.memory.byYou") : t("messenger.memory.hint", { name: p.name })}</div>
            </div>
            <div className="mem-start">
              <button type="button" className="btn" disabled={!!busy || empty} onClick={() => setStep("new")}>{t("messenger.memory.new")}</button>
              <button type="button" className="btn" disabled={!!busy || empty} onClick={() => setStep("clear")}>{t("messenger.memory.clear")}</button>
            </div>
            {busy && <div className="k" role="status">{busy}</div>}
            {info && !busy && <div className="k" role="status">{info}</div>}
            {error && <div className="form-err" role="alert">{error}</div>}
          </div>
          <div className="pf-foot">
            <span className="grow" />
            <button type="button" className="btn" onClick={p.onClose}>{t("messenger.memory.close")}</button>
            <button type="button" className="btn cta" disabled={!!busy || !dirty} onClick={() => void save()}>{t("messenger.memory.save")}</button>
          </div>
        </>
      )}
      {step === "new" && (
        <>
          <div className="pf-body">
            <p>{t("messenger.memory.new.text", { name: p.name })}</p>
            <p className="k">{t("messenger.memory.new.note", { name: p.name })}</p>
            {busy && <div className="k" role="status">{busy}</div>}
            {error && <div className="form-err" role="alert">{error}</div>}
          </div>
          <div className="pf-foot stack">
            <span className="grow" />
            <button type="button" className="btn cta" disabled={!!busy} onClick={() => void startNew(true)}>{t("messenger.memory.new.keep")}</button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => void startNew(false)}>{t("messenger.memory.new.drop")}</button>
            <button type="button" className="btn cancel" disabled={!!busy} onClick={() => { setStep("main"); setError(""); }}>{t("messenger.memory.cancel")}</button>
          </div>
        </>
      )}
      {step === "clear" && (
        <>
          <div className="pf-body">
            <p>{t("messenger.memory.clear.text", { n: p.count })}</p>
            {busy && <div className="k" role="status">{busy}</div>}
            {error && <div className="form-err" role="alert">{error}</div>}
          </div>
          <div className="pf-foot stack">
            <span className="grow" />
            <button type="button" className="btn cta" disabled={!!busy} onClick={() => void clearAll()}>{t("messenger.memory.clear.go")}</button>
            <button type="button" className="btn cancel" disabled={!!busy} onClick={() => { setStep("main"); setError(""); }}>{t("messenger.memory.cancel")}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
