// Forms for the user's own places and districts (issue #445, C3). They are inline, above the tiles, like the journal's post form.
import { useId, useState } from "react";
import { useLangPref, useT } from "@/i18n/index";
import { PictureDialog } from "../profiles/picture-dialog";
import { Field } from "../profiles/ui";
import type { CityDistrict, CityPlace, Hours } from "./api";

export const PLACE_KINDS = ["cafe", "park", "library", "shop", "workplace", "club", "custom"] as const;
export const DISTRICT_KINDS = ["centre", "nature", "work", "custom"] as const;

export interface PlaceDraft {
  id?: string;
  name: string;
  district: string;
  kind: string;
  icon: string;
  text: string;
  tags: string;
  seats: number;
  /** A small picture from before #452 (kept until the user sets or removes the background). */
  picture: string;
  /** (#452) The place's one picture: wide, behind the opened place, the room and a character's chat. */
  background: string;
  /** Sent only when it was changed (a grid the form cannot show is kept as it is). */
  hours: Hours | null;
}

const hh = (band: number) => `${String(band * 3).padStart(2, "0")}:00`;
const DEFAULT_HOURS: Hours = { from: 2, to: 7, days: [0, 1, 2, 3, 4, 5, 6] };

export function draftOf(p: CityPlace | null, district: string, name: string, text: string): PlaceDraft {
  return p
    ? { id: p.id, name, district: p.district, kind: p.kind, icon: p.icon, text, tags: p.tags.join(", "), seats: p.seats, picture: p.picture ?? "", background: p.background ?? "", hours: null }
    : { name: "", district, kind: "custom", icon: "", text: "", tags: "", seats: 6, picture: "", background: "", hours: { ...DEFAULT_HOURS } };
}

