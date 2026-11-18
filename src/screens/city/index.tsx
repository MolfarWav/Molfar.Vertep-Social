// The city (issue #445, C1): districts, the places in them with who is there right now, and the homes. Read-only: it shows what the
// city plugin worked out by rules. Desktop: a tab. Phone: reached from More (the Settings tab).
//
// Preview parameters (`?screen=city&...`): district=<id> (open a district), place=<id> (open a place), state=empty.
import "../profiles/profiles.css";
import "./city.css";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { useIsPhone } from "@/lib/use-phone";
import { useChrome, useNav } from "@/shell/nav";
import { useYou } from "../you/store";
import { loadClubs } from "@/screens/messenger/clubs-api";
import { loadCity, loadListen, removeDistrict, removePlace, resetTown, saveDistrict, savePlace, walkIn, type CityDoor, type CityPlace, type CityView, type ListenLine } from "./api";
import { DistrictForm, PlaceForm, draftOf, type PlaceDraft } from "./editors";

const param = (k: string): string => {
  if (!PREVIEW) return "";
  try {
    return new URLSearchParams(location.search).get(k) ?? "";
  } catch {
    return "";
  }
};

const BackIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
const FACES = 5;

function Tile({ p, name, text, on, onToggle }: { p: CityPlace; name: string; text: string; on: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button type="button" className={`ct-tile${on ? " on" : ""}${p.open ? "" : " is-closed"}`} aria-expanded={on} onClick={onToggle}>
      <span className="ct-top">
        {p.picture ? <img className="ct-thumb" src={p.picture} alt="" /> : <span className="ct-ico" aria-hidden="true">{p.icon}</span>}
        <span className="ct-nm">{name}</span>
        <span className="chip">{t(p.open ? "city.open" : "city.closed")}</span>
      </span>
      <span className="ct-tx">{text}</span>
      <span className="ct-faces">
        {p.people.slice(0, FACES).map((x) => <Avatar key={x.id} name={x.name} hue={x.hue} size={28} picture={x.picture || undefined} />)}
        {p.people.length > FACES && <span className="k">{t("city.more", { n: p.people.length - FACES })}</span>}
        {p.people.length === 0 && <span className="k">{t("city.here.none")}</span>}
      </span>
    </button>
  );
}

