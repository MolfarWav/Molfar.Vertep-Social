// Profiles screen: the list (search, source filter, rows) and the editor
// (About, Voice, Statuses, Forum, Habits). Desktop: list column + editor.
// Phone: the list; a tap opens the editor full screen with a back button.
// With no profiles: the first-run state. Dialogs: the Roleplay import (pick,
// run), the update diff, the unsaved-changes question on leaving, "Fill empty"
// (review of the model's proposals) and "New profile" (choice, short interview).
//
// App mode (no `?screen=`): the profiles load from the plugin on mount, a saved
// change is sent to it (persist.ts), and "Delete profile" removes one. The
// Roleplay import is not offered yet (it needs an engine grant). Preview mode
// keeps the mock data and the mock model calls.
//
// Preview parameters (`?screen=profiles&...`, read once on load):
//   view=editor   phone only: open the editor of the first profile
//   view=import   no profiles yet, with the import dialog open
//   tab=about|voice|statuses|forum|habits|model   the editor tab (desktop and phone)
//   dialog=picture   the picture dialog open in the editor (picture=fail | nomodel: the generation fails)
//   picker=1      with tab=model: the searchable model picker of the installed app, over mock models
//   q=<text>      prefill the search
//   source=all|roleplay|own|persona         prefill the source filter
//   dirty=1       the first profile starts with a draft (the save bar shows, phone and desktop)
//   state=firstrun      no profiles: the first-run state
//   state=importing     the import run, frozen at 4 of 9
//   state=importfail    the import run, one card failed
//   state=diff          "Оновити з Roleplay: що зміниться" open on Мавка
//   state=habits-empty  Мавка has no habits; the Habits tab shows the empty state
//   state=unsaved       Мавка has an unsaved draft; the leave question is open
//   view=new            "New profile": the choice dialog (bottom sheet on phone)
//   view=interview      "New profile", the interview step 1 (describe the character)
//   view=interview2     "New profile", step 2 with three canned drafts
//   view=questionnaire  "New profile", the five plain questions (no model)
//   state=newfile       "New profile", "From a file" with a sample text cut at 12000 characters
//   seed=<n>            the example ideas of the interview are fixed (default: random)
//   state=newfail       the interview step 1 with "the model did not answer" shown
//   state=newnomodel    the interview step 1 with "No model is chosen" shown
//   state=fill         Ярина (her empty fields) with the "Fill empty" review open
//   state=fillbusy     Ярина, "Fill empty" running (frozen: Stop, no result)
//   state=fillfail     Ярина, "Fill empty" failed (Try again)
//   state=fillnone     Ярина, "Fill empty" returned nothing
//   state=fillnomodel  Ярина, "Fill empty" with no model chosen
//
// For later work. Exports:
//   Profiles              the screen (the shell imports this)
//   ProfileListDesktop, ProfileListPhone, ListProps   the list; `onImport` opens the import dialog
//   ProfileEditor, PhoneEditor, EditorProps, formOf   the editor
//   ActionMenu, MenuItem                              the "⋯" popup (menu.tsx)
//   FillActions, FillReview, FillProps, FillPhase     "Fill empty" (fill-ui.tsx); fill.ts has the rules
//   NewProfileFlow, profileFromDraft, blankProfile    "New profile" (newprofile.tsx)
//   TabId, TAB_IDS, TabProps   the editor tabs (tabs/*.tsx)
//   ImportDialog, ImportRun, FirstRun, createLabel    the import flow (import.tsx)
//   Dialog                                            the modal (dialog.tsx): role=dialog, focus, Escape
//   DiffDialog, UnsavedDialog                         the two question dialogs (states.tsx)
//   filterProfiles, splitMatch, countBySource, SourceFilter   search helpers
//   Seg, Slider, Switch, Chip, Field                  the shared controls (ui.tsx)
import "./profiles.css";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/index";
import { PREVIEW, call } from "@/lib/api";
import { useIsPhone } from "@/lib/use-phone";
import { PROFILES, type MockProfile, type ProfileForm } from "@/mock/profiles";
import { IMPORT_ENTRIES, UPDATE_DIFF, profileFromEntry, type ImportEntry } from "@/mock/profiles-import";
import { fillEmpty, mockScript, previewFile, previewInterview, previewProposal } from "./model-api";
import { ProfileEditor, PhoneEditor, formOf } from "./editor";
import { ProfileListDesktop, ProfileListPhone } from "./list";
import { ImportDialog, ImportRun, FirstRun, type RunPreview } from "./import";
import { DeleteDialog, DiffDialog, UnsavedDialog } from "./states";
import { FillReview, type FillPhase } from "./fill-ui";
import { applyProposals, emptyKeys, itemsOf, recordOf, type FillItem } from "./fill";
import { errorText, fullProfile, stripStamps, sync } from "./persist";
import { NewProfileFlow, type NewStart } from "./newprofile";
import { isFilter, type SourceFilter } from "./search";
import { isTab, type TabId } from "./tabs/types";

