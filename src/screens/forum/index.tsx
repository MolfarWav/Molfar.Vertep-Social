/**
 * Forum screen: the boards (home) and one topic page.
 *
 * Preview parameters (the URL query, e.g. `?screen=forum&view=topic&theme=dark`):
 *   (none)              forum home: banner, autonomy strip, boards, who is online, statistics
 *   view=topic          the topic page. Clicking a board or a last post opens it (mock: always this topic)
 *   state=noboards      home without boards: the empty state
 *   state=notopics      home where the first board has no topics
 *   state=autonomyoff   the strip says autonomy is off, with a switch (the switch turns it on)
 *   state=limit         the strip is amber: today's post limit is reached
 *   state=locked        topic: a lock note instead of the reply box (use with view=topic)
 *   state=moderated     topic: post 2 is a moderator's placeholder (use with view=topic)
 *
 * Mock only: the search, new topic, preview, more and "ask Molfar" buttons do nothing.
 * A reply (quick reply or Send) appends a post by the user to the topic.
 */
import { useRef, useState } from "react";
import "./forum.css";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { BarActions, useChrome, useNav } from "@/shell/nav";
import { ME } from "@/mock/characters";
import { AUTONOMY, CATEGORIES, ONLINE, STATS, TOPIC, type MockCategory, type MockPost } from "@/mock/forum";
import { BoardCards, BoardTable } from "./Boards";
import { BackIcon, DotsIcon, LockIcon, PlusIcon, SearchIcon } from "./Icons";
import { countLabel } from "./labels";
import { PostCard, type ShownPost } from "./PostCard";
import { Strip, type StripMode } from "./Strip";

type View = "home" | "topic";

function urlParam(name: string): string {
  try {
    return new URLSearchParams(location.search).get(name) ?? "";
  } catch {
    return "";
  }
}

