// Your profile: who you are in Social. Opened from the "You" chip (desktop) or from Settings (phone).
// A few personas (a name, a picture and a short About); one is in use, and the messenger tells a character that
// one's name and About. A persona can be brought in from a Roleplay persona (once, no model) or written here.
// Edits are a draft until Save, as in the profile editor.
//
// Preview parameters (`?screen=you&...`): state=empty (no persona yet), dialog=import|importclosed|picture|delete,
// dirty=1 (the first persona starts with an unsaved edit), new=1 (writing a new persona).
import "../profiles/profiles.css";
import "./you.css";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { useIsPhone } from "@/lib/use-phone";
import { useChrome, useNav } from "@/shell/nav";
import { ActionMenu, type MenuItem } from "../profiles/menu";
import { Dialog } from "../profiles/dialog";
import { Field } from "../profiles/ui";
import { PictureDialog } from "../profiles/picture-dialog";
import { errorText } from "../profiles/persist";
import { deletePersona, importPersona, savePersona, setActive } from "./api";
import { ImportDialog } from "./import-dialog";
import { ABOUT_MAX, EMPTY_YOU, MOCK_ROLEPLAY, NAME_MAX, blankDraft, canSave, draftOf, newPersonaId, personaFrom, sameDraft, withActive, withSaved, withoutPersona, type Draft, type Persona, type YouState } from "./model";
import { setYou, useYou } from "./store";

const param = (k: string): string => {
  if (!PREVIEW) return "";
  try {
    return new URLSearchParams(location.search).get(k) ?? "";
  } catch {
    return "";
  }
};

/** Drafts live outside the component, so leaving for another tab does not lose an unsaved edit. */
let kept: Record<string, Draft> = {};

const BackIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Dlg = "import" | "picture" | "delete" | null;

