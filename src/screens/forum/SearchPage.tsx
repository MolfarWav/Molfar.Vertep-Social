// Forum search: a field, and the topics that hold every word, each with a snippet around the match. A result opens the
// topic on the page of the first matching post and scrolls to it. Real forum only (the design preview has no search).
import { useState } from "react";
import { useT } from "@/i18n/index";
import { Ava, bgOf, initial, MY_BG } from "./Ava";
import { BackIcon, SearchIcon } from "./Icons";
import { countLabel } from "./labels";
import { highlightParts, type SearchRow } from "./model";

export interface SearchPageProps {
  phone: boolean;
  /** The words in the field now (the route's query). */
  q: string;
  /** null while the answer is on its way. */
  rows: SearchRow[] | null;
  words: string[];
  /** The query is too short to ask (the field is empty or one character). */
  idle: boolean;
  truncated: boolean;
  error: string;
  onSearch: (q: string) => void;
  onOpen: (row: SearchRow) => void;
  onHome: () => void;
  onRetry: () => void;
}

function Marked({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {highlightParts(text, words).map((part, i) =>
        part.hit ? (
          <mark key={i}>{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function ResultRow({ r, words, onOpen }: { r: SearchRow; words: string[]; onOpen: (r: SearchRow) => void }) {
  const t = useT();
  return (
    <button type="button" className="srow" onClick={() => onOpen(r)}>
      <span className="srow-title">
        <Marked text={r.title} words={words} />
      </span>
      {r.where && <span className="srow-where">{r.where}</span>}
      <span className="srow-snip">
        <Marked text={r.snippet} words={words} />
      </span>
      <span className="srow-meta">
        <Ava text={initial(r.who)} bg={r.me ? MY_BG : bgOf(r.hue ?? 200)} size={20} font={10} />
        <span>{r.who}</span>
        <span aria-hidden="true">·</span>
        <span>{r.when}</span>
        <span aria-hidden="true">·</span>
        <span>{t("forum.search.post", { n: r.n })}</span>
        {r.matches > 1 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{countLabel(t, "matches", r.matches)}</span>
          </>
        )}
      </span>
    </button>
  );
}

export function SearchPage(p: SearchPageProps) {
  const t = useT();
  const [draft, setDraft] = useState(p.q);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    p.onSearch(draft.trim());
  };
  const form = (
    <form className="sform" role="search" onSubmit={submit}>
      <input
        className="search"
        type="search"
        enterKeyHint="search"
        autoFocus={!p.phone && !p.q}
        aria-label={t("forum.search")}
        placeholder={t("forum.search.placeholder")}
        maxLength={80}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" className="btn cta">
        <SearchIcon size={18} />
        {t("forum.search.go")}
      </button>
    </form>
  );
  const rows = p.rows;
  const state = p.idle ? (
    <div className="empty">
      <div className="empty-text">{t(p.q.trim() ? "forum.search.tooShort" : "forum.search.hint")}</div>
    </div>
  ) : p.error ? (
    <div className="empty">
      <div className="empty-text">{t("forum.error.load", { error: p.error })}</div>
      <button type="button" className="btn" onClick={p.onRetry}>{t("forum.retry")}</button>
    </div>
  ) : rows === null ? (
    <div className="mut pad" aria-busy="true">{t("forum.search.loading")}</div>
  ) : rows.length === 0 ? (
    <div className="empty">
      <div className="empty-title">{t("forum.search.none.title")}</div>
      <div className="empty-text">{t("forum.search.none.text", { q: p.q })}</div>
    </div>
  ) : null;
  const list = rows && rows.length > 0 && (
    <>
      <div className="mut sfound" role="status">
        {t("forum.search.found", { topics: countLabel(t, "topics", rows.length), q: p.q })}
        {p.truncated && ` ${t("forum.search.truncated", { n: rows.length })}`}
      </div>
      <div className="cat">
        {rows.map((r) => (
          <ResultRow key={r.id} r={r} words={p.words} onOpen={p.onOpen} />
        ))}
      </div>
    </>
  );

  if (p.phone) {
    return (
      <div className="s-forum is-phone is-topic">
        <header className="hd">
          <button type="button" className="hd-btn" aria-label={t("forum.board.back")} onClick={p.onHome}>
            <BackIcon />
          </button>
          <div className="hd-text">
            <div className="hd-title">{t("forum.search.title")}</div>
          </div>
        </header>
        <div key="search" className="fscroll pg">
          {form}
          {state}
          {list}
        </div>
      </div>
    );
  }
  return (
    <div className="s-forum">
      <div key="search" className="fscroll">
        <div className="wrap tpage">
          <nav className="crumbs" aria-label="Breadcrumb">
            <button type="button" className="linkbtn" onClick={p.onHome}>{t("forum.crumb.forum")}</button>
            <span aria-hidden="true">›</span>
            <span className="here">{t("forum.search.title")}</span>
          </nav>
          <div className="ttl">
            <div className="ttl-title">{t("forum.search.title")}</div>
          </div>
          {form}
          {state}
          {list}
        </div>
      </div>
    </div>
  );
}
