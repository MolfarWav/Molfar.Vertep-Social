import { useId, type ReactNode } from "react";
import { useT, currentLang } from "@/i18n/index";
import { MODEL_IDS, type ModelId, type SettingsMock } from "@/mock/settings";
import { Pick, Row, Switch } from "./controls";
import { reqForm, requestsPerDay } from "./state";

export type Patch = (p: Partial<SettingsMock>) => void;

/** Desktop card: a title bar over a body. The title is the card's accessible name. */
export function Card({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`sec ${className}`.trim()} aria-labelledby={id}>
      <h2 className="sh" id={id}>
        {title}
      </h2>
      <div className="sb">{children}</div>
    </section>
  );
}

/** The estimate line. Desktop shows it as a box with bold numbers, phone as one muted line. */
export function Summary({ s, phone }: { s: SettingsMock; phone: boolean }) {
  const t = useT();
  const n = requestsPerDay(s);
  const count = t("settings.summary.count", { n, req: t(`settings.req.${reqForm(n, currentLang())}`) });
  if (phone) return <div className="k sum-line">{t("settings.summary.phone", { count, used: s.usedToday })}</div>;
  return (
    <div className="sum">
      {t("settings.summary.lead")} <b>{count}</b>
      {t("settings.summary.mid")} <b>{s.usedToday}</b>.
    </div>
  );
}

/** The three model pickers. Each row is a title and a select; the phone stacks them. */
export function ModelRows({ s, set }: { s: SettingsMock; set: Patch }) {
  const t = useT();
  const options = MODEL_IDS.map((id) => ({ value: id, label: t(`settings.model.${id}`) }));
  const rows = [
    { key: "messenger", title: t("settings.models.messenger") },
    { key: "forum", title: t("settings.models.forum") },
    { key: "import", title: t("settings.models.import") },
  ] as const;
  return (
    <>
      {rows.map((r) => (
        <Row key={r.key} title={r.title}>
          {(id) => (
            <Pick<ModelId>
              labelledBy={id}
              value={s.models[r.key]}
              options={options}
              onChange={(v) => set({ models: { ...s.models, [r.key]: v } })}
            />
          )}
        </Row>
      ))}
    </>
  );
}

/** Notification switches: tab counter, system notification, sound. */
export function NotifyRows({ s, set }: { s: SettingsMock; set: Patch }) {
  const t = useT();
  const rows = [
    { key: "tab", title: t("settings.notify.tab") },
    { key: "system", title: t("settings.notify.system") },
    { key: "sound", title: t("settings.notify.sound") },
  ] as const;
  return (
    <>
      {rows.map((r) => (
        <Row key={r.key} title={r.title}>
          {(id) => <Switch labelledBy={id} checked={s.notify[r.key]} onChange={(v) => set({ notify: { ...s.notify, [r.key]: v } })} />}
        </Row>
      ))}
    </>
  );
}

/** Roleplay read access: a status chip and a Revoke / Grant access button. */
export function AccessControl({ granted, onToggle }: { granted: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <div className="ln acc">
      <span className="chip">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          {granted ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M6 12h12" fill="none" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
          )}
        </svg>
        {t(granted ? "settings.access.on" : "settings.access.off")}
      </span>
      <span className="grow" />
      <button type="button" className="btn rev" onClick={onToggle}>
        {t(granted ? "settings.access.revoke" : "settings.access.grant")}
      </button>
    </div>
  );
}