/** An open place: who is here, what they say to each other (listen), and the way into a room with them (walk in). */
function Detail({ p, name, clubsOn, onOpenPerson, onEdit, onRemoved }: { p: CityPlace; name: string; clubsOn: boolean | null; onOpenPerson: (id: string) => void; onEdit: () => void; onRemoved: () => void }) {
  const t = useT();
  const { go, openClub } = useNav();
  const [lines, setLines] = useState<ListenLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const drop = async () => {
    try {
      await removePlace(p.id);
      onRemoved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    let alive = true;
    setLines(null);
    loadListen(p.id).then((r) => alive && setLines(r.lines)).catch(() => alive && setLines([]));
    return () => { alive = false; };
  }, [p.id, p.people.length]);
  const enter = async () => {
    setBusy(true);
    setErr("");
    const r = await walkIn(p.id, name);
    setBusy(false);
    if (r.error) setErr(r.error);
    else openClub(r.id);
  };
  const canEnter = p.open && p.people.length >= 2;
  return (
    <div className="ct-detail">
      {p.people.length > 0 && (
        <div className="ct-who" role="group" aria-label={t("city.here")}>
          <h3>{t("city.here")}</h3>
          {p.people.map((x) => (
            <button key={x.id} type="button" className="ct-who-row" aria-label={`${x.name}: ${t("city.door.open")}`} onClick={() => onOpenPerson(x.id)}>
              <Avatar name={x.name} hue={x.hue} size={28} picture={x.picture || undefined} />
              <b>{x.name}</b>
            </button>
          ))}
        </div>
      )}
      <div className="ct-who" role="group" aria-label={t("city.listen")}>
        <h3>{t("city.listen")}</h3>
        {lines === null && <span className="k">{t("city.loading")}</span>}
        {lines !== null && lines.length === 0 && <span className="k">{t("city.listen.none")}</span>}
        {lines?.map((l) => (
          <div key={l.id} className="ct-line">
            <Avatar name={l.name} hue={l.hue} size={24} picture={l.picture || undefined} />
            <span><b>{l.name}</b> {l.text}</span>
          </div>
        ))}
      </div>
      <div className="ct-who">
        <button type="button" className="btn cta" disabled={busy || !canEnter || clubsOn === false} onClick={() => void enter()}>{t("city.walkin")}</button>
        {!p.open && <span className="k">{t("city.walkin.closed")}</span>}
        {p.open && p.people.length < 2 && <span className="k">{t("city.walkin.few")}</span>}
        {clubsOn === false && (
          <span className="k">
            {t("city.walkin.off")} <button type="button" className="link" onClick={() => go("settings")}>{t("city.walkin.settings")}</button>
          </span>
        )}
        {err && <span className="jr-err" role="alert">{err}</span>}
      </div>
      {asking ? (
        <div className="ct-ask" role="alertdialog" aria-label={t("city.place.removeAsk")}>
          <span>{t("city.place.removeAsk")}</span>
          <button type="button" className="btn danger" onClick={() => void drop()}>{t("city.form.remove.yes")}</button>
          <button type="button" className="btn" onClick={() => setAsking(false)}>{t("city.form.keep")}</button>
        </div>
      ) : (
        <div className="ct-btns">
          <button type="button" className="btn" onClick={onEdit}>{t("city.place.edit")}</button>
          <button type="button" className="btn" onClick={() => setAsking(true)}>{t("city.place.remove")}</button>
        </div>
      )}
    </div>
  );
}

