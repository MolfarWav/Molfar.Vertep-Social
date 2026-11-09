// The question dialogs of the editor: "Оновити з Roleplay: що зміниться" (the
// diff a new card reading would make), deleting a profile, and leaving with unsaved changes.
import { Fragment } from "react";
import { useT } from "@/i18n/index";
import { Dialog } from "./dialog";
import type { DiffRow, UpdateDiff } from "./import-api";

/** What the update dialog shows: the card is being read again, the read failed, or the result (null: no change). */
export type DiffView = { phase: "busy" } | { phase: "fail"; message: string } | { phase: "diff"; diff: UpdateDiff | null; cardDate?: string; cardHash?: string };

const FIELD_KEY: Record<DiffRow["field"], string> = { about: "profiles.tab.about", voice: "profiles.tab.voice", interests: "profiles.about.interests" };

export function DiffDialog({ name, view, labels, onClose, onAccept, onRetry }: { name: string; view: DiffView; labels: boolean; onClose: () => void; onAccept: () => void; onRetry: () => void }) {
  const t = useT();
  const diff = view.phase === "diff" ? view.diff : null;
  return (
    <Dialog title={t("profiles.diff.title", { name })} width={620} onClose={onClose}>
      <div className="pf-body" aria-busy={view.phase === "busy"}>
        {view.phase === "busy" ? (
          <p className="k">{t("profiles.diff.busy")}</p>
        ) : view.phase === "fail" ? (
          <p role="alert">{t("profiles.diff.failed", { message: view.message })}</p>
        ) : diff ? (
          <>
            <p className="k">{t("profiles.diff.intro")}</p>
            <div className="diff">
              {diff.rows.map((row) => (
                <Fragment key={row.field}>
                  {labels && <div className="dl">{t(FIELD_KEY[row.field])}</div>}
                  {row.removed.map((x) => (
                    <div key={`d-${x}`} className="del">{x}</div>
                  ))}
                  {row.added.map((x) => (
                    <div key={`a-${x}`} className="add">{x}</div>
                  ))}
                </Fragment>
              ))}
            </div>
          </>
        ) : (
          <p>{t("profiles.diff.none")}</p>
        )}
      </div>
      <div className="pf-foot">
        <span className="grow" />
        {view.phase === "fail" ? (
          <>
            <button type="button" className="btn" onClick={onClose}>{t("profiles.diff.close")}</button>
            <button type="button" className="btn cta" onClick={onRetry}>{t("profiles.retry")}</button>
          </>
        ) : diff ? (
          <>
            <button type="button" className="btn" onClick={onClose}>{t("profiles.diff.keep")}</button>
            <button type="button" className="btn cta" onClick={onAccept}>{t("profiles.diff.accept")}</button>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose}>{view.phase === "busy" ? t("profiles.import.cancel") : t("profiles.diff.close")}</button>
        )}
      </div>
    </Dialog>
  );
}

/** "Delete profile": the question before the profile is removed on the engine. */
export function DeleteDialog({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  return (
    <Dialog title={t("profiles.delete.title", { name })} width={520} onClose={onCancel}>
      <div className="pf-body">
        <p>{t("profiles.delete.text")}</p>
      </div>
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onCancel}>{t("profiles.delete.cancel")}</button>
        <button type="button" className="btn cta" onClick={onConfirm}>{t("profiles.delete.confirm")}</button>
      </div>
    </Dialog>
  );
}

export function UnsavedDialog({ name, sections, onDiscard, onStay, onSave }: { name: string; sections: string[]; onDiscard: () => void; onStay: () => void; onSave: () => void }) {
  const t = useT();
  const list = sections.map((k) => t(k)).join(", ");
  return (
    <Dialog title={t("profiles.unsaved.title")} width={520} onClose={onStay}>
      <div className="pf-body">
        <p>{t("profiles.unsaved.text", { name, sections: list })}</p>
      </div>
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onDiscard}>{t("profiles.unsaved.discard")}</button>
        <button type="button" className="btn" onClick={onStay}>{t("profiles.unsaved.stay")}</button>
        <button type="button" className="btn cta" onClick={onSave}>{t("profiles.save.save")}</button>
      </div>
    </Dialog>
  );
}
