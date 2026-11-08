// Profiles screen: the list (search, source filter, rows) and the editor
// (About, Voice, Statuses, Forum, Habits). Desktop: list column + editor.
// Phone: the list; a tap opens the editor full screen with a back button.
//
// Preview parameters (`?screen=profiles&...`, read once on load):
//   view=editor   phone only: open the editor of the first profile
//   tab=about|voice|statuses|forum|habits   the editor tab (desktop and phone)
//   q=<text>      prefill the search
//   source=all|roleplay|own|persona         prefill the source filter
//   dirty=1       phone editor starts with unsaved changes (shows the save bar)
//
// For the next builder (import dialog, state boards). Exports:
//   Profiles              the screen (the shell imports this)
//   ProfileListDesktop, ProfileListPhone, ListProps   the list; `onImport` is the Import button
//                         (no-op until the import dialog is wired)
//   ProfileEditor, PhoneEditor, EditorProps, formOf   the editor; add dialogs next to it
//   TabId, TAB_IDS, TabProps   the editor tabs (tabs/*.tsx)
//   filterProfiles, splitMatch, countBySource, SourceFilter   search helpers
//   Seg, Slider, Switch, Chip, Field   the shared controls (ui.tsx)
import "./profiles.css";
import { useState } from "react";
import { useIsPhone } from "@/lib/use-phone";
import { PROFILES } from "@/mock/profiles";
import { ProfileEditor, PhoneEditor } from "./editor";
import { ProfileListDesktop, ProfileListPhone } from "./list";
import { isFilter, type SourceFilter } from "./search";
import { isTab, type TabId } from "./tabs/types";

export { ProfileListDesktop, ProfileListPhone, type ListProps } from "./list";
export { ProfileEditor, PhoneEditor, formOf, type EditorProps } from "./editor";
export { TAB_IDS, isTab, type TabId, type TabProps } from "./tabs/types";
export { filterProfiles, splitMatch, countBySource, FILTERS, type SourceFilter } from "./search";
export { Seg, Slider, Switch, Chip, Field } from "./ui";

interface Preview {
  view: string | null;
  tab: string | null;
  q: string;
  source: string | null;
  dirty: boolean;
}

function readPreview(): Preview {
  try {
    const p = new URLSearchParams(location.search);
    return { view: p.get("view"), tab: p.get("tab"), q: p.get("q") ?? "", source: p.get("source"), dirty: p.get("dirty") === "1" };
  } catch {
    return { view: null, tab: null, q: "", source: null, dirty: false };
  }
}

export function Profiles() {
  const phone = useIsPhone();
  const [pv] = useState(readPreview);
  const [query, setQuery] = useState(pv.q);
  const [source, setSource] = useState<SourceFilter>(isFilter(pv.source) ? pv.source : "all");
  const [selectedId, setSelectedId] = useState(PROFILES[0].id);
  const [openId, setOpenId] = useState<string | null>(pv.view === "editor" ? PROFILES[0].id : null);
  const [tab, setTab] = useState<TabId>(isTab(pv.tab) ? pv.tab : "about");

  const list = { profiles: PROFILES, query, onQuery: setQuery, source, onSource: setSource };

  if (phone) {
    const open = PROFILES.find((p) => p.id === openId);
    return (
      <div className="s-profiles is-phone">
        {open ? (
          <PhoneEditor key={open.id} profile={open} tab={tab} onTab={setTab} onBack={() => setOpenId(null)} initialDirty={pv.dirty} phone />
        ) : (
          <ProfileListPhone {...list} selectedId={selectedId} onPick={(id) => { setSelectedId(id); setOpenId(id); }} />
        )}
      </div>
    );
  }

  const selected = PROFILES.find((p) => p.id === selectedId) ?? PROFILES[0];
  return (
    <div className="s-profiles is-desk">
      <ProfileListDesktop {...list} selectedId={selected.id} onPick={setSelectedId} />
      <ProfileEditor key={selected.id} profile={selected} tab={tab} onTab={setTab} phone={false} />
    </div>
  );
}