/** The boards for a preview state (mock): none, or the first one without topics. */
function boardsFor(state: string): MockCategory[] {
  if (state === "noboards") return [];
  if (state === "notopics") {
    return CATEGORIES.map((c, i) =>
      i === 0 ? { ...c, boards: c.boards.map((b, j) => (j === 0 ? { ...b, topics: 0, posts: 0, last: null } : b)) } : c,
    );
  }
  return CATEGORIES;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A reply by the user, appended to the mock topic. */
function makeReply(text: string, all: MockPost[]): MockPost {
  const me = [...all].reverse().find((p) => p.me);
  const now = new Date();
  return {
    id: all.length + 1,
    who: ME.name,
    me: true,
    role: me?.role ?? "Господар",
    count: (me?.count ?? 31) + 1,
    joined: me?.joined ?? "02.11.2026",
    subject: `Re: ${TOPIC.title}`,
    clock: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    text,
  };
}

export function Forum() {
  const t = useT();
  const phone = useIsPhone();
  const nav = useNav();
  const [preview] = useState(() => urlParam("state"));
  const [view, setView] = useState<View>(() => (urlParam("view") === "topic" ? "topic" : "home"));
  const [autonomyOn, setAutonomyOn] = useState(preview !== "autonomyoff");
  const [replies, setReplies] = useState<MockPost[]>([]);
  const [draft, setDraft] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // The topic on phone is a full-height page with its own header: no shell bar, no tabs.
  const topicPhone = phone && view === "topic";
  useChrome({ bar: !topicPhone, tabs: !topicPhone });

  const locked = preview === "locked";
  const categories = boardsFor(preview);
  const all = [...TOPIC.posts, ...replies];
  const shown: ShownPost[] = all.map((p) => (preview === "moderated" && p.id === 2 ? { ...p, removed: true } : p));
  const mode: StripMode = !autonomyOn ? "off" : preview === "limit" ? "limit" : "on";
  const home = () => setView("home");
  const topic = () => setView("topic");
  const focusReply = () => replyRef.current?.focus();
  const quote = (p: ShownPost) => {
    setDraft((d) => `${d}> ${p.text}\n`);
    focusReply();
  };
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setReplies((r) => [...r, makeReply(text, all)]);
    setDraft("");
  };
  const switchOn = () => setAutonomyOn(true);
  const postsLabel = countLabel(t, "posts", shown.length);

  if (view === "home") {
    if (phone) {
      return (
        <div className="s-forum is-phone">
          <BarActions>
            <button type="button" className="ib" style={{ width: 44, height: 44 }} aria-label={t("forum.search")}>
              <SearchIcon size={20} />
            </button>
          </BarActions>
          <div key="home" className="fscroll pg">
            <div className="ban">
              <div className="ban-text">
                <div className="ban-title">{t("forum.title")}</div>
              </div>
              <button type="button" className="btn cta">
                <PlusIcon />
                {t("forum.newTopic")}
              </button>
            </div>
            <Strip mode={mode} phone onSwitch={switchOn} />
            {categories.length > 0 ? <BoardCards categories={categories} onOpen={topic} /> : <Empty />}
          </div>
        </div>
      );
    }
    return (
      <div className="s-forum">
        <div key="home" className="fscroll">
          <div className="wrap">
            <div className="ban">
              <div className="ban-text">
                <div className="ban-title">{t("forum.title")}</div>
                <div className="mut">{t("forum.intro")}</div>
              </div>
              <input className="search" aria-label={t("forum.search")} placeholder={t("forum.search.placeholder")} />
              <button type="button" className="btn cta">
                <PlusIcon />
                {t("forum.newTopic")}
              </button>
            </div>
            <Strip mode={mode} phone={false} onSwitch={switchOn} />
            {categories.length > 0 ? <BoardTable categories={categories} onOpen={topic} /> : <Empty />}
            {categories.length > 0 && (
              <div className="two">
                <div className="box">
                  <div className="h">{t("forum.online.title")}</div>
                  <div className="b">
                    <div>
                      {t("forum.online.here")}{" "}
                      {ONLINE.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          {n === ME.name ? <b className="self">{t("shell.me")}</b> : n}
                        </span>
                      ))}
                    </div>
                    <div className="mut">{t("forum.online.note")}</div>
                  </div>
                </div>
                <div className="box">
                  <div className="h">{t("forum.stats.title")}</div>
                  <div className="b">
                    <div>
                      {t("forum.stats.posts")}: <b>{STATS.posts}</b> · {t("forum.stats.topics")}: <b>{STATS.topics}</b> ·{" "}
                      {t("forum.stats.members")}: <b>{STATS.members}</b>
                    </div>
                    <div className="mut">{t("forum.stats.newest", { name: STATS.newest })}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Topic page.
  const crumbs = (
    <nav className="crumbs" aria-label="Breadcrumb">
      <button type="button" className="linkbtn" onClick={home}>{t("forum.crumb.forum")}</button>
      <span aria-hidden="true">›</span>
      <button type="button" className="linkbtn" onClick={home}>{TOPIC.category}</button>
      <span aria-hidden="true">›</span>
      <button type="button" className="linkbtn" onClick={home}>{TOPIC.board}</button>
      {!phone && (
        <>
          <span aria-hidden="true">›</span>
          <span className="here">{TOPIC.title}</span>
        </>
      )}
    </nav>
  );

  if (phone) {
    return (
      <div className="s-forum is-phone is-topic">
        <header className="hd">
          <button type="button" className="hd-btn" aria-label={t("forum.topic.back")} onClick={home}>
            <BackIcon />
          </button>
          <div className="hd-text">
            <div className="hd-title">{TOPIC.title}</div>
            <div className="hd-sub">
              {TOPIC.board} · {postsLabel}
            </div>
          </div>
          <button type="button" className="hd-btn" aria-label={t("forum.topic.more")}>
            <DotsIcon />
          </button>
        </header>
        <div key="topic" className="fscroll pg">
          {crumbs}
          {shown.map((p) => (
            <PostCard key={p.id} post={p} phone locked={locked} onQuote={quote} onReply={focusReply} />
          ))}
        </div>
        {locked ? (
          <div className="rep lock-rep">
            <LockIcon size={18} />
            {t("forum.topic.locked")}
          </div>
        ) : (
          <div className="rep">
            <textarea
              ref={replyRef}
              className="inp"
              rows={1}
              aria-label={t("forum.topic.quickLabel")}
              placeholder={t("forum.topic.placeholderPhone")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="button" className="btn cta" onClick={send}>{t("forum.topic.send")}</button>
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
            <div className="ttl-title">{TOPIC.title}</div>
            <span className="ttl-meta">
              {t("forum.topic.page", { page: 1, pages: 1 })} · {postsLabel}
            </span>
            {!locked && (
              <button type="button" className="btn cta" onClick={focusReply}>{t("forum.topic.reply")}</button>
            )}
          </div>
          {shown.map((p) => (
            <PostCard key={p.id} post={p} phone={false} locked={locked} onQuote={quote} onReply={focusReply} />
          ))}
          {locked ? (
            <div className="lockbox">
              <LockIcon />
              {t("forum.topic.locked")}
            </div>
          ) : (
            <div className="qr">
              <div className="qr-h">{t("forum.topic.quickLabel")}</div>
              <div className="qr-body">
                <textarea
                  ref={replyRef}
                  className="inp"
                  aria-label={t("forum.topic.quickLabel")}
                  placeholder={t("forum.topic.placeholder")}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="qr-row">
                  <span className="qr-note">{t("forum.topic.note")}</span>
                  <button type="button" className="btn">{t("forum.topic.preview")}</button>
                  <button type="button" className="btn cta" onClick={send}>{t("forum.topic.send")}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Home with no boards yet. The buttons are mock: they do nothing. */
function Empty() {
  const t = useT();
  return (
    <div className="empty">
      <div className="empty-title">{t("forum.empty.title")}</div>
      <div className="empty-text">{t("forum.empty.text")}</div>
      <div className="empty-acts">
        <button type="button" className="btn cta">
          <PlusIcon />
          {t("forum.empty.newBoard")}
        </button>
        <button type="button" className="btn">{t("forum.empty.ask")}</button>
      </div>
    </div>
  );
}