export { ProfileListDesktop, ProfileListPhone, type ListProps } from "./list";
export { ProfileEditor, PhoneEditor, formOf, type EditorProps } from "./editor";
export { TAB_IDS, isTab, type TabId, type TabProps } from "./tabs/types";
export { ImportDialog, ImportRun, FirstRun, createLabel } from "./import";
export { Dialog } from "./dialog";
export { DiffDialog, UnsavedDialog } from "./states";
export { ActionMenu, type MenuItem } from "./menu";
export { FillActions, FillReview, type FillProps, type FillPhase } from "./fill-ui";
export { NewProfileFlow, profileFromDraft, blankProfile, type NewStart } from "./newprofile";
export { filterProfiles, splitMatch, countBySource, FILTERS, type SourceFilter } from "./search";
export { Seg, Slider, Switch, Chip, Field } from "./ui";

interface Preview {
  view: string | null;
  tab: string | null;
  q: string;
  source: string | null;
  dirty: boolean;
  state: string | null;
  /** Seeds the example ideas of the interview (preview only). */
  seed: number | undefined;
}

/** "Fill empty" run: the profile it belongs to, its phase, and the proposals to review. */
interface FillRun {
  id: string;
  phase: FillPhase | "review";
  items: FillItem[];
}

const YARYNA = "yaryna";

function readPreview(): Preview {
  try {
    const p = new URLSearchParams(location.search);
    return {
      view: p.get("view"),
      tab: p.get("tab"),
      q: p.get("q") ?? "",
      source: p.get("source"),
      dirty: p.get("dirty") === "1",
      state: p.get("state"),
      seed: p.get("seed") === null || p.get("seed") === "" ? undefined : Number(p.get("seed")),
    };
  } catch {
    return { view: null, tab: null, q: "", source: null, dirty: false, state: null, seed: undefined };
  }
}


/** The profiles, the saved form of each, and the drafts not saved yet. */
interface Store {
  all: MockProfile[];
  saved: Record<string, ProfileForm>;
  drafts: Record<string, ProfileForm>;
}

function makeStore(pv: Preview): Store {
  // The app starts empty and loads the profiles from the plugin.
  if (!PREVIEW) return { all: [], saved: {}, drafts: {} };
  const none = pv.state === "firstrun" || pv.view === "import";
  const all = none ? [] : PROFILES.map((p) => (pv.state === "habits-empty" && p.id === "mavka" ? { ...p, habits: [] } : p));
  const saved = Object.fromEntries(all.map((p) => [p.id, formOf(p)]));
  const drafts: Record<string, ProfileForm> = {};
  const first = all[0];
  if (first && (pv.state === "unsaved" || pv.dirty)) {
    const base = saved[first.id];
    drafts[first.id] =
      pv.state === "unsaved"
        ? { ...base, about: `${base.about}.`, interests: [...base.interests, "тини"] }
        : { ...base, about: `${base.about} ` };
  }
  return { all, saved, drafts };
}

