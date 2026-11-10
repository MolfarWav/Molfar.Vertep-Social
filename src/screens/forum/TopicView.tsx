// One topic: the posts and the reply box. Shared by the design preview and the real forum.
// "Quote" picks a post and a chip above the box says whose post it is; the server writes the quote.
import { useEffect, useRef, useState } from "react";
import { useEmoji } from "@/emoji/use-emoji";
import { usePicture, type Attached } from "@/pictures/use-picture";
import { useT } from "@/i18n/index";
import { BackIcon, DotsIcon, LockIcon, SearchIcon } from "./Icons";
import { countLabel } from "./labels";
import type { ShownPost, WriteNotice } from "./model";
import { Pager, type PageTarget } from "./Pager";
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
  onSend: (text: string, quoteOf: string | null, image?: Attached) => Promise<string | null>;
  onRetry: () => void;
  /** Closes (true) or reopens (false) the topic; resolves to an error text, or null when it worked. Real forum only. */
  onSetLocked?: (locked: boolean) => Promise<string | null>;
  /** The page shown and how many there are; absent in the design preview and from an engine that does not page. */
  paging?: { page: number; pages: number; total: number };
  onPage?: (page: PageTarget) => void;
  /** The number of a post to scroll to once the page is drawn (a search result). */
  focusPost?: number;
  /** Opens the forum search (real forum only). */
  onSearch?: () => void;
  /** The user's moderation (real forum only); each resolves to an error text, or null when it worked. */
  onRemovePost?: (post: ShownPost) => Promise<string | null>;
  onDeleteTopic?: () => Promise<string | null>;
  /** Gives or takes back a reaction on a post (real forum only). */
  onReact?: (post: ShownPost, emoji: string) => Promise<void>;
}

