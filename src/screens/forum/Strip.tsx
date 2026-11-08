// The autonomy strip: what the characters do on their own, today. States: on (normal), off (with a switch),
// limit (today's post limit is reached: amber), quiet (quiet hours), nobody (no profiles yet).
// "Write now" is a test control: it asks the characters' model at once and posts, so nobody waits.
import { Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { useNav } from "@/shell/nav";
import type { StripData, WriteNotice } from "./model";

/** The "Write now" button; `busy` shows the wait, and the button stays put so the layout does not jump. */
export function WriteNowButton({ busy, onClick, disabled }: { busy: boolean; onClick: () => void; disabled?: boolean }) {
  const t = useT();
  return (
    <button type="button" className="btn" onClick={onClick} disabled={busy || disabled} aria-busy={busy}>
      {busy ? t("forum.strip.writing") : t("forum.strip.writeNow")}
    </button>
  );
}

/** What came of "Write now": a line under the strip (a status for screen readers), with a way to close it. */
export function NoticeLine({ notice, onClose }: { notice: WriteNotice | null; onClose: () => void }) {
  const t = useT();
  const nav = useNav();
  if (!notice) return null;
  return (
    <div className={`notice ${notice.kind}`} role="status">
      <span className="notice-text">
        {notice.text}
        {notice.noModel && (
          <>
            {" "}
            <button type="button" className="linkbtn" onClick={() => nav.go("settings")}>{t("forum.notice.settings")}</button>
          </>
        )}
      </span>
      <button type="button" className="notice-x" onClick={onClose} aria-label={t("forum.notice.close")}>×</button>
    </div>
  );
}

export interface StripProps {
  data: StripData;
  phone: boolean;
  onSwitch: () => void;
  onWriteNow: () => void;
  writing: boolean;
}

export function Strip({ data, phone, onSwitch, onWriteNow, writing }: StripProps) {
  const t = useT();
  const nav = useNav();
  const size = phone ? 18 : 20;
  const write = <WriteNowButton busy={writing} onClick={onWriteNow} />;

  if (data.state === "off") {
    return (
      <div className="strip">
        <Flower status="off" size={size} />
        <span className="strip-text">
          <b>{t("forum.strip.off.lead")}</b> {t("forum.strip.off.text")}
        </span>
        <div className="strip-acts">
          {write}
          <button type="button" className="btn cta" onClick={onSwitch}>{t("forum.strip.off.switch")}</button>
        </div>
      </div>
    );
  }

  if (data.state === "nobody") {
    return (
      <div className="strip warn">
        <Flower status="away" size={size} />
        <span className="strip-text">
          <b>{t("forum.strip.nobody.lead")}</b> {t("forum.strip.nobody.text")}
        </span>
        <div className="strip-acts">
          <button type="button" className="btn cta" onClick={() => nav.go("profiles")}>{t("forum.strip.nobody.link")}</button>
        </div>
      </div>
    );
  }

  if (data.state === "limit") {
    return (
      <div className="strip warn">
        <Flower status="away" size={size} />
        <span className="strip-text">
          <b>{t("forum.strip.limit.lead")}</b> {t("forum.strip.limit.text", { n: data.posted, max: data.max })}
        </span>
        <div className="strip-acts">{write}</div>
      </div>
    );
  }

  const quiet = t("forum.strip.quiet", { from: data.quietFrom, to: data.quietTo });
  if (data.state === "quiet") {
    return (
      <div className="strip">
        <Flower status="dnd" size={size} />
        <span className="strip-text">
          <b>{t("forum.strip.quiet.lead")}</b> {t("forum.strip.quiet.text", { to: data.quietTo })}
        </span>
        <div className="strip-acts">
          {write}
          {!phone && <button type="button" className="btn" onClick={() => nav.go("settings")}>{t("forum.strip.configure")}</button>}
        </div>
      </div>
    );
  }

  const count = phone
    ? t("forum.strip.countShort", { n: data.posted, max: data.max })
    : t("forum.strip.count", { n: data.posted, max: data.max });
  const next = data.nextMin === null ? "" : data.nextMin <= 1 ? t("forum.strip.nextSoon") : t("forum.strip.next", { min: data.nextMin });
  return (
    <div className="strip">
      <Flower status="online" size={size} />
      <span className="strip-text">
        <b>{t("forum.strip.lead")}</b> {count} · {quiet}
        {!phone && next && <> · {next}</>}
      </span>
      <div className="strip-acts">
        {write}
        {!phone && <button type="button" className="btn" onClick={() => nav.go("settings")}>{t("forum.strip.configure")}</button>}
      </div>
    </div>
  );
}
