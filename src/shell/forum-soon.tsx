// The Forum tab of the installed app until the forum plugin exists (the design preview still shows the mock forum).
import { useT } from "@/i18n/index";

export function ForumSoon() {
  const t = useT();
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: "24px 16px", textAlign: "center" }}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontFamily: "Kurale, serif", fontSize: 20, marginBottom: 8 }}>{t("shell.forumSoon.title")}</div>
        <p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>{t("shell.forumSoon.text")}</p>
      </div>
    </div>
  );
}
