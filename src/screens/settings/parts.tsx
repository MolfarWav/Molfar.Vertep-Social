import { useEffect, useId, useState, type ReactNode } from "react";
import { useT, currentLang, setLangPref, useLangPref, type LangPref } from "@/i18n/index";
import { PREVIEW, type ModelChoice } from "@/lib/api";
import { canOpenHome, openHome } from "@/lib/shell-home";
import { MODEL_IDS, type SettingsMock } from "@/mock/settings";
import { Pick, Row, Segmented, Switch, type Opt } from "./controls";
import { ModelPick } from "./model-pick";
import { modelOptions } from "./real";
import { roleplayState } from "@/screens/profiles/import-api";
import { BlockIcon, LOOK, type Glyph } from "./tone";
import { reqForm, requestsPerDay, type SettingsError } from "./state";

export type Patch = (p: Partial<SettingsMock>) => void;

/** Desktop card: a title bar (tinted in the block's tone, with its icon) over a body. The title is the card's accessible name. */
export function Card({ title, glyph, children }: { title: string; glyph: Glyph; children: ReactNode }) {
  const id = useId();
  return (
    <section className="sec" data-tone={LOOK[glyph]} aria-labelledby={id}>
      <h2 className="sh" id={id}>
        <BlockIcon glyph={glyph} />
        <span>{title}</span>
      </h2>
      <div className="sb">{children}</div>
    </section>
  );
}

/** Phone group heading: the same tinted bar as a desktop card's title, sitting on top of the section that follows. */
export function GroupHead({ title, glyph }: { title: string; glyph: Glyph }) {
  return (
    <h2 className="gl" data-tone={LOOK[glyph]}>
      <BlockIcon glyph={glyph} />
      <span>{title}</span>
    </h2>
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

/** The save or load failure, one line under the title. It is quiet: no dialog, no colour block. */
export function Notice({ error }: { error: SettingsError | null }) {
  const t = useT();
  if (!error) return null;
  return (
    <div className="sn" role="status">
      {t(error.kind === "load" ? "settings.loadFailed" : "settings.saveFailed", { message: error.message })}
    </div>
  );
}

/**
 * The three model pickers. Each row is a title and a select; the phone stacks them.
 * Preview lists the four mock ids; real mode lists the engine default and the models the user switched on.
 */
export function ModelRows({ s, set, choices }: { s: SettingsMock; set: Patch; choices: ModelChoice[] }) {
  const t = useT();
  const previewOptions = MODEL_IDS.map((id) => ({ value: id, label: t(`settings.model.${id}`) }));
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
            PREVIEW ? (
              <Pick labelledBy={id} value={s.models[r.key]} options={previewOptions} onChange={(v) => set({ models: { ...s.models, [r.key]: v } })} />
            ) : (
              <ModelPick
                labelledBy={id}
                value={s.models[r.key]}
                options={modelOptions(choices, s.models[r.key], t("settings.model.engineDefault"))}
                onChange={(v) => set({ models: { ...s.models, [r.key]: v } })}
              />
            )
          )}
        </Row>
      ))}
      {!PREVIEW && <div className="k hint">{t("settings.models.engineHint")}</div>}
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

/**
 * Language: "Auto" follows the app (the engine's language), English and Ukrainian pin Social to one. It is a choice of
 * this device, not a Social setting the server keeps, so it works in preview too. The phone row's hint (`languageHint`)
 * and this block read the same state.
 */
export function LanguageRows() {
  const t = useT();
  const { pref, lang } = useLangPref();
  const options: Opt<LangPref>[] = [
    { value: "auto", label: t("settings.language.auto") },
    { value: "en", label: t("settings.language.en") },
    { value: "uk", label: t("settings.language.uk") },
  ];
  return (
    <div className="blk">
      <div className="lbl lang-lbl" id="settings-language">
        {t("settings.section.language")}
      </div>
      <Segmented labelledBy="settings-language" options={options} value={pref} onChange={setLangPref} />
      <div className="k hint">{pref === "auto" ? t("settings.language.hint.auto", { lang: t(`settings.language.${lang}`) }) : t("settings.language.hint.fixed")}</div>
    </div>
  );
}

/** One line for the phone row that opens the language block. */
export function languageHint(t: ReturnType<typeof useT>, pref: LangPref, lang: "en" | "uk"): string {
  return pref === "auto" ? t("settings.language.phone.hint.auto", { lang: t(`settings.language.${lang}`) }) : t(`settings.language.${pref}`);
}

/**
 * Roleplay read access: a status chip. In the design preview it has the Revoke / Grant button of the approved board.
 * In the app the answer is the engine's: only the user can allow or revoke it, on Home (the details of this app), so
 * there is no button, the chip says whether reading works now, and the hint says where to change it.
 */
export function AccessControl({ granted, onToggle }: { granted: boolean; onToggle: () => void }) {
  const t = useT();
  const [live, setLive] = useState<"ready" | "closed" | null>(null);
  useEffect(() => {
    if (PREVIEW) return;
    let on = true;
    roleplayState().then((s) => on && setLive(s));
    return () => {
      on = false;
    };
  }, []);
  const on = PREVIEW ? granted : live === "ready";
  return (
    <>
      <div className="ln acc">
        <span className="chip">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            {on ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M6 12h12" fill="none" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" />
            )}
          </svg>
          {t(on ? "settings.access.on" : "settings.access.off")}
        </span>
        {PREVIEW && (
          <>
            <span className="grow" />
            <button type="button" className="btn rev" onClick={onToggle}>
              {t(on ? "settings.access.revoke" : "settings.access.grant")}
            </button>
          </>
        )}
        {!PREVIEW && live !== null && canOpenHome() && (
          <>
            <span className="grow" />
            <button type="button" className="btn" onClick={openHome}>{t("settings.access.openHome")}</button>
          </>
        )}
      </div>
      <div className="k hint">{t(PREVIEW || on ? "settings.access.note" : "settings.access.home")}</div>
    </>
  );
}
