// Settings > Life (issue MolfarWav/Molfar.Vertep#311). Two switches (a diary for every character; follow the outside world), then
// what the world feed shows: the categories, the place for the weather, and the state of the last fetch with "Update now".
// Desktop draws both parts in one card; the phone puts the second one behind a row (a disclosure).
import { useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import { LIFE_CATS, type SettingsMock } from "@/mock/settings";
import { Row, Switch } from "./controls";
import { loadWorldStatus, lookUpPlace, refreshWorld, type WorldStatus } from "./life-api";
import type { Patch } from "./parts";

/** The two switches. */
export function LifeMain({ s, set, phone = false }: { s: SettingsMock; set: Patch; phone?: boolean }) {
  const t = useT();
  const life = s.life;
  return (
    <>
      <Row title={t("settings.life.on")} hint={t(phone ? "settings.life.on.phone.hint" : "settings.life.on.hint")}>
        {(id) => <Switch labelledBy={id} checked={life.on} onChange={(on) => set({ life: { ...life, on } })} />}
      </Row>
      <Row title={t("settings.life.world")} hint={phone ? undefined : t("settings.life.world.hint")}>
        {(id) => <Switch labelledBy={id} checked={life.world} onChange={(world) => set({ life: { ...life, world } })} />}
      </Row>
    </>
  );
}

/** The categories, the weather place and the feed status. Dimmed (not removed) while the feed is off. */
export function LifeWorld({ s, set }: { s: SettingsMock; set: Patch }) {
  const t = useT();
  const life = s.life;
  const off = !life.on || !life.world;
  const [status, setStatus] = useState<WorldStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [place, setPlace] = useState(life.place);
  const [placeNote, setPlaceNote] = useState<{ kind: "ok" | "none" | "busy"; text: string } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    loadWorldStatus().then((r) => alive.current && setStatus(r));
    return () => {
      alive.current = false;
    };
  }, []);
  // the engine may correct the typed place; follow it unless the user is typing
  useEffect(() => setPlace(life.place), [life.place]);

  const commitPlace = async () => {
    const name = place.trim();
    if (name === life.place) return;
    setPlaceNote({ kind: "busy", text: t("settings.life.place.busy") });
    const r = await lookUpPlace(name);
    if (!alive.current) return;
    if ("error" in r) {
      setPlaceNote({ kind: "none", text: t("settings.life.place.none") });
      return;
    }
    setPlace(r.place);
    set({ life: { ...life, place: r.place } });
    setPlaceNote(r.place ? { kind: "ok", text: t("settings.life.place.found", { name: r.place }) } : null);
    loadWorldStatus().then((x) => alive.current && setStatus(x));
  };

  const refresh = async () => {
    setBusy(true);
    setProblem("");
    const r = await refreshWorld();
    if (!alive.current) return;
    setBusy(false);
    if ("error" in r) setProblem(r.error || t("settings.life.refresh.failed"));
    else setStatus(r.status);
  };

  const failed = status ? Object.keys(status.errors).length : 0;
  const when = status && status.fetchedAt ? new Date(status.fetchedAt).toLocaleString(currentLang()) : "";
  return (
    <div className={`life-world${off ? " is-off" : ""}`} aria-disabled={off || undefined}>
      <div className="blk">
        <div className="lbl" id="settings-life-cats">
          {t("settings.life.cats")}
        </div>
        <div className="cats" role="group" aria-labelledby="settings-life-cats">
          {LIFE_CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={`cat${life.cats[c] ? " on" : ""}`}
              aria-pressed={life.cats[c]}
              disabled={off}
              onClick={() => set({ life: { ...life, cats: { ...life.cats, [c]: !life.cats[c] } } })}
            >
              {t(`settings.life.cat.${c}`)}
            </button>
          ))}
        </div>
        <div className="k hint">{t("settings.life.cats.hint")}</div>
      </div>

      <Row title={t("settings.life.place")} hint={t("settings.life.place.hint")} className="col">
        {(id) => (
          <>
            <input
              className="txt"
              aria-labelledby={id}
              value={place}
              maxLength={80}
              placeholder={t("settings.life.place.ph")}
              disabled={off}
              onChange={(e) => setPlace(e.target.value)}
              onBlur={commitPlace}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur() as void)}
            />
            {placeNote && (
              <span className={`k life-note ${placeNote.kind}`} role="status">
                {placeNote.text}
              </span>
            )}
          </>
        )}
      </Row>

      <div className="ln life-status">
        <div className="t">
          <b>{t("settings.life.status")}</b>
          <span className="k" role="status">
            {status ? (when ? t("settings.life.status.line", { when, n: status.count }) : t("settings.life.status.none")) : t("settings.life.status.unknown")}
            {failed > 0 && ` · ${t("settings.life.status.failed", { n: failed })}`}
          </span>
          {problem && <span className="k life-note none">{problem}</span>}
        </div>
        <button type="button" className="btn" disabled={off || busy} onClick={refresh}>
          {busy ? t("settings.life.refresh.busy") : t("settings.life.refresh")}
        </button>
      </div>
    </div>
  );
}
