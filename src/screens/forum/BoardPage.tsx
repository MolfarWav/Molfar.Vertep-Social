// A board's page: its topics, latest activity first (a new topic and a topic with a new reply rise to the top,
// like on phpBB). A table on desktop, cards on phone.
import { useT } from "@/i18n/index";
import { hueOf } from "@/mock/forum";
import { Ava, bgOf, initial, MY_BG } from "./Ava";
import { BackIcon, LockIcon, PlusIcon, SearchIcon } from "./Icons";
import { countLabel } from "./labels";
import type { TopicRow, WriteNotice } from "./model";
import { NoticeLine, WriteNowButton } from "./Strip";

export interface BoardInfo {
  id: string;
  name: string;
  desc: string;
  category: string;
}

export interface BoardPageProps {
  phone: boolean;
  board: BoardInfo;
  /** null while the topics load. */
  rows: TopicRow[] | null;
  error: string;
  writing: boolean;
  notice: WriteNotice | null;
  onCloseNotice: () => void;
  onWriteNow: () => void;
  onHome: () => void;
  /** A topic was picked; `unread` says it has posts the user has not seen (the live forum opens such a topic on its last page). */
  onTopic: (id: string, unread: boolean) => void;
  onNew: () => void;
  /** Opens the forum search (real forum only). */
  onSearch?: () => void;
  onRetry: () => void;
}

function Who({ who, hue, size }: { who: string; hue?: number; size: number }) {
  return <Ava text={initial(who)} bg={hue === undefined && who === "" ? MY_BG : bgOf(hue ?? hueOf(who))} size={size} font={Math.round(size * 0.46)} />;
}

function Name({ r }: { r: TopicRow }) {
  const t = useT();
  return (
    <>
      {r.locked && <LockIcon size={14} />}
      {r.event && <span className="evmark">{t(`forum.event.kind.${r.event}` as never)}</span>}
      <span className="trow-title">{r.title}</span>
      {r.unread && <span className="newmark">{t("forum.board.newMark")}</span>}
    </>
  );
}

export function BoardPage(p: BoardPageProps) {
  const t = useT();
  const rows = p.rows;
  const tools = (
    <>
      <WriteNowButton busy={p.writing} onClick={p.onWriteNow} />
      {p.onSearch && (
        <button type="button" className="btn icon-btn" onClick={p.onSearch} aria-label={t("forum.search")} title={t("forum.search")}>
          <SearchIcon size={18} />
        </button>
      )}
      <button type="button" className="btn cta" onClick={p.onNew}>
        <PlusIcon />
        {t("forum.newTopic")}
      </button>
    </>
  );
  const state = p.error ? (
    <div className="empty">
      <div className="empty-text">{t("forum.error.load", { error: p.error })}</div>
      <button type="button" className="btn" onClick={p.onRetry}>{t("forum.retry")}</button>
    </div>
  ) : rows === null ? (
    <div className="mut pad">{t("forum.loading")}</div>
  ) : rows.length === 0 ? (
    <div className="empty">
      <div className="empty-title">{t("forum.board.empty.title")}</div>
      <div className="empty-text">{t("forum.board.empty.text")}</div>
    </div>
  ) : null;

  if (p.phone) {
    return (
      <div className="s-forum is-phone is-topic">
        <header className="hd">
          <button type="button" className="hd-btn" aria-label={t("forum.board.back")} onClick={p.onHome}>
            <BackIcon />
          </button>
          <div className="hd-text">
            <div className="hd-title">{p.board.name}</div>
            <div className="hd-sub">{p.board.category}</div>
          </div>
        </header>
        <div key="board" className="fscroll pg">
          <div className="tools">{tools}</div>
          <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />
          {state}
          {rows && rows.length > 0 && (
            <div className="pcat">
              {rows.map((r) => (
                <div className="pcard" key={r.id}>
                  <button type="button" className="linkbtn ft trow-name" onClick={() => p.onTopic(r.id, r.unread)}>
                    <Name r={r} />
                  </button>
                  <div className="pcnt">
                    {t("forum.board.by", { who: r.who })} · {countLabel(t, "replies", r.replies)}
                  </div>
                  <div className="plast">
                    <Who who={r.last.who} hue={r.last.hue} size={24} />
                    <span className="plast-text">{t("forum.byPhone", { who: r.last.who, when: r.last.whenShort })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="s-forum">
      <div key="board" className="fscroll">
        <div className="wrap tpage">
          <nav className="crumbs" aria-label="Breadcrumb">
            <button type="button" className="linkbtn" onClick={p.onHome}>{t("forum.crumb.forum")}</button>
            <span aria-hidden="true">›</span>
            <span>{p.board.category}</span>
            <span aria-hidden="true">›</span>
            <span className="here">{p.board.name}</span>
          </nav>
          <div className="ttl">
            <div className="ttl-title">
              {p.board.name}
              {p.board.desc && <div className="ttl-sub">{p.board.desc}</div>}
            </div>
            {tools}
          </div>
          <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />
          {state}
          {rows && rows.length > 0 && (
            <div className="cat">
              <div className="catbar trowbar">
                <span>{t("forum.board.col.topic")}</span>
                <span className="c">{t("forum.board.col.replies")}</span>
                <span>{t("forum.cat.last")}</span>
              </div>
              {rows.map((r) => (
                <div className="frow trow" key={r.id}>
                  <div style={{ minWidth: 0 }}>
                    <button type="button" className="linkbtn ft trow-name" onClick={() => p.onTopic(r.id, r.unread)}>
                      <Name r={r} />
                    </button>
                    <div className="fd">{t("forum.board.by", { who: r.who })}</div>
                  </div>
                  <div className="num">{r.replies}</div>
                  <div className="last">
                    <Who who={r.last.who} hue={r.last.hue} size={28} />
                    <div className="t">
                      <span className="lt">{r.last.who}</span>
                      <span className="lw">{r.last.when}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