export function You() {
  const phone = useIsPhone();
  useChrome({ bar: false });
  const t = useT();
  const { go } = useNav();
  const known = useYou();
  const you: YouState = known ?? EMPTY_YOU;

  const [creating, setCreating] = useState<string | null>(() => (param("new") === "1" ? "u-new" : null));
  // the persona being edited; "" (or one that is gone) follows the active one, which is also right while the list loads
  const [picked, setSel] = useState<string>(() => (param("new") === "1" ? "u-new" : ""));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const d = { ...kept };
    if (param("dirty") === "1" && you.personas[0]) d[you.personas[0].id] = { ...draftOf(you.personas[0]), about: you.personas[0].about + " Пишу також у вихідні." };
    return d;
  });
  const [dlg, setDlg] = useState<Dlg>(() => (param("dialog") === "import" || param("dialog") === "importclosed" ? "import" : param("dialog") === "picture" ? "picture" : param("dialog") === "delete" ? "delete" : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sel = you.personas.some((p) => p.id === picked) || (!!creating && picked === creating) ? picked : you.active;
  const saved: Persona | undefined = you.personas.find((p) => p.id === sel);
  const isNew = !saved && sel === creating;
  const draft: Draft | null = saved || isNew ? (drafts[sel] ?? (saved ? draftOf(saved) : blankDraft())) : null;
  const dirty = !!draft && (saved ? !sameDraft(draft, draftOf(saved)) : !sameDraft(draft, blankDraft()));

  const keep = (next: Record<string, Draft>) => {
    kept = next;
    setDrafts(next);
  };
  const edit = (patch: Partial<Draft>) => {
    if (!draft) return;
    keep({ ...drafts, [sel]: { ...draft, ...patch } });
  };
  const drop = (id: string) => {
    const { [id]: _gone, ...rest } = drafts;
    keep(rest);
  };
  const commit = (next: YouState) => setYou(next);

  const write = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    draft && canSave(draft)
      ? write(async () => {
          const p = personaFrom(sel, draft, saved);
          commit(PREVIEW ? withSaved(you, p) : await savePersona(p));
          drop(sel);
          setCreating(null);
        })
      : undefined;

  const discard = () => {
    drop(sel);
    if (isNew) {
      setCreating(null);
      setSel("");
    }
  };

  /** Another persona: a new one nobody has typed in is dropped, so no empty "New persona" is left behind. */
  const pick = (id: string) => {
    if (creating && id !== creating && !drafts[creating]) setCreating(null);
    setSel(id);
  };

  const startNew = () => {
    const id = creating ?? newPersonaId(you.personas.map((p) => p.id));
    setCreating(id);
    setSel(id);
    setError("");
  };

  const remove = () =>
    write(async () => {
      commit(PREVIEW ? withoutPersona(you, sel) : await deletePersona(sel));
      drop(sel);
      setDlg(null);
      setSel("");
    });

  const use = () => write(async () => commit(PREVIEW ? withActive(you, sel) : await setActive(sel)));

  const bringIn = async (rpId: string) => {
    if (PREVIEW) {
      const row = MOCK_ROLEPLAY.find((r) => r.id === rpId);
      const p: Persona = { id: "pe-" + rpId, name: row?.name ?? rpId, hue: row?.hue ?? 120, about: "", picture: "", from: { kind: "persona", id: rpId } };
      commit(withSaved(you, p));
      setSel(p.id);
      setDlg(null);
      return;
    }
    const got = await importPersona(rpId);
    commit(got.you);
    setSel(got.persona.id);
    setDlg(null);
  };

  const items: { id: string; name: string; hue: number; picture: string }[] = [
    ...you.personas.map((p) => ({ id: p.id, name: drafts[p.id]?.name.trim() || p.name, hue: p.hue, picture: drafts[p.id]?.picture ?? p.picture })),
    ...(creating && !saved ? [{ id: creating, name: drafts[creating]?.name.trim() || t("you.new"), hue: 200, picture: drafts[creating]?.picture ?? "" }] : []),
  ];

  const addMenu: MenuItem[] = [
    { key: "import", label: t("you.add.import"), onSelect: () => setDlg("import") },
    { key: "new", label: t("you.add.write"), onSelect: startNew },
  ];

  const header = phone ? (
    <header className="hd">
      <button type="button" className="hbtn" aria-label={t("you.back")} onClick={() => go("settings")}>
        <BackIcon />
      </button>
      <h1 className="hd-title you-title">{t("you.title")}</h1>
      <ActionMenu className="btn" label={t("you.add")} items={addMenu} trigger={t("you.add")} />
    </header>
  ) : (
    <div className="you-head">
      <div>
        <h1 className="you-h">{t("you.title")}</h1>
        <p className="k">{t("you.subtitle")}</p>
      </div>
      <ActionMenu className="btn" label={t("you.add")} items={addMenu} trigger={`+ ${t("you.add")}`} />
    </div>
  );

  const body =
    known === null ? (
      <p className="k you-note" aria-busy="true">{t("you.loading")}</p>
    ) : items.length === 0 ? (
      <div className="you-empty">
        <p>{t("you.empty.text")}</p>
        <div className="you-empty-btns">
          <button type="button" className="btn cta" onClick={() => setDlg("import")}>{t("you.add.import")}</button>
          <button type="button" className="btn" onClick={startNew}>{t("you.add.write")}</button>
        </div>
      </div>
    ) : (
      <>
        <div className="you-list" role="group" aria-label={t("you.list")}>
          {items.map((p) => (
            <button key={p.id} type="button" className={`you-p${p.id === sel ? " on" : ""}`} aria-pressed={p.id === sel} onClick={() => pick(p.id)}>
              <Avatar name={p.name} hue={p.hue} size={32} picture={p.picture || undefined} />
              <span className="you-pn">{p.name}</span>
              {p.id === you.active && <span className="chip you-use">{t("you.inUse")}</span>}
            </button>
          ))}
        </div>
        {draft && (
          <section className="you-ed" aria-label={draft.name || t("you.new")}>
            <div className="you-top">
              <button type="button" className="pic-btn pic-btn-big" aria-label={t("profiles.picture.open", { name: draft.name || t("you.new") })} title={t("profiles.picture.menu")} onClick={() => setDlg("picture")}>
                <Avatar name={draft.name || "?"} hue={saved ? saved.hue : 200} size={64} radius={8} picture={draft.picture || undefined} />
                <span className="pic-badge" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                </span>
              </button>
              <div className="you-top-t">
                {saved && saved.id !== you.active && <button type="button" className="btn you-usebtn" disabled={busy} onClick={use}>{t("you.use")}</button>}
                <span className="k">{saved?.from ? t("you.fromRoleplay") : isNew ? t("you.writtenHere.new") : t("you.writtenHere")}</span>
              </div>
            </div>
            <Field label={t("you.name")}>
              {(id) => <input id={id} className="inp" value={draft.name} maxLength={NAME_MAX} onChange={(e) => edit({ name: e.target.value })} />}
            </Field>
            <Field label={t("you.about")}>
              {(id) => <textarea id={id} className="inp inp-area you-area" rows={6} value={draft.about} maxLength={ABOUT_MAX} onChange={(e) => edit({ about: e.target.value })} />}
            </Field>
            <p className="k">{t("you.note", { n: draft.about.length, max: ABOUT_MAX })}</p>
            {error && <p className="you-err" role="alert">{t("you.failed", { message: error })}</p>}
            {saved && (
              <div>
                <button type="button" className="btn you-del" disabled={busy} onClick={() => setDlg("delete")}>{t("you.delete")}</button>
              </div>
            )}
          </section>
        )}
      </>
    );

  return (
    <div className={`s-profiles s-you ${phone ? "is-phone" : "is-desk"}`}>
      {header}
      <div className="you-scroll">
        <div className="you-page">{body}</div>
      </div>
      {dirty && (
        <div className="sv you-sv" role="region" aria-label={t("profiles.save.unsaved")}>
          <span className="warn">{draft && !canSave(draft) ? t("you.needName") : t("profiles.save.unsaved")}</span>
          <button type="button" className="btn" disabled={busy} onClick={discard}>{t("profiles.save.cancel")}</button>
          <button type="button" className="btn cta" disabled={busy || !draft || !canSave(draft)} onClick={save}>{t("profiles.save.save")}</button>
        </div>
      )}
      {dlg === "import" && <ImportDialog you={you} phone={phone} preview={param("dialog") === "importclosed" ? "closed" : undefined} onPick={bringIn} onClose={() => setDlg(null)} />}
      {dlg === "picture" && draft && (
        <PictureDialog
          name={draft.name || t("you.new")}
          hue={saved ? saved.hue : 200}
          about={draft.about}
          interests={[]}
          current={draft.picture}
          phone={phone}
          onUse={(picture) => edit({ picture })}
          onRemove={() => edit({ picture: "" })}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === "delete" && saved && (
        <Dialog title={t("you.delete.title", { name: saved.name })} width={520} sheet={phone} onClose={() => setDlg(null)}>
          <div className="pf-body">
            <p>{t("you.delete.text")}</p>
          </div>
          <div className="pf-foot">
            <span className="grow" />
            <button type="button" className="btn" onClick={() => setDlg(null)}>{t("profiles.delete.cancel")}</button>
            <button type="button" className="btn cta" disabled={busy} onClick={remove}>{t("you.delete.confirm")}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
