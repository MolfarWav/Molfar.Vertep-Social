// One topic: the posts and the reply box. Shared by the design preview and the real forum.
// "Quote" picks a post and a chip above the box says whose post it is; the server writes the quote.
import { useRef, useState } from "react";
import { useT } from "@/i18n/index";
import { BackIcon, DotsIcon, LockIcon } from "./Icons";
import { countLabel } from "./labels";
import type { ShownPost, WriteNotice } from "./model";
import { PostCard } from "./PostCard";
import { NoticeLine, WriteNowButton } from "./Strip";

export interface TopicViewProps {
  phone: boolean;
  /** false in the design preview: the phone's "more" button is mock there. */
  live: boolean;
  title: string;
  category: string;
  board: { id: string; name: string } | null;
  posts: ShownPost[] | null;
  error: string;
  locked: boolean;
  writing: boolean;
  notice: WriteNotice | null;
  onCloseNotice: () => void;
  onWriteNow: () => void;
  onHome: () => void;
  onBoard: () => void;
  /** Sends a reply; resolves to an error text, or null when it worked. */
  onSend: (text: string, quoteOf: string | null) => Promise<string | null>;
  onRetry: () => void;
}

export function TopicView(p: TopicViewProps) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<{ id: string; who: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const posts = p.posts ?? [];
  const postsLabel = countLabel(t, "posts", posts.length);

  const focusReply = () => ref.current?.focus();
  const pick = (post: ShownPost) => {
    setQuote({ id: post.id, who: post.who });
    focusReply();
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    const err = await p.onSend(text, quote?.id ?? null);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft("");
    setQuote(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  };
  const chip = quote && (
    <div className="qchip">
      <span>{t("forum.topic.quoting", { who: quote.who })}</span>
      <button type="button" className="notice-x" onClick={() => setQuote(null)} aria-label={t("forum.topic.quoteRemove")}>×</button>
    </div>
  );
  const errLine = error && <div className="form-err" role="alert">{t("forum.topic.sendFailed", { error })}</div>;
  const state = p.error ? (
    <div className="empty">
      <div className="empty-text">{t("forum.error.load", { error: p.error })}</div>
      <button type="button" className="btn" onClick={p.onRetry}>{t("forum.retry")}</button>
    </div>
  ) : p.posts === null ? (
    <div className="mut pad">{t("forum.loading")}</div>
  ) : null;

  const crumbs = (
    <nav className="crumbs" aria-label="Breadcrumb">
      <button type="button" className="linkbtn" onClick={p.onHome}>{t("forum.crumb.forum")}</button>
      <span aria-hidden="true">›</span>
      {p.category && (
        <>
          <span>{p.category}</span>
          <span aria-hidden="true">›</span>
        </>
      )}
      <button type="button" className="linkbtn" onClick={p.onBoard}>{p.board?.name ?? ""}</button>
      {!p.phone && (
        <>
          <span aria-hidden="true">›</span>
          <span className="here">{p.title}</span>
        </>
      )}
    </nav>
  );

  if (p.phone) {
    return (
      <div className="s-forum is-phone is-topic">
        <header className="hd">
          <button type="button" className="hd-btn" aria-label={t("forum.topic.back")} onClick={p.onBoard}>
            <BackIcon />
          </button>
          <div className="hd-text">
            <div className="hd-title">{p.title}</div>
            <div className="hd-sub">
              {p.board?.name} · {postsLabel}
            </div>
          </div>
          {!p.live && (
            <button type="button" className="hd-btn" aria-label={t("forum.topic.more")}>
              <DotsIcon />
            </button>
          )}
        </header>
        <div key="topic" className="fscroll pg">
          {crumbs}
          {p.live && (
            <div className="tools">
              <WriteNowButton busy={p.writing} onClick={p.onWriteNow} />
            </div>
          )}
          <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />
          {state}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} phone locked={p.locked} onQuote={pick} onReply={focusReply} />
          ))}
        </div>
        {p.locked ? (
          <div className="rep lock-rep">
            <LockIcon size={18} />
            {t("forum.topic.locked")}
          </div>
        ) : (
          <div className="rep col">
            {chip}
            {errLine}
            <div className="rep-row">
              <textarea
                ref={ref}
                className="inp"
                rows={1}
                aria-label={t("forum.topic.quickLabel")}
                placeholder={t("forum.topic.placeholderPhone")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
              />
              <button type="button" className="btn cta" onClick={() => void send()} disabled={busy || !draft.trim()}>{t("forum.topic.send")}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="s-forum">
      <div key="topic" className="fscroll">
        <div className="wrap tpage">
          {crumbs}
          <div className="ttl">
            <div className="ttl-title">{p.title}</div>
            <span className="ttl-meta">
              {t("forum.topic.page", { page: 1, pages: 1 })} · {postsLabel}
            </span>
            {p.live && <WriteNowButton busy={p.writing} onClick={p.onWriteNow} />}
            {!p.locked && <button type="button" className="btn cta" onClick={focusReply}>{t("forum.topic.reply")}</button>}
          </div>
          <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />
          {state}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} phone={false} locked={p.locked} onQuote={pick} onReply={focusReply} />
          ))}
          {p.locked ? (
            <div className="lockbox">
              <LockIcon />
              {t("forum.topic.locked")}
            </div>
          ) : (
            <div className="qr">
              <div className="qr-h">{t("forum.topic.quickLabel")}</div>
              <div className="qr-body">
                {chip}
                <textarea
                  ref={ref}
                  className="inp"
                  aria-label={t("forum.topic.quickLabel")}
                  placeholder={t("forum.topic.placeholder")}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                />
                {errLine}
                <div className="qr-row">
                  <span className="qr-note">{t("forum.topic.note")}</span>
                  {!p.live && <button type="button" className="btn">{t("forum.topic.preview")}</button>}
                  <button type="button" className="btn cta" onClick={() => void send()} disabled={busy || !draft.trim()}>{t("forum.topic.send")}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
