// The autonomy strip: what the characters do on their own, today. Three modes:
// on (normal), off (autonomy switched off, with a switch), limit (today's post
// limit is reached: the strip turns amber).
import { Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { AUTONOMY } from "@/mock/forum";
import { useNav } from "@/shell/nav";

export type StripMode = "on" | "off" | "limit";

export function Strip({ mode, phone, onSwitch }: { mode: StripMode; phone: boolean; onSwitch: () => void }) {
  const t = useT();
  const nav = useNav();
  const size = phone ? 18 : 20;

  if (mode === "off") {
    return (
      <div className="strip">
        <Flower status="off" size={size} />
        <span className="strip-text">
          <b>{t("forum.strip.off.lead")}</b> {t("forum.strip.off.text")}
        </span>
        <button type="button" className="btn cta" onClick={onSwitch}>{t("forum.strip.off.switch")}</button>
      </div>
    );
  }

  if (mode === "limit") {
    return (
      <div className="strip warn">
        <Flower status="away" size={size} />
        <span className="strip-text">
          <b>{t("forum.strip.limit.lead")}</b> {t("forum.strip.limit.text", { n: AUTONOMY.max, max: AUTONOMY.max })}
        </span>
      </div>
    );
  }

  const count = phone
    ? t("forum.strip.countShort", { n: AUTONOMY.posted, max: AUTONOMY.max })
    : t("forum.strip.count", { n: AUTONOMY.posted, max: AUTONOMY.max });
  const quiet = t("forum.strip.quiet", { from: AUTONOMY.quietFrom, to: AUTONOMY.quietTo });
  return (
    <div className="strip">
      <Flower status="online" size={size} />
      <span className="strip-text">
        <b>{t("forum.strip.lead")}</b> {count} · {quiet}
        {!phone && <> · {t("forum.strip.next", { min: AUTONOMY.nextMin })}</>}
      </span>
      {!phone && (
        <button type="button" className="btn" onClick={() => nav.go("settings")}>{t("forum.strip.configure")}</button>
      )}
    </div>
  );
}
