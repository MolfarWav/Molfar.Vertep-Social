// The relationship map screen (issue #366): on the Profiles tab, behind the "List | Map" switch. It shows how all the characters, and the
// personas that someone knows, stand to each other (levels, ties, who is at odds), read from the people lists by the Life plugin. Pick a
// person: their lines light up and the panel says how each side sees the other, with "Open profile" and "Edit ties" (the ties are edited in
// the profile's Life tab, as before: the map never draws or drags a link). The same facts can be read as a list (also the text version for
// screen readers and for a big community). Preview parameters: see the Profiles header (`view=map`, `select`, `maplist`, `n`, `mapstate`).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { useYou } from "@/screens/you/store";
import { Dialog } from "./dialog";
import { loadGraph } from "./map-api";
import { FamilyOutline, FamilyTree } from "./FamilyTree";
import { familyOf } from "./family-model";
import { crowd, edgesOf, followsOf, pairKey, ringOrder, type Edge, type GLink, type Graph } from "./map-model";
import { RelationMap, type MapPerson } from "./RelationMap";
import { useTieWord } from "./tabs/RelationEditor";
import { Seg } from "./ui";

export type ProfilesView = "list" | "map" | "family";

/** The "List | Map | Family" switch: on top of the profile list, the map and the family tree. */
export function ViewSwitch({ value, onChange }: { value: ProfilesView; onChange: (v: ProfilesView) => void }) {
  const t = useT();
  return (
    <Seg
      label={t("profiles.map.switch")}
      options={[
        { value: "list" as const, label: t("profiles.map.list") },
        { value: "map" as const, label: t("profiles.map.map") },
        { value: "family" as const, label: t("profiles.family.tab") },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

type Phase = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; graph: Graph };

/** The text version of the map ("social:map-list") and of the family tree ("social:family-outline"): the last choice, per browser. */
const readFlag = (key: string): boolean | null => {
  try {
    const v = localStorage.getItem(key);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
};
const saveFlag = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // not remembered
  }
};

interface Known {
  id: string;
  name: string;
  hue: number;
  picture: string;
}

export interface MapScreenProps {
  phone: boolean;
  /** The picture on show: the relationship map or the family tree (both read the same graph). */
  mode: "map" | "family";
  /** The characters (hue and picture come from here). */
  profiles: Known[];
  onView: (v: ProfilesView) => void;
  /** Open a character's profile; with `tab` "relations" it opens the Relationships tab, where the ties are edited. */
  onOpen: (id: string, tab: "about" | "relations") => void;
  onOpenYou: () => void;
  onNew?: () => void;
  /** Preview: the person picked at the start (a key). */
  initial?: string;
  /** Preview: start as the list. */
  initialList?: boolean;
}

export function MapScreen(p: MapScreenProps) {
  const t = useT();
  const you = useYou();
  const [state, setState] = useState<Phase>({ phase: "loading" });
  const [tries, setTries] = useState(0);
  const [selected, setSelected] = useState<string | null>(p.initial ?? null);
  const family = p.mode === "family";
  const flagKey = family ? "social:family-outline" : "social:map-list";
  const [asList, setAsList] = useState<boolean | null>(p.initialList ? true : readFlag(flagKey));

  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    loadGraph().then(
      (graph) => live && setState({ phase: "ready", graph }),
      (e: unknown) => live && setState({ phase: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [tries]);

  const graph = state.phase === "ready" ? state.graph : null;
  const model = useMemo(() => {
    if (!graph) return null;
    const known = new Map(p.profiles.map((x) => [x.id, x]));
    const personas = new Map((you?.personas ?? []).map((x) => [x.id, x]));
    const people: MapPerson[] = graph.nodes.map((n) => {
      const k = n.key.slice(2);
      const src = n.kind === "character" ? known.get(k) : personas.get(k);
      return { ...n, name: src?.name ?? n.name, hue: src?.hue ?? 200, picture: src?.picture || undefined };
    });
    const edges = edgesOf(graph);
    return { people, edges, order: ringOrder(graph.nodes, edges), fam: familyOf(graph), byKey: new Map(people.map((x) => [x.key, x])) };
  }, [graph, p.profiles, you]);

  // the map opens as the list for a crowd; the family tree as the outline on a phone when a row is wider than 4 people
  const listFirst = !model ? false : family ? p.phone && model.fam.groups.some((g) => g.widest > 4) : crowd(model.people.length).listFirst;
  const list = asList ?? listFirst;
  const toggle = () => {
    saveFlag(flagKey, !list);
    setAsList(!list);
  };
  const pick = useCallback((k: string | null) => setSelected(k), []);
  const canPick = !!model && model.people.filter((x) => x.kind === "character").length >= 2 && (!family || model.fam.groups.length > 0);
  const sel = model && selected ? model.people.find((x) => x.key === selected) ?? null : null;

  let body;
  if (state.phase === "loading") {
    body = (
      <div className="pm-skel" role="status" aria-live="polite">
        <div className="pm-skel-ring" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} style={{ ["--i" as string]: i }} />)}</div>
        <span className="k">{t("profiles.map.loading")}</span>
      </div>
    );
  } else if (state.phase === "error") {
    body = (
      <div className="pm-note" role="alert">
        <p className="k">{t("profiles.map.failed", { message: state.message })}</p>
        <button type="button" className="btn cta" onClick={() => setTries((n) => n + 1)}>{t("profiles.retry")}</button>
      </div>
    );
  } else if (model && model.people.filter((x) => x.kind === "character").length < 2) {
    body = (
      <div className="pm-note">
        <b>{t("profiles.map.alone.title")}</b>
        <p className="k">{t("profiles.map.alone.text")}</p>
        {p.onNew && <button type="button" className="btn cta" onClick={p.onNew}>{t("profiles.new")}</button>}
      </div>
    );
  } else if (model && family) {
    const fam = model.fam;
    body =
      fam.groups.length === 0 ? (
        <div className="pm-note">
          <b>{t("profiles.family.empty.title")}</b>
          <p className="k">{t("profiles.family.empty.text")}</p>
          <button type="button" className="btn cta" onClick={() => p.onView("map")}>{t("profiles.family.empty.map")}</button>
        </div>
      ) : (
        <>
          {list ? (
            <FamilyOutline groups={fam.groups} people={model.byKey} selected={selected} onSelect={pick} />
          ) : (
            <FamilyTree groups={fam.groups} people={model.byKey} selected={selected} onSelect={pick} />
          )}
          {fam.loners.length > 0 && <p className="pm-hint k">{t("profiles.family.loners", { n: fam.loners.length })}</p>}
          {p.phone && !selected && <p className="pm-hint k">{t("profiles.map.pick")}</p>}
        </>
      );
  } else if (model) {
    body = (
      <>
        {model.edges.length === 0 && <p className="pm-hint k">{t("profiles.map.unmet")}</p>}
        {list ? (
          <MapList people={model.people} edges={model.edges} order={model.order} selected={selected} onSelect={pick} />
        ) : (
          <RelationMap people={model.people} edges={model.edges} order={model.order} selected={selected} onSelect={pick} phone={p.phone} />
        )}
        {crowd(model.people.length).listFirst && !list && <p className="pm-hint k">{t("profiles.map.crowd")}</p>}
        {p.phone && !selected && <p className="pm-hint k">{t("profiles.map.pick")}</p>}
      </>
    );
  }

  const panel =
    model && sel ? (
      <MapPanel person={sel} model={model} onSelect={pick} onOpen={p.onOpen} onOpenYou={p.onOpenYou} onClose={() => setSelected(null)} phone={p.phone} />
    ) : null;

  return (
    <div className={`pm-screen${p.phone ? " is-phone" : ""}`}>
      <header className="pm-head">
        {p.phone ? <h1 className="title">{t("profiles.title")}</h1> : <div className="tbar">{t(family ? "profiles.family.title" : "profiles.map.title")}</div>}
        <div className="pm-bar">
          <ViewSwitch value={p.mode} onChange={p.onView} />
          {canPick && (
            <button type="button" className="btn pm-toggle" onClick={toggle}>{t(family ? (list ? "profiles.family.asTree" : "profiles.family.asOutline") : list ? "profiles.map.asMap" : "profiles.map.asList")}</button>
          )}
        </div>
        {canPick && !list && (family ? <FamilyLegend /> : <Legend />)}
      </header>
      <div className="pm-body">
        <main className="pm-main">{body}</main>
        {!p.phone && (
          <aside className="pm-side" aria-label={t("profiles.map.panel")}>
            {panel ?? (canPick ? <p className="k pm-pick">{t("profiles.map.pick")}</p> : null)}
          </aside>
        )}
      </div>
      {p.phone && panel && (
        <Dialog title={sel?.name ?? ""} sheet onClose={() => setSelected(null)}>
          {panel}
        </Dialog>
      )}
    </div>
  );
}

/** The legend under the header: what a line means. */
function Legend() {
  const t = useT();
  return (
    <ul className="pm-legend" aria-label={t("profiles.map.legend")}>
      <li><svg width="28" height="14" aria-hidden="true"><line className="pm-lg pm-lg-romance" x1="1" y1="9" x2="27" y2="9" strokeWidth="2.5" /><path className="pm-heart" d="M14 12 C8 8 10 3 14 6 C18 3 20 8 14 12Z" /></svg>{t("profiles.map.legend.romance")}</li>
      <li><svg width="28" height="14" aria-hidden="true"><line className="pm-lg pm-lg-rival" x1="1" y1="7" x2="27" y2="7" strokeWidth="2.5" /></svg>{t("profiles.map.legend.rival")}</li>
      <li><svg width="28" height="14" aria-hidden="true"><line className="pm-lg pm-lg-family" x1="1" y1="5" x2="27" y2="5" strokeWidth="1.6" /><line className="pm-lg pm-lg-family" x1="1" y1="9" x2="27" y2="9" strokeWidth="1.6" /></svg>{t("profiles.map.legend.family")}</li>
      <li><svg width="28" height="14" aria-hidden="true"><line className="pm-lg pm-lg-plain" x1="1" y1="7" x2="19" y2="7" strokeWidth="1.6" /><path className="pm-lg-arrow" d="M27 7L19 3.5V10.5Z" /></svg>{t("profiles.map.legend.follow")}</li>
      <li><svg width="28" height="14" aria-hidden="true"><line className="pm-lg pm-lg-plain" x1="1" y1="7" x2="27" y2="7" strokeWidth="3.5" /></svg>{t("profiles.map.legend.plain")}</li>
    </ul>
  );
}

/** The legend of the family tree: what a line means. */
function FamilyLegend() {
  const t = useT();
  return (
    <ul className="pm-legend" aria-label={t("profiles.map.legend")}>
      <li><svg width="28" height="14" aria-hidden="true"><line className="pm-lg pm-lg-family" x1="1" y1="5" x2="27" y2="5" strokeWidth="1.6" /><line className="pm-lg pm-lg-family" x1="1" y1="9" x2="27" y2="9" strokeWidth="1.6" /></svg>{t("profiles.family.legend.spouse")}</li>
      <li><svg width="28" height="14" aria-hidden="true"><path className="pm-lg pm-lg-plain" d="M14 1V7H3V13M14 7H25V13" fill="none" strokeWidth="1.6" /></svg>{t("profiles.family.legend.parent")}</li>
      <li><svg width="28" height="14" aria-hidden="true"><path className="pm-lg pm-lg-plain" d="M2 12Q14 -2 26 12" fill="none" strokeWidth="1.6" strokeDasharray="3 3" /></svg>{t("profiles.family.legend.dotted")}</li>
    </ul>
  );
}

/** What the link says in words: the level, the feeling when it is not neutral, the ties. */
function useLinkWords() {
  const t = useT();
  const tie = useTieWord();
  return (l: GLink) => {
    const parts: string[] = [t(("profiles.people.level." + l.level) as never)];
    // "close" next to "Close friend" says the same twice
    if (l.band && !(l.band === "close" && (l.level === "close" || l.level === "confidant"))) parts.push(t(("profiles.people.feel." + l.band) as never));
    for (const x of l.ties) parts.push(tie(x));
    return parts.join(", ");
  };
}

/** The list view: every person with their strongest links in words; picking one opens the same panel. */
function MapList({ people, edges, order, selected, onSelect }: { people: MapPerson[]; edges: Edge[]; order: string[]; selected: string | null; onSelect: (k: string | null) => void }) {
  const t = useT();
  const byKey = new Map(people.map((x) => [x.key, x]));
  const links = edges.flatMap((e) => e.links);
  const nameList = (keys: string[]) => keys.slice(0, 3).map((k) => byKey.get(k)?.name ?? "").join(", ") + (keys.length > 3 ? " +" + (keys.length - 3) : "");
  return (
    <ul className="pm-list">
      {order.map((k) => {
        const x = byKey.get(k);
        if (!x) return null;
        const mine = edges.filter((e) => e.a === k || e.b === k).sort((a, b) => b.weight - a.weight);
        const fl = followsOf(k, links);
        return (
          <li key={k}>
            <button type="button" className={`pm-li${selected === k ? " on" : ""}`} aria-pressed={selected === k} onClick={() => onSelect(selected === k ? null : k)}>
              <Avatar name={x.name} hue={x.hue} size={36} picture={x.picture} />
              <span className="t">
                <b>{x.name}{x.kind === "user" ? " · " + t("profiles.people.you") : ""}</b>
                <span className="k">
                  {mine.length === 0
                    ? t("profiles.map.none")
                    : mine.slice(0, 3).map((e) => byKey.get(e.a === k ? e.b : e.a)?.name ?? "").join(", ") + (mine.length > 3 ? " +" + (mine.length - 3) : "")}
                </span>
                {fl.follows.length > 0 && <span className="k">{t("profiles.map.listFollows", { names: nameList(fl.follows) })}</span>}
                {fl.followedBy.length > 0 && <span className="k">{t("profiles.map.listFollowedBy", { names: nameList(fl.followedBy) })}</span>}
              </span>
              <span className="fn">{t("profiles.map.links", { n: mine.length })}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The selected person: how each side sees the other, and the two actions. */
function MapPanel({ person, model, onSelect, onOpen, onOpenYou, onClose, phone }: { person: MapPerson; model: { people: MapPerson[]; edges: Edge[] }; onSelect: (k: string | null) => void; onOpen: MapScreenProps["onOpen"]; onOpenYou: () => void; onClose: () => void; phone: boolean }) {
  const t = useT();
  const words = useLinkWords();
  const byKey = new Map(model.people.map((x) => [x.key, x]));
  const mine = model.edges.filter((e) => e.a === person.key || e.b === person.key).sort((a, b) => b.weight - a.weight);
  const isChar = person.kind === "character";
  const id = person.key.slice(2);
  const followers = followsOf(person.key, model.edges.flatMap((e) => e.links)).followedBy.length;
  return (
    <section className="pm-panel">
      <div className="pm-ph">
        <Avatar name={person.name} hue={person.hue} size={40} picture={person.picture} />
        <span className="t">
          <b>{person.name}</b>
          <span className="k">{t("profiles.map.links", { n: mine.length })}{followers > 0 ? " · " + t("profiles.map.followedBy", { n: followers }) : ""}{person.kind === "user" ? " · " + t("profiles.people.you") : ""}</span>
        </span>
        {!phone && <button type="button" className="hbtn x" aria-label={t("profiles.map.close")} onClick={onClose}>×</button>}
      </div>
      {mine.length === 0 && <p className="k pm-empty">{t(isChar ? "profiles.map.noLinks" : "profiles.map.noLinksYou")}</p>}
      <ul className="pm-rows">
        {mine.map((e) => {
          const other = byKey.get(e.a === person.key ? e.b : e.a);
          if (!other) return null;
          return (
            <li key={pairKey(e.a, e.b)} className={`pm-row pm-row-${e.kind}`}>
              <button type="button" className="pm-who" onClick={() => onSelect(other.key)}>
                <Avatar name={other.name} hue={other.hue} size={24} picture={other.picture} />
                <b>{other.name}</b>
              </button>
              {[...e.links].sort((x, y) => (x.from === person.key ? -1 : 1) - (y.from === person.key ? -1 : 1)).map((l) => (
                <Fragment key={l.from}>
                  <p className="k">
                    <span className="pm-dir">{t("profiles.map.about", { from: byKey.get(l.from)?.name ?? "", to: byKey.get(l.to)?.name ?? "" })}</span> {words(l)}
                  </p>
                  {l.follow === true && <p className="k pm-follow">{t("profiles.map.follows", { from: byKey.get(l.from)?.name ?? "", to: byKey.get(l.to)?.name ?? "" })}</p>}
                </Fragment>
              ))}
            </li>
          );
        })}
      </ul>
      <div className="pm-act">
        {isChar ? (
          <>
            <button type="button" className="btn cta" onClick={() => onOpen(id, "about")}>{t("profiles.map.open")}</button>
            <button type="button" className="btn" onClick={() => onOpen(id, "relations")}>{t("profiles.map.edit")}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn cta" onClick={onOpenYou}>{t("profiles.map.openYou")}</button>
            <p className="k">{t("profiles.map.youHint")}</p>
          </>
        )}
      </div>
      {phone && <button type="button" className="btn pm-close" onClick={onClose}>{t("profiles.map.close")}</button>}
    </section>
  );
}