export function PlaceForm({ initial, existingHours, districts, phone, onSave, onCancel }: { initial: PlaceDraft; existingHours: Hours | null | undefined; districts: { id: string; name: string }[]; phone: boolean; onSave: (v: PlaceDraft) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const { lang } = useLangPref();
  const [v, setV] = useState<PlaceDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pic, setPic] = useState(false);
  const editing = !!initial.id;
  const hid = useId();
  // one picture per place (#452): the background, or the small picture of an older place until it gets one
  const image = v.background || v.picture;
  const set = (patch: Partial<PlaceDraft>) => setV((x) => ({ ...x, ...patch }));
  // an existing place shows its own hours; a grid the form cannot show says so and stays unless the user sets new ones
  const shown: Hours = v.hours ?? existingHours ?? DEFAULT_HOURS;
  const custom = editing && v.hours === null && !existingHours;
  const setHours = (patch: Partial<Hours>) => set({ hours: { ...shown, ...patch } });
  const dayName = (d: number) => new Date(2024, 0, 1 + d).toLocaleDateString(lang, { weekday: "short" });
  const toggleDay = (d: number) => setHours({ days: shown.days.includes(d) ? shown.days.filter((x) => x !== d) : [...shown.days, d].sort() });
  const go = async () => {
    if (!v.name.trim()) return setErr(t("city.form.needName"));
    if (v.hours && (v.hours.from >= v.hours.to || v.hours.days.length === 0)) return setErr(t("city.form.badHours"));
    setBusy(true);
    setErr("");
    try {
      await onSave(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <form className="ct-form" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <h2 className="ct-fh">{t(editing ? "city.form.editPlace" : "city.form.newPlace")}</h2>
      <Field label={t("city.form.name")}>{(id) => <input id={id} className="inp" maxLength={60} placeholder={t("city.form.name.ph")} value={v.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
      <div className="ct-two">
        <Field label={t("city.form.district")}>
          {(id) => (
            <select id={id} className="inp" value={v.district} onChange={(e) => set({ district: e.target.value })}>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t("city.form.kind")}>
          {(id) => (
            <select id={id} className="inp" value={v.kind} onChange={(e) => set({ kind: e.target.value })}>
              {PLACE_KINDS.map((k) => <option key={k} value={k}>{t(`city.kind.${k}`)}</option>)}
            </select>
          )}
        </Field>
      </div>
      <Field label={t("city.form.text")}>{(id) => <textarea id={id} className="inp inp-area ct-area" maxLength={160} placeholder={t("city.form.text.ph")} value={v.text} onChange={(e) => set({ text: e.target.value })} />}</Field>
      <div className="f" role="group" aria-labelledby={hid}>
        <span className="lb" id={hid}>{t("city.form.hours")}</span>
        {custom && <span className="k">{t("city.form.hours.custom")}</span>}
        <div className="ct-two">
          <label className="ct-sel"><span className="k">{t("city.form.from")}</span>
            <select className="inp" value={shown.from} onChange={(e) => setHours({ from: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{hh(b)}</option>)}
            </select>
          </label>
          <label className="ct-sel"><span className="k">{t("city.form.to")}</span>
            <select className="inp" value={shown.to} onChange={(e) => setHours({ to: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((b) => <option key={b} value={b}>{hh(b)}</option>)}
            </select>
          </label>
        </div>
        <div className="ct-days" role="group" aria-label={t("city.form.days")}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button key={d} type="button" className={`chip${shown.days.includes(d) ? " on" : ""}`} aria-pressed={shown.days.includes(d)} onClick={() => toggleDay(d)}>{dayName(d)}</button>
          ))}
        </div>
      </div>
      <div className="ct-two">
        <Field label={t("city.form.tags")}>{(id) => <input id={id} className="inp" placeholder={t("city.form.tags.ph")} value={v.tags} onChange={(e) => set({ tags: e.target.value })} />}</Field>
        <Field label={t("city.form.seats")}>{(id) => <input id={id} className="inp" type="number" min={1} max={200} value={v.seats} onChange={(e) => set({ seats: Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 1))) })} />}</Field>
      </div>
      <Field label={t("city.form.icon")}>{(id) => <input id={id} className="inp ct-icon" maxLength={8} placeholder={"\u{1F4CD}"} value={v.icon} onChange={(e) => set({ icon: e.target.value })} />}</Field>
      <WidePicture label={t("city.form.picture")} hint={t("city.form.picture.hint")} url={image} onOpen={() => setPic(true)} />
      {err && <div className="jr-err" role="alert">{err}</div>}
      <div className="ct-btns">
        <button type="submit" className="btn cta" disabled={busy}>{t("city.form.save")}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{t("city.form.cancel")}</button>
      </div>
      {pic && (
        <PictureDialog
          name={v.name.trim() || t("city.form.newPlace")}
          title={t("city.form.picture.title", { name: v.name.trim() || t("city.form.newPlace") })}
          hue={200}
          about={v.text}
          interests={v.tags.split(",").map((x) => x.trim()).filter(Boolean)}
          initialPrompt={placePrompt(v.name, v.text)}
          wide
          current={image}
          phone={phone}
          onUse={(url) => { set({ background: url, picture: "" }); setPic(false); }}
          onRemove={() => { set({ background: "", picture: "" }); setPic(false); }}
          onClose={() => setPic(false)}
        />
      )}
    </form>
  );
}

export interface DistrictDraft {
  id?: string;
  name: string;
  kind: string;
  /** (#452) The district's picture, behind its tiles; "" = none. */
  background: string;
}

export function DistrictForm({ initial, canRemove, homes, phone, onSave, onRemove, onCancel }: { initial: DistrictDraft; canRemove: boolean; /** Homes: the name and the picture only. */ homes?: boolean; phone: boolean; onSave: (v: DistrictDraft) => Promise<void>; onRemove?: () => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [pic, setPic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <form className="ct-form" onSubmit={(e) => { e.preventDefault(); if (!v.name.trim()) return setErr(t("city.form.needName")); void run(() => onSave(v)); }}>
      <h2 className="ct-fh">{t(initial.id ? "city.form.editDistrict" : "city.form.newDistrict")}</h2>
      <div className="ct-two">
        <Field label={t("city.form.name")}>{(id) => <input id={id} className="inp" maxLength={40} placeholder={t("city.form.dname.ph")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        {!homes && (
          <Field label={t("city.form.dkind")}>
            {(id) => (
              <select id={id} className="inp" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
                {DISTRICT_KINDS.map((k) => <option key={k} value={k}>{t(`city.dkind.${k}`)}</option>)}
              </select>
            )}
          </Field>
        )}
      </div>
      <WidePicture label={t("city.form.dpicture")} hint={t("city.form.dpicture.hint")} url={v.background} onOpen={() => setPic(true)} />
      {pic && (
        <PictureDialog
          name={v.name.trim() || t("city.form.newDistrict")}
          title={t("city.form.picture.title", { name: v.name.trim() || t("city.form.newDistrict") })}
          hue={200}
          about=""
          interests={[]}
          initialPrompt={districtPrompt(v.name, homes ? "homes" : v.kind)}
          wide
          current={v.background}
          phone={phone}
          onUse={(url) => { setV((x) => ({ ...x, background: url })); setPic(false); }}
          onRemove={() => { setV((x) => ({ ...x, background: "" })); setPic(false); }}
          onClose={() => setPic(false)}
        />
      )}
      {err && <div className="jr-err" role="alert">{err}</div>}
      <div className="ct-btns">
        <button type="submit" className="btn cta" disabled={busy}>{t("city.form.save")}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{t("city.form.cancel")}</button>
        {initial.id && onRemove && !ask && <button type="button" className="btn" disabled={busy || !canRemove} onClick={() => setAsk(true)}>{t("city.form.removeDistrict")}</button>}
      </div>
      {initial.id && !canRemove && <span className="k">{t("city.form.removeDistrict.full")}</span>}
      {ask && onRemove && (
        <div className="ct-ask" role="alertdialog" aria-label={t("city.form.removeDistrict.ask")}>
          <span>{t("city.form.removeDistrict.ask")}</span>
          <button type="button" className="btn danger" disabled={busy} onClick={() => void run(onRemove)}>{t("city.form.remove.yes")}</button>
          <button type="button" className="btn" onClick={() => setAsk(false)}>{t("city.form.keep")}</button>
        </div>
      )}
    </form>
  );
}

/** The picture field of the place and district forms: a wide preview (or "none") and one button that opens the picture window. */
function WidePicture({ label, hint, url, onOpen }: { label: string; hint: string; url: string; onOpen: () => void }) {
  const t = useT();
  const hid = useId();
  return (
    <div className="f" role="group" aria-labelledby={hid}>
      <span className="lb" id={hid}>{label}</span>
      <div className="ct-picrow">
        {url ? <img className="ct-pic is-wide" src={url} alt="" /> : <span className="ct-pic is-wide is-none k">{t("city.form.picture.none")}</span>}
        <button type="button" className="btn" onClick={onOpen}>{t(url ? "city.form.picture.change" : "city.form.picture.add")}</button>
      </div>
      <span className="k">{hint}</span>
    </div>
  );
}

/** The first prompt of a place's picture: a wide view with nobody in it (the people are the characters, drawn over it). */
export const placePrompt = (name: string, text: string) => {
  const about = text.trim().replace(/[.!?…\s]+$/, "");
  return `A wide view of ${name.trim() || "a place in a town"}${about ? ", " + about : ""}. Landscape 16:9, no people, no text, soft light.`;
};

const DISTRICT_LOOK: Record<string, string> = {
  centre: "a small town centre with cafes and shops along a square",
  nature: "a park and a river at the edge of a small town",
  work: "a quiet business street with offices and workshops",
  homes: "a street of apartment buildings with lit windows",
};

export const districtPrompt = (name: string, kind: string) =>
  `A wide view of ${name.trim() || "a district"}, ${DISTRICT_LOOK[kind] ?? "a district of a small town"}. Landscape 16:9, seen from a little above, no people, no text.`;

export type { CityDistrict };