export function City() {
  const phone = useIsPhone();
  useChrome({ bar: false });
  const t = useT();
  const { go, openProfile } = useNav();
  const you = useYou();
  const me = you?.personas.find((p) => p.id === you.active);
  const [view, setView] = useState<CityView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [district, setDistrict] = useState(() => param("district"));
  const [open, setOpen] = useState(() => param("place"));
  // the form that is open: a place (new, or this one), a district (new, or this one), or none
  const [editor, setEditor] = useState<null | { kind: "place"; id: string } | { kind: "district"; id: string }>(() => (param("edit") === "place" ? { kind: "place", id: "" } : param("edit") === "district" ? { kind: "district", id: "" } : null));
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState("");
  // walking in needs the global Clubs switch; null while it is not known
  const [clubsOn, setClubsOn] = useState<boolean | null>(null);
  useEffect(() => {
    void loadClubs().then((l) => setClubsOn(l.on));
  }, []);

  const load = useCallback(async () => {
    try {
      const v = await loadCity();
      setView(param("state") === "empty" ? { ...v, empty: true } : v);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);
  useEffect(() => {
    void load();
    if (PREVIEW) return;
    // the town moves on every three hours: look again now and then
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);

  // the stock town is translated by id; a place made later shows the name it was stored with
  const tr = (key: string, fallback: string): string => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const districtName = (d: { id: string; name: string; by?: string }) => (d.by === "you" ? d.name : tr(`city.district.${d.id}`, d.name));
  const placeName = (p: CityPlace) => (p.by === "stock" ? tr(`city.place.${p.id}`, p.name) : p.name);
  const placeText = (p: CityPlace) => (p.by === "stock" ? tr(`city.place.${p.id}.text`, p.text) : p.text);

  const tabs = view ? [...view.districts.map((d) => ({ id: d.id, name: districtName(d) })), ...(view.homesDistrict ? [{ id: view.homesDistrict, name: districtName({ id: view.homesDistrict, name: view.homesName || "Homes", by: view.homesBy }) }] : [])] : [];
  const current = tabs.some((x) => x.id === district) ? district : (tabs[0]?.id ?? "");
  const isHomes = !!view && current === view.homesDistrict;
  const currentDistrict = view?.districts.find((d) => d.id === current);
  const placeById = new Map((view?.districts ?? []).flatMap((d) => d.places).map((p) => [p.id, p]));

  const afterSave = async (placeId?: string, districtId?: string) => {
    await load();
    setEditor(null);
    if (districtId) setDistrict(districtId);
    if (placeId) setOpen(placeId);
  };
  const editedPlace = editor?.kind === "place" && editor.id ? view?.districts.flatMap((d) => d.places).find((p) => p.id === editor.id) ?? null : null;
  const pickDistricts = (view?.districts ?? []).map((d) => ({ id: d.id, name: districtName(d) }));

  const doorText = (d: CityDoor): string => {
    if (d.state === "lit") return t("city.state.lit");
    if (d.state === "dark") return t("city.state.dark");
    const where = d.where ? placeById.get(d.where) : undefined;
    return where ? t("city.state.out.where", { place: placeName(where) }) : t("city.state.out");
  };

  const header = phone ? (
    <header className="hd">
      <button type="button" className="hbtn" aria-label={t("city.back")} onClick={() => go("settings")}>
        <BackIcon />
      </button>
      <h1 className="hd-title ct-title">{t("city.title")}</h1>
    </header>
  ) : (
    <div className="ct-head">
      <div>
        <h1 className="ct-h">{t("city.title")}</h1>
        <p className="k">{t("city.intro")}</p>
      </div>
    </div>
  );

  return (
    <div className={`s-profiles s-city ${phone ? "is-phone" : "is-desk"}`}>
      {header}
      <div className="ct-scroll">
        <div className="ct-page">
          {phone && <p className="k">{t("city.intro")}</p>}
          {state === "loading" && <p className="k" role="status">{t("city.loading")}</p>}
          {state === "error" && (
            <div className="ct-empty" role="alert">
              <p>{t("city.error", { message: error })}</p>
              <div className="ct-btns"><button type="button" className="btn" onClick={() => { setState("loading"); void load(); }}>{t("city.retry")}</button></div>
            </div>
          )}
          {state === "ready" && view && view.empty && (
            <div className="ct-empty">
              <h2>{t("city.empty.title")}</h2>
              <p className="k">{t("city.empty.text")}</p>
              <div className="ct-btns"><button type="button" className="btn cta" onClick={() => go("profiles")}>{t("city.empty.go")}</button></div>
            </div>
          )}
          {state === "ready" && view && !view.empty && (
            <>
              <div className="ct-now">{t("city.now", { from: hh(view.from), to: hh(view.to) })}</div>
              <div className="ct-strip" role="group" aria-label={t("city.districts")}>
                {tabs.map((x) => (
                  <button key={x.id} type="button" className={`chip${x.id === current ? " on" : ""}`} aria-pressed={x.id === current} onClick={() => { setDistrict(x.id); setOpen(""); setEditor(null); }}>{x.name}</button>
                ))}
                <button type="button" className="chip" aria-label={t("city.district.add")} title={t("city.district.add")} onClick={() => setEditor({ kind: "district", id: "" })}>+</button>
              </div>
              {editor?.kind === "district" && (
                <DistrictForm
                  key={editor.id || "new"}
                  initial={editor.id && currentDistrict ? { id: currentDistrict.id, name: districtName(currentDistrict), kind: currentDistrict.kind } : { name: "", kind: "custom" }}
                  canRemove={!!currentDistrict && currentDistrict.places.length === 0}
                  onSave={async (v) => { await saveDistrict(v); await afterSave(undefined, v.id); }}
                  onRemove={editor.id ? async () => { await removeDistrict(editor.id); setDistrict(""); await afterSave(); } : undefined}
                  onCancel={() => setEditor(null)}
                />
              )}
              {editor?.kind === "place" && (
                <PlaceForm
                  key={editor.id || "new"}
                  initial={editedPlace ? draftOf(editedPlace, editedPlace.district, placeName(editedPlace), placeText(editedPlace)) : draftOf(null, !isHomes ? current : (pickDistricts[0]?.id ?? ""), "", "")}
                  existingHours={editedPlace?.hours}
                  districts={pickDistricts}
                  phone={phone}
                  onSave={async (v: PlaceDraft) => {
                    const { hours, ...rest } = v;
                    await savePlace({ ...rest, ...(hours ? { hours } : {}) });
                    await afterSave(v.id, v.district);
                  }}
                  onCancel={() => setEditor(null)}
                />
              )}
              {!isHomes && !editor && (
                <div className="ct-btns">
                  <button type="button" className="btn" onClick={() => setEditor({ kind: "place", id: "" })}>{t("city.place.add")}</button>
                  {currentDistrict && <button type="button" className="btn" onClick={() => setEditor({ kind: "district", id: currentDistrict.id })}>{t("city.district.edit")}</button>}
                </div>
              )}
              {!isHomes && (
                <div className="ct-tiles">
                  {(currentDistrict?.places ?? []).map((p) => (
                    <div key={p.id} className="ct-cell">
                      <Tile p={p} name={placeName(p)} text={placeText(p)} on={open === p.id} onToggle={() => setOpen(open === p.id ? "" : p.id)} />
                      {open === p.id && <Detail p={p} name={placeName(p)} clubsOn={clubsOn} onOpenPerson={openProfile} onEdit={() => setEditor({ kind: "place", id: p.id })} onRemoved={() => { setOpen(""); void load(); }} />}
                    </div>
                  ))}
                  {(currentDistrict?.places.length ?? 0) === 0 && <p className="k">{t("city.district.empty")}</p>}
                </div>
              )}
              {isHomes && (
                <>
                  <p className="k">{t("city.homes.intro")}</p>
                  <button type="button" className="ct-you" onClick={() => go("you")}>
                    <Avatar name={me?.name ?? t("city.you")} hue={me?.hue ?? 210} size={36} picture={me?.picture || undefined} />
                    <span className="t">
                      <b>{t("city.you")}</b>
                      <span className="k">{t("city.you.hint")}</span>
                    </span>
                  </button>
                  {view.homes.buildings.map((b) => (
                    <section key={b.id} className="ct-b" aria-label={t("city.building", { n: b.n })}>
                      <h2>{t("city.building", { n: b.n })}</h2>
                      <div className="ct-doors">
                        {b.doors.map((d) => (
                          <button key={d.id} type="button" className={`ct-door ${d.state}`} aria-label={`${d.name}, ${t("city.flat", { n: d.flat })}: ${doorText(d)}. ${t("city.door.open")}`} onClick={() => openProfile(d.id)}>
                            <Avatar name={d.name} hue={d.hue} size={32} picture={d.picture || undefined} dim={d.state !== "lit"} />
                            <b>{d.name}</b>
                            <span className="win">{doorText(d)}</span>
                            <span className="k">{t("city.flat", { n: d.flat })}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              )}
              <div className="ct-foot">
                {restoring ? (
                  <div className="ct-ask" role="alertdialog" aria-label={t("city.restore.ask")}>
                    <span>{t("city.restore.ask")}</span>
                    <button type="button" className="btn danger" onClick={() => void resetTown().then(() => { setRestoring(false); setDistrict(""); setOpen(""); setEditor(null); return load(); }).catch((e) => setRestoreErr(e instanceof Error ? e.message : String(e)))}>{t("city.restore.yes")}</button>
                    <button type="button" className="btn" onClick={() => setRestoring(false)}>{t("city.form.keep")}</button>
                  </div>
                ) : (
                  <button type="button" className="link" onClick={() => setRestoring(true)}>{t("city.restore")}</button>
                )}
                {restoreErr && <span className="jr-err" role="alert">{restoreErr}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