const withDraft = (s: Store, id: string, patch: Partial<ProfileForm>): Store => ({
  ...s,
  drafts: { ...s.drafts, [id]: { ...(s.drafts[id] ?? s.saved[id]), ...patch } },
});
const saveDraft = (s: Store, id: string): Store => {
  const drafts = { ...s.drafts };
  const v = drafts[id];
  delete drafts[id];
  return { ...s, drafts, saved: v ? { ...s.saved, [id]: v } : s.saved };
};
const dropDraft = (s: Store, id: string): Store => {
  const drafts = { ...s.drafts };
  delete drafts[id];
  return { ...s, drafts };
};
/** The profile removed: its saved form and its draft go with it. */
const dropProfile = (s: Store, id: string): Store => {
  const saved = { ...s.saved };
  delete saved[id];
  return { ...dropDraft(s, id), all: s.all.filter((p) => p.id !== id), saved };
};

/** Which editor sections differ from the saved form, as translation keys. */
function changedKeys(a: ProfileForm, b: ProfileForm): string[] {
  const out: string[] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (a.nick !== b.nick || a.about !== b.about) out.push("profiles.tab.about");
  if (!same(a.interests, b.interests)) out.push("profiles.about.interests");
  if (!same(a.tags, b.tags)) out.push("profiles.about.tags");
  if (!same(a.habits, b.habits) || a.habitsAuto !== b.habitsAuto) out.push("profiles.tab.habits");
  if (!same(a.voice, b.voice)) out.push("profiles.tab.voice");
  if (!same(a.schedule, b.schedule)) out.push("profiles.tab.statuses");
  if (!same(a.forum, b.forum)) out.push("profiles.tab.forum");
  if (a.model !== b.model) out.push("profiles.tab.model");
  return out;
}

const RUN_ENTRIES = IMPORT_ENTRIES.filter((e) => e.kind !== "narrator");

type ImportMode = { kind: "pick" } | { kind: "run"; entries: ImportEntry[]; preview?: RunPreview } | null;
type Unsaved = { id: string; pending: (() => void) | null } | null;

