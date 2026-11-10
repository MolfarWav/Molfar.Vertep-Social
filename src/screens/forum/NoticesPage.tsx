// "Replies to you": who answered your posts or reacted to them, newest first. A row opens the topic on its last page.
// Opening the page counts everything so far as seen (the live route does that). Real forum only; the design preview draws it on mock rows.
import { useT } from "@/i18n/index";
import { Ava, bgOf, initial } from "./Ava";
import { BackIcon } from "./Icons";
import type { NoticeRow } from "./model";

export interface NoticesPageProps {
  phone: boolean;
  /** null while the answer is on its way. */
  rows: NoticeRow[] | null;
  error: string;
  onOpen: (row: NoticeRow) => void;
  onHome: () => void;
  onRetry: () => void;
}

function Row({ r, onOpen }: { r: NoticeRow; onOpen: (r: NoticeRow) => void }) {
  const t = useT();
  return (
    <button type="button" className={`nrow${r.isNew ? " is-new" : ""}`} onClick={() => onOpen(r)}>
      <Ava text={initial(r.who)} bg={bgOf(r.hue)} size={36} font={16} radius={8} picture={r.picture || undefined} />
      <span className="nrow-body">
        <span className="nrow-line">
          <b>{r.who}</b> {t(`forum.notices.${r.kind}` as never)}
          {r.emoji && <span className="nrow-emoji" aria-hidden="true"> {r.emoji}</span>}
          {r.isNew && <span className="nrow-new"> {t("forum.notices.new")}</span>}
        </span>
        {r.excerpt && <span className="nrow-excerpt">{r.excerpt}</span>}
        <span className="nrow-meta">
          {t("forum.notices.in", { title: r.title })} · {r.when}
        </span>
      </span>
    </button>
  );
}

export function NoticesPage(p: NoticesPageProps) {
  const t = useT();
  const rows = p.rows;
  const state = p.error ? (
    <div className="empty">
      <div className="empty-text">{t("forum.error.load", { error: p.error })}</div>
      <button type="button" className="btn" onClick={p.onRetry}>{t("forum.retry")}</button>
    </div>
  ) : rows === null ? (
    <div className="mut pad" aria-busy="true">{t("forum.loading")}</div>
  ) : rows.length === 0 ? (
    <div className="empty">
      <div className="empty-title">{t("forum.notices.none.title")}</div>
      <div className="empty-text">{t("forum.notices.none.text")}</div>
    </div>
  ) : null;
  const list = rows && rows.length > 0 && (
    <div className="cat">
      {rows.map((r) => (
        <Row key={r.id} r={r} onOpen={p.onOpen} />
      ))}
    </div>
  );

  if (p.phone) {
    return (
      <div className="s-forum is-phone is-topic">
        <header className="hd">
          <button type="button" className="hd-btn" aria-label={t("forum.board.back")} onClick={p.onHome}>
            <BackIcon />
          </button>
          <div className="hd-text">
            <div className="hd-title">{t("forum.notices.title")}</div>
          </div>
        </header>
        <div key="notices" className="fscroll pg">
          {state}
          {list}
        </div>
      </div>
    );
  }
  return (
    <div className="s-forum">
      <div key="notices" className="fscroll">
        <div className="wrap tpage">
          <nav className="crumbs" aria-label="Breadcrumb">
            <button type="button" className="linkbtn" onClick={p.onHome}>{t("forum.crumb.forum")}</button>
            <span aria-hidden="true">›</span>
            <span className="here">{t("forum.notices.title")}</span>
          </nav>
          <div className="ttl">
            <div className="ttl-title">{t("forum.notices.title")}</div>
          </div>
          {state}
          {list}
        </div>
      </div>
    </div>
  );
}