export function TopicView(p: TopicViewProps) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<{ id: string; who: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const emoji = useEmoji({ target: ref, value: draft, onChange: setDraft, phone: p.phone, onSticker: p.live ? (s) => void sendSticker(s) : undefined });
  const pic = usePicture({ phone: p.phone });
  const posts = p.posts ?? [];
  const postsLabel = countLabel(t, "posts", p.paging?.total ?? posts.length);
  const pager = p.paging && p.onPage ? <Pager page={p.paging.page} pages={p.paging.pages} onPage={p.onPage} /> : null;
  const searchButton = p.onSearch && (
    <button type="button" className="btn icon-btn" onClick={p.onSearch} aria-label={t("forum.search")} title={t("forum.search")}>
      <SearchIcon size={18} />
    </button>
  );

  // a search result opens on its page: bring the post into view once, and mark it for a moment
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef("");
  const wanted = p.focusPost;
  const drawn = p.posts !== null;
  useEffect(() => {
    if (!wanted || !drawn) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-n="${wanted}"]`);
    const mark = `${p.title}#${wanted}`;
    if (!el || focused.current === mark) return;
    focused.current = mark;
    el.scrollIntoView({ block: "start" });
    el.classList.add("flash");
    const timer = setTimeout(() => el.classList.remove("flash"), 2400);
    return () => clearTimeout(timer);
  }, [wanted, drawn, p.title]);

  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");
  const setLocked = async (locked: boolean) => {
    if (!p.onSetLocked || locking) return;
    setLocking(true);
    setLockError("");
    const err = await p.onSetLocked(locked);
    setLocking(false);
    if (err) setLockError(err);
  };
  // the owner's own switch: close an open topic, reopen a closed one (the real forum only)
  const lockButton = p.onSetLocked && (
    <button type="button" className="btn" onClick={() => void setLocked(!p.locked)} disabled={locking} aria-busy={locking}>
      {p.locked ? (locking ? t("forum.topic.reopening") : t("forum.topic.reopen")) : locking ? t("forum.topic.closing") : t("forum.topic.close")}
    </button>
  );
  const lockErrLine = lockError && <div className="form-err" role="alert">{t("forum.topic.lockFailed", { error: lockError })}</div>;
  const lockedText = t(p.onSetLocked ? "forum.topic.lockedYours" : "forum.topic.locked");

  // the opening post offers "Delete topic"; every other post "Remove"
  const removal = (post: ShownPost) =>
    post.removed || !p.onRemovePost || !p.onDeleteTopic
      ? undefined
      : post.n === 1
        ? { topic: true, run: p.onDeleteTopic }
        : { topic: false, run: () => p.onRemovePost!(post) };

  const focusReply = () => ref.current?.focus();
  const pick = (post: ShownPost) => {
    setQuote({ id: post.id, who: post.who });
    focusReply();
  };
  const send = async () => {
    const text = draft.trim();
    const image = p.live ? pic.attached : null;
    if ((!text && !image) || busy) return;
    setBusy(true);
    setError("");
    const err = await p.onSend(text, quote?.id ?? null, image ?? undefined);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft("");
    setQuote(null);
    pic.clear();
  };
  // a sticker is a reply of its own (the draft stays), like a picture with no text
  const sendSticker = async (sticker: Attached) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const err = await p.onSend("", quote?.id ?? null, sticker);
    setBusy(false);
    if (err) setError(err);
    else setQuote(null);
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
      <div className="s-forum is-phone is-topic" ref={root}>
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
        <div key={`topic-${p.paging?.page ?? 1}`} className="fscroll pg">
          {crumbs}
          {(p.live || p.onSetLocked) && (
            <div className="tools">
              {p.live && !p.locked && <WriteNowButton busy={p.writing} onClick={p.onWriteNow} />}
              {lockButton}
              {searchButton}
            </div>
          )}
          {lockErrLine}
          <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />
          {pager}
          {state}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} phone locked={p.locked} onQuote={pick} onReply={focusReply} remove={removal(post)} onReact={p.onReact} />
          ))}
          {posts.length > 0 && pager}
        </div>
        {p.locked ? (
          <div className="rep lock-rep">
            <LockIcon size={18} />
            <span className="lock-text">{lockedText}</span>
          </div>
        ) : (
          <div className="rep col">
            {chip}
            {p.live && pic.chip}
            {errLine}
            <div className="rep-row">
              {p.live && pic.button}
              {emoji.button}
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
              <button type="button" className="btn cta" onClick={() => void send()} disabled={busy || (!draft.trim() && !pic.attached)}>{t("forum.topic.send")}</button>
            </div>
          </div>
        )}
        {emoji.tray}
        {p.live && pic.dialog}
      </div>
    );
  }

  return (
    <div className="s-forum" ref={root}>
      <div key={`topic-${p.paging?.page ?? 1}`} className="fscroll">
        <div className="wrap tpage">
          {crumbs}
          <div className="ttl">
            <div className="ttl-title">{p.title}</div>
            <span className="ttl-meta">
              {t("forum.topic.page", { page: p.paging?.page ?? 1, pages: p.paging?.pages ?? 1 })} · {postsLabel}
            </span>
            {p.live && !p.locked && <WriteNowButton busy={p.writing} onClick={p.onWriteNow} />}
            {lockButton}
            {searchButton}
            {!p.locked && <button type="button" className="btn cta" onClick={focusReply}>{t("forum.topic.reply")}</button>}
          </div>
          {lockErrLine}
          <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />
          {pager}
          {state}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} phone={false} locked={p.locked} onQuote={pick} onReply={focusReply} remove={removal(post)} onReact={p.onReact} />
          ))}
          {posts.length > 0 && pager}
          {p.locked ? (
            <div className="lockbox">
              <LockIcon />
              <span className="lock-text">{lockedText}</span>
            </div>
          ) : (
            <div className="qr">
              <div className="qr-h">{t("forum.topic.quickLabel")}</div>
              <div className="qr-body">
                {chip}
                {p.live && pic.chip}
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
                  {p.live && pic.button}
                  {emoji.button}
                  <span className="qr-note">{t("forum.topic.note")}</span>
                  {!p.live && <button type="button" className="btn">{t("forum.topic.preview")}</button>}
                  <button type="button" className="btn cta" onClick={() => void send()} disabled={busy || (!draft.trim() && !pic.attached)}>{t("forum.topic.send")}</button>
                </div>
                {p.live && pic.dialog}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