export function Profiles() {
  const phone = useIsPhone();
  const t = useT();
  const unnamed = t("profiles.new.unnamed");
  const [pv] = useState(() => {
    const v = readPreview();
    mockScript(v.state);
    return v;
  });
  const [store, setStore] = useState(() => makeStore(pv));
  const fillPreview = pv.state?.startsWith("fill") === true;
  const [query, setQuery] = useState(pv.q);
  const [source, setSource] = useState<SourceFilter>(isFilter(pv.source) ? pv.source : "all");
  const [selectedId, setSelectedId] = useState(() => (fillPreview ? YARYNA : store.all[0]?.id ?? ""));
  const [openId, setOpenId] = useState<string | null>(() => (pv.view === "editor" ? store.all[0]?.id ?? null : fillPreview ? YARYNA : null));
  const [tab, setTab] = useState<TabId>(() => (isTab(pv.tab) ? pv.tab : pv.state === "habits-empty" ? "habits" : "about"));
  const [diffOpen, setDiffOpen] = useState(pv.state === "diff");
  const [unsaved, setUnsaved] = useState<Unsaved>(() => (pv.state === "unsaved" && store.all[0] ? { id: store.all[0].id, pending: null } : null));
  const [fill, setFill] = useState<FillRun | null>(() => {
    const p = store.all.find((x) => x.id === YARYNA);
    if (!fillPreview || !p) return null;
    const id = p.id;
    switch (pv.state) {
      case "fillbusy":
        return { id, phase: "busy", items: [] };
      case "fillfail":
        return { id, phase: "fail", items: [] };
      case "fillnone":
        return { id, phase: "none", items: [] };
      case "fillnomodel":
        return { id, phase: "nomodel", items: [] };
      default:
        return { id, phase: "review", items: itemsOf(previewProposal(emptyKeys(formOf(p)))) };
    }
  });
  // Each fill call takes a number; Stop and unmount move the count on, so a late answer is ignored.
  const fillCount = useRef(0);
  useEffect(() => () => {
    fillCount.current += 1;
  }, []);
  // App mode: the profiles are loaded once (Try again loads them again); a failed save or delete shows a notice.
  const [loaded, setLoaded] = useState(PREVIEW);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTry, setLoadTry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newMode, setNewMode] = useState<{ start: NewStart } | null>(() => {
    if (pv.view === "new") return { start: { stage: "choose" } };
    if (pv.view === "interview") return { start: { stage: "ask" } };
    if (pv.view === "interview2") return { start: { stage: "drafts", ...previewInterview() } };
    if (pv.view === "questionnaire") return { start: { stage: "questions" } };
    if (pv.state === "newfile") return { start: { stage: "file", file: previewFile() } };
    if (pv.state === "newfail") return { start: { stage: "ask", phase: "fail" } };
    if (pv.state === "newnomodel") return { start: { stage: "ask", phase: "nomodel" } };
    return null;
  });
  const [importMode, setImportMode] = useState<ImportMode>(() => {
    if (pv.view === "import") return { kind: "pick" };
    if (pv.state === "importing") return { kind: "run", entries: RUN_ENTRIES, preview: "importing" };
    if (pv.state === "importfail") return { kind: "run", entries: RUN_ENTRIES, preview: "importfail" };
    return null;
  });

  // App mode: load the profiles once; the copies the server returns are the saved ones, so nothing is sent back.
  useEffect(() => {
    if (PREVIEW) return;
    let live = true;
    setLoadError(null);
    call<{ profiles: (MockProfile & { createdAt?: string; updatedAt?: string })[] }>("GET", "/profiles").then(
      (res) => {
        if (!live) return;
        const all = res.profiles.map(stripStamps);
        for (const p of all) sync.seed(fullProfile(p, formOf(p)));
        setStore({ all, saved: Object.fromEntries(all.map((p) => [p.id, formOf(p)])), drafts: {} });
        setLoaded(true);
      },
      (e: unknown) => {
        if (live) setLoadError(errorText(e));
      },
    );
    return () => {
      live = false;
    };
  }, [loadTry]);

  // App mode: a profile whose saved form differs from the copy the server has is sent. Drafts are not saved forms.
  useEffect(() => {
    if (PREVIEW || !loaded) return;
    for (const p of store.all) {
      const full = fullProfile(p, store.saved[p.id]);
      sync.track(full);
      if (sync.isConfirmed(full)) continue;
      sync.save(full).then(
        () => setNotice(null),
        (e: unknown) => setNotice(t("profiles.saveFailed", { message: errorText(e) })),
      );
    }
  }, [store.all, store.saved, loaded]);

  /** Delete profile, confirmed: removed on the engine first; then the next profile is selected (phone: the list). */
  const confirmDelete = (id: string) => {
    const at = store.all.findIndex((p) => p.id === id);
    const rest = store.all.filter((p) => p.id !== id);
    const next = rest[at] ?? rest[0];
    setDeleting(null);
    sync.remove(id).then(
      () => {
        setStore((s) => dropProfile(s, id));
        setSelectedId(next?.id ?? "");
        setOpenId(null);
        setUnsaved((u) => (u?.id === id ? null : u));
        setFill((f) => (f?.id === id ? null : f));
      },
      (e: unknown) => setNotice(t("profiles.deleteFailed", { message: errorText(e) })),
    );
  };

  const byId = (id: string | null) => (id ? store.all.find((p) => p.id === id) : undefined);
  const deskProfile = byId(selectedId) ?? store.all[0];
  const phoneProfile = phone ? byId(openId) : undefined;
  const editing = phone ? phoneProfile : deskProfile;
  const formFor = (id: string) => store.drafts[id] ?? store.saved[id];
  const dirtyOf = (id: string) => !!store.drafts[id] && JSON.stringify(store.drafts[id]) !== JSON.stringify(store.saved[id]);

  /** Runs `action` now, or asks first when the open profile has unsaved changes. */
  const leave = (action: () => void) => {
    if (editing && dirtyOf(editing.id)) setUnsaved({ id: editing.id, pending: action });
    else action();
  };

  const resolveUnsaved = (how: "discard" | "save" | "stay") => {
    if (!unsaved) return;
    if (how === "stay") {
      setUnsaved(null);
      return;
    }
    const id = unsaved.id;
    const pending = unsaved.pending;
    setStore((s) => (how === "save" ? saveDraft(s, id) : dropDraft(s, id)));
    setUnsaved(null);
    pending?.();
  };

  const finishImport = (doneIds: string[], entries: ImportEntry[]) => {
    const fresh = entries
      .filter((e) => e.kind !== "narrator" && doneIds.includes(e.id))
      .map(profileFromEntry)
      .filter((p) => !store.saved[p.id]);
    if (fresh.length > 0) {
      setStore((s) => ({
        ...s,
        all: [...s.all, ...fresh],
        saved: { ...s.saved, ...Object.fromEntries(fresh.map((p) => [p.id, formOf(p)])) },
      }));
    }
    setImportMode(null);
  };

  const acceptDiff = (id: string) => {
    setStore((s) => {
      const base = s.drafts[id] ?? s.saved[id];
      const interests = base.interests.includes(UPDATE_DIFF.interest) ? base.interests : [...base.interests, UPDATE_DIFF.interest];
      return withDraft(s, id, { about: UPDATE_DIFF.about, interests });
    });
    setDiffOpen(false);
  };

  /** Fill empty: asks the model for the empty fields, then opens the review. */
  const runFill = (id: string) => {
    const keys = emptyKeys(formFor(id));
    if (keys.length === 0) return;
    const mine = fillCount.current + 1;
    fillCount.current = mine;
    setFill({ id, phase: "busy", items: [] });
    const failed = (phase: FillPhase) => {
      if (fillCount.current === mine) setFill({ id, phase, items: [] });
    };
    fillEmpty({ profileId: id, fields: keys }).then(
      (res) => {
        if (fillCount.current !== mine) return;
        if (!res.ok) {
          failed(res.code === "no-model" ? "nomodel" : "fail");
          return;
        }
        const items = itemsOf(res.proposal);
        setFill(items.length > 0 ? { id, phase: "review", items } : { id, phase: "none", items: [] });
      },
      () => failed("fail"),
    );
  };

  /** Stop: the answer of the running call is ignored when it comes. */
  const stopFill = () => {
    fillCount.current += 1;
    setFill(null);
  };

  const applyFill = (id: string, chosen: FillItem[]) => {
    setStore((s) => withDraft(s, id, applyProposals(s.drafts[id] ?? s.saved[id], recordOf(chosen))));
    setFill(null);
  };

  /** A new profile from "New profile": added, selected, and opened on About. */
  const finishCreate = (p: MockProfile) => {
    setStore((s) => ({ ...s, all: [...s.all, p], saved: { ...s.saved, [p.id]: formOf(p) } }));
    setSelectedId(p.id);
    setOpenId(p.id);
    setTab("about");
    setNewMode(null);
  };

  const fillPropsFor = (id: string) => ({
    empty: emptyKeys(formFor(id)).length,
    phase: fill && fill.id === id && fill.phase !== "review" ? fill.phase : null,
    onStart: () => runFill(id),
    onStop: stopFill,
  });

  const openImport = () => setImportMode({ kind: "pick" });
  // The Roleplay import is offered in preview only (the app needs an engine grant first).
  const list = { profiles: store.all, query, onQuery: setQuery, source, onSource: setSource, onImport: PREVIEW ? openImport : undefined, onNew: () => setNewMode({ start: { stage: "choose" } }) };

  const editorFor = (p: MockProfile) => ({
    profile: p,
    form: formFor(p.id),
    dirty: dirtyOf(p.id),
    tab,
    onTab: setTab,
    onSet: (patch: Partial<ProfileForm>) => setStore((s) => withDraft(s, p.id, patch)),
    onSave: () =>
      setStore((s) => {
        const next = saveDraft(s, p.id);
        const cur = s.all.find((x) => x.id === p.id);
        // An own profile made without a name takes its nick as its name on the first save.
        if (cur?.source !== "own" || cur.name !== unnamed) return next;
        const nick = next.saved[p.id].nick.trim();
        return { ...next, all: next.all.map((x) => (x.id === p.id ? { ...x, name: nick || unnamed } : x)) };
      }),
    onDiscard: () => setStore((s) => dropDraft(s, p.id)),
    onRefresh: () => setDiffOpen(true),
    fill: fillPropsFor(p.id),
    onDelete: PREVIEW ? undefined : () => setDeleting(p.id),
  });

  const unsavedProfile = unsaved ? byId(unsaved.id) : undefined;
  const run = importMode?.kind === "run" ? importMode : null;
  const deletingProfile = deleting ? byId(deleting) : undefined;

  let body;
  if (!loaded) {
    body = loadError ? (
      <section className={`first${phone ? " first-p" : ""}`} role="alert">
        <p className="k first-text">{t("profiles.loadFailed", { message: loadError })}</p>
        <button type="button" className="btn cta" onClick={() => setLoadTry((n) => n + 1)}>{t("profiles.retry")}</button>
      </section>
    ) : null;
  } else if (store.all.length === 0) {
    body = PREVIEW ? <FirstRun phone={phone} onImport={openImport} /> : <FirstRun phone={phone} onNew={() => setNewMode({ start: { stage: "choose" } })} />;
  } else if (phone) {
    body = phoneProfile ? (
      <PhoneEditor key={phoneProfile.id} {...editorFor(phoneProfile)} phone onBack={() => leave(() => setOpenId(null))} />
    ) : (
      <ProfileListPhone {...list} selectedId={selectedId} onPick={(id) => { setSelectedId(id); setOpenId(id); }} />
    );
  } else {
    body = (
      <>
        <ProfileListDesktop {...list} selectedId={deskProfile?.id ?? ""} onPick={(id) => { if (id !== deskProfile?.id) leave(() => setSelectedId(id)); }} />
        {deskProfile && <ProfileEditor key={deskProfile.id} {...editorFor(deskProfile)} phone={false} />}
      </>
    );
  }

  return (
    <div className={`s-profiles ${phone ? "is-phone" : "is-desk"}`}>
      {body}
      {notice && (
        <div className="pf-banner" role="alert">
          <span className="t">{notice}</span>
          <button type="button" className="btn" onClick={() => setNotice(null)}>{t("profiles.dismiss")}</button>
        </div>
      )}
      {importMode?.kind === "pick" && (
        <ImportDialog onClose={() => setImportMode(null)} onCreate={(entries) => setImportMode({ kind: "run", entries })} />
      )}
      {run && <ImportRun entries={run.entries} preview={run.preview} onFinish={(ids) => finishImport(ids, run.entries)} />}
      {fill && fill.phase === "review" && editing && fill.id === editing.id && (
        <FillReview items={fill.items} onDiscard={() => setFill(null)} onApply={(chosen) => applyFill(editing.id, chosen)} />
      )}
      {newMode && (
        <NewProfileFlow
          phone={phone}
          start={newMode.start}
          unnamed={unnamed}
          seed={pv.seed}
          onClose={() => setNewMode(null)}
          onRoleplay={
            PREVIEW
              ? () => {
                  setNewMode(null);
                  openImport();
                }
              : undefined
          }
          onCreate={(p) => {
            setNewMode(null);
            leave(() => finishCreate(p));
          }}
        />
      )}
      {deletingProfile && (
        <DeleteDialog name={deletingProfile.name} onCancel={() => setDeleting(null)} onConfirm={() => confirmDelete(deletingProfile.id)} />
      )}
      {diffOpen && editing && (
        <DiffDialog name={editing.name} profileId={editing.id} onClose={() => setDiffOpen(false)} onAccept={() => acceptDiff(editing.id)} />
      )}
      {unsaved && unsavedProfile && (
        <UnsavedDialog
          name={unsavedProfile.name}
          sections={changedKeys(store.saved[unsaved.id], formFor(unsaved.id))}
          onDiscard={() => resolveUnsaved("discard")}
          onStay={() => resolveUnsaved("stay")}
          onSave={() => resolveUnsaved("save")}
        />
      )}
    </div>
  );
}
