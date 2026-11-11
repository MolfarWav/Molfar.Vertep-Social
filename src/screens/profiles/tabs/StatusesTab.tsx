// "Розклад статусів": a week of messenger statuses. Pick a brush, click cells.
// Each cell is one time band on one day; the cell carries the colour, the word
// and (through the flower's mark on the brush) the shape, so colour is not alone.
import { Fragment, useState } from "react";
import { useT } from "@/i18n/index";
import { Flower } from "@/components/Flower";
import { STATUS_ORDER, type Status } from "@/mock/status";
import { SectionPage } from "../sections";
import type { TabProps } from "./types";

const BANDS = ["00–03", "03–06", "06–09", "09–12", "12–15", "15–18", "18–21", "21–24"];
const DAY_KEYS = ["profiles.day.mon", "profiles.day.tue", "profiles.day.wed", "profiles.day.thu", "profiles.day.fri", "profiles.day.sat", "profiles.day.sun"];
/** The mock's "now" marker: Sunday 21-24. */
const NOW = { band: 7, day: 6 };

export function StatusesTab({ form, set, name }: TabProps) {
  const t = useT();
  const [brush, setBrush] = useState<Status>("online");
  const [shift, setShift] = useState(true);

  const paint = (band: number, day: number) =>
    set({
      schedule: form.schedule.map((row, r) => (r !== band ? row : row.map((s, d) => (d === day ? brush : s)))),
    });

  return (
    <SectionPage
      tab="statuses"
      label={t("profiles.sec.menu")}
      sections={[
        {
          id: "week",
          title: t("profiles.sec.week"),
          icon: "pulse",
          tone: "teal",
          children: (
            <>
              <p className="k-lg">{t("profiles.status.desc", { name })}</p>

              <div className="row-wrap">
                {STATUS_ORDER.map((s) => (
                  <button key={s} type="button" aria-pressed={brush === s} className={`br${brush === s ? " on" : ""}`} onClick={() => setBrush(s)}>
                    <Flower status={s} size={18} />
                    {t(`profiles.status.${s}`)}
                  </button>
                ))}
                <button type="button" className="sel sel-end">
                  {t("profiles.status.template")} <span aria-hidden="true">▾</span>
                </button>
              </div>

              <div className="grid-scroll">
                <div className="grid">
                  <div className="gh" />
                  {DAY_KEYS.map((k) => (
                    <div key={k} className="gh">{t(k)}</div>
                  ))}
                  {BANDS.map((band, r) => (
                    <Fragment key={band}>
                      <div className="gt">{band}</div>
                      {DAY_KEYS.map((dk, d) => {
                        const s = form.schedule[r][d];
                        const isNow = r === NOW.band && d === NOW.day;
                        return (
                          <button
                            key={dk}
                            type="button"
                            className={`cell st-${s}`}
                            aria-label={t("profiles.status.cellLabel", { day: t(dk), band, status: t(`profiles.status.${s}`) })}
                            onClick={() => paint(r, d)}
                          >
                            {t(`profiles.status.${s}`).toLowerCase()}
                            {isNow && <span className="now">{t("profiles.status.now")}</span>}
                          </button>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </>
          ),
        },
        {
          id: "shift",
          title: t("profiles.sec.shift"),
          icon: "clock",
          tone: "sky",
          children: (
            <div className="row-wrap foot">
              <label className="check">
                <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} />
                {t("profiles.status.shift")}
              </label>
              <span className="k">{t("profiles.status.shiftNote")}</span>
            </div>
          ),
        },
        {
          id: "temp",
          title: t("profiles.sec.temp"),
          icon: "bolt",
          tone: "amber",
          children: (
            <div className="row-wrap foot">
              <span className="temp">{t("profiles.status.temp")}</span>
              <label className="sel">
                <select defaultValue="dnd" aria-label={t("profiles.status.temp")}>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{t(`profiles.status.${s}`)}</option>
                  ))}
                </select>
                <span aria-hidden="true">▾</span>
              </label>
              <label className="sel">
                <select defaultValue="1" aria-label={t("profiles.status.temp")}>
                  <option value="1">{t("profiles.status.durOne")}</option>
                  <option value="3">{t("profiles.status.durThree")}</option>
                </select>
                <span aria-hidden="true">▾</span>
              </label>
              <button type="button" className="btn">{t("profiles.status.apply")}</button>
            </div>
          ),
        },
      ]}
    />
  );
}
