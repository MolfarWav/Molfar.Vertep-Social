// Two question dialogs of the editor: "Оновити з Roleplay: що зміниться" (the
// diff a new card reading would make) and leaving with unsaved changes.
import { useT } from "@/i18n/index";
import { UPDATE_DIFF } from "@/mock/profiles-import";
import { Dialog } from "./dialog";

export function DiffDialog({ name, profileId, onClose, onAccept }: { name: string; profileId: string; onClose: () => void; onAccept: () => void }) {
  const t = useT();
  // The mock diff is for Мавка's card; other cards report no change.
  const hasDiff = profileId === "mavka";
  return (
    <Dialog title={t("profiles.diff.title", { name })} width={620} onClose={onClose}>
      <div className="pf-body">
        {hasDiff ? (
          <>
            <p className="k">{t("profiles.diff.intro")}</p>
            <div className="diff">
              {UPDATE_DIFF.removed.map((x) => (
                <div key={x} className="del">{x}</div>
              ))}
              {UPDATE_DIFF.added.map((x) => (
                <div key={x} className="add">{x}</div>
              ))}
            </div>
          </>
        ) : (
          <p>{t("profiles.diff.none")}</p>
        )}
      </div>
      <div className="pf-foot">
        <span className="grow" />
        {hasDiff ? (
          <>
            <button type="button" className="btn" onClick={onClose}>{t("profiles.diff.keep")}</button>
            <button type="button" className="btn cta" onClick={onAccept}>{t("profiles.diff.accept")}</button>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose}>{t("profiles.diff.close")}</button>
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
