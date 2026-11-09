// The real forum: the boards, a board's topics, a topic, a new topic. Data comes from the forum plugin
// (plugins/forum/plugin.js) through the app's routes; the pages are the same components the design preview uses.
import { refreshImages } from "@/pictures/worker";
import { useCallback, useEffect, useMemo } from "react";
import "./forum.css";
import { currentLang, useT } from "@/i18n/index";
import { call } from "@/lib/api";
import { refreshBadges } from "@/lib/badges";
import { useHistoryRoute } from "@/lib/route-history";
import { useIsPhone } from "@/lib/use-phone";
import { useChrome, useNav } from "@/shell/nav";
import { BoardPage } from "./BoardPage";
import { Home } from "./Home";
import { messageOf, useGet, useWriteNow } from "./data";
import { countLabel } from "./labels";
import {
  categoriesFromEngine,
  defaultBoards,
  onlineNames,
  postsFromEngine,
  rowsFromEngine,
  searchRowsFromEngine,
  stripFromEngine,
  type EngineBoardPage,
  type EngineHome,
  type EngineSearch,
  type EngineTopicPage,
} from "./model";
import { NewTopic } from "./NewTopic";
import { SearchPage } from "./SearchPage";
import { TopicView } from "./TopicView";

/** A topic page is a number or "last" (the end, which follows new posts). `post` is the number of a post to scroll to. */
type Page = number | "last";
type Route =
  | { view: "home" }
  | { view: "board"; id: string }
  | { view: "topic"; id: string; page: Page; post?: number }
  | { view: "new"; board: string }
  | { view: "search"; q: string };

const isText = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max;
/** A route read back from the browser's history is checked before it is used. */
function isRoute(r: unknown): r is Route {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  switch (o.view) {
    case "home":
      return true;
    case "board":
      return isText(o.id);
    case "topic":
      return isText(o.id) && (o.page === "last" || (Number.isInteger(o.page) && (o.page as number) >= 1)) && (o.post === undefined || (Number.isInteger(o.post) && (o.post as number) >= 1));
    case "new":
      return isText(o.board);
    case "search":
      return isText(o.q, 80);
    default:
      return false;
  }
}
const HOME: Route = { view: "home" };

const HOME_POLL = 20000;
const PAGE_POLL = 15000;

export function ForumLive() {
  const t = useT();
  const lang = currentLang();
  const phone = useIsPhone();
  const nav = useNav();
  const [route, go] = useHistoryRoute<Route>(HOME, isRoute);

  const home = useGet<EngineHome>("/forum/home", HOME_POLL);
  const board = useGet<EngineBoardPage>(route.view === "board" ? `/forum/board?id=${encodeURIComponent(route.id)}` : null, PAGE_POLL);
  const topic = useGet<EngineTopicPage>(route.view === "topic" ? `/forum/topic?id=${encodeURIComponent(route.id)}&page=${route.page}` : null, PAGE_POLL);
  const query = route.view === "search" ? route.q.trim() : "";
  const searching = query.length >= 2;
  const found = useGet<EngineSearch>(searching ? `/forum/search?q=${encodeURIComponent(query)}` : null);

  useChrome(phone ? { bar: route.view === "home", tabs: route.view === "home" || route.view === "board" } : {});

  // the tab badge counts the topics with posts the user has not seen
  const unread = home.data?.unread;
  useEffect(() => {
    if (unread !== undefined) nav.setBadges({ forum: unread });
  }, [unread, nav]);

  // a picture a character asked for waits for the page to draw it: wake the worker
  const waiting = topic.data?.topic.posts.some((x) => x.image?.state === "pending") ?? false;
  useEffect(() => {
    if (waiting) refreshImages();
  }, [waiting]);

  // opening a topic with new posts marks it read
  const opened = topic.data?.topic;
  const reloadHome = home.reload;
  useEffect(() => {
    if (!opened || !opened.unread) return;
    void call("POST", "/forum/read", { topic: opened.id })
      .catch(() => undefined)
      .then(() => {
        void reloadHome();
        refreshBadges();
      });
  }, [opened?.id, opened?.unread, reloadHome]);

  const scope = useMemo(() => (route.view === "board" ? { board: route.id } : route.view === "topic" ? { topic: route.id } : {}), [route]);
  const key = route.view === "board" || route.view === "topic" ? `${route.view}:${route.id}` : route.view;
  const plural = useCallback((n: number) => countLabel(t, "posts", n), [t]);
  const reloadPage = route.view === "board" ? board.reload : route.view === "topic" ? topic.reload : route.view === "search" ? found.reload : home.reload;
  const after = useCallback(() => {
    void reloadPage();
    void reloadHome();
  }, [reloadPage, reloadHome]);
  const write = useWriteNow(scope, key, plural, t, after);

  const home_ = () => go(HOME);
  const openSearch = (q: string) => go({ view: "search", q });
  const now = home.data?.now ?? Date.now();

  const addBoard = async (category: string, name: string, desc: string): Promise<string | null> => {
    try {
      await call("POST", "/forum/boards", { categories: [{ name: category, boards: [{ name, desc }] }] });
      await home.reload();
      return null;
    } catch (e) {
      return messageOf(e);
    }
  };

  if (route.view === "new") {
    const boards = (home.data?.categories ?? []).flatMap((c) => c.boards.map((b) => ({ id: b.id, name: b.name, category: c.name })));
    return (
      <NewTopic
        phone={phone}
        boards={boards}
        boardId={route.board}
        onCancel={() => go(route.board ? { view: "board", id: route.board } : { view: "home" })}
        pictures
        onSubmit={async (boardId, title, text, image) => {
          try {
            const r = await call<{ topic: string }>("POST", "/forum/topic", { board: boardId, title, text, ...(image ? { image: { url: image.url, alt: image.alt, gen: image.gen } } : {}) });
            void home.reload();
            go({ view: "topic", id: r.topic, page: 1 }, { replace: true });
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
      />
    );
  }

  if (route.view === "search") {
    return (
      <SearchPage
        phone={phone}
        q={route.q}
        rows={found.data ? searchRowsFromEngine(found.data, now, lang, t) : null}
        words={found.data?.words ?? []}
        idle={!searching}
        truncated={found.data?.truncated ?? false}
        error={found.error}
        onSearch={(q) => go({ view: "search", q }, { replace: true })}
        onOpen={(r) => go({ view: "topic", id: r.id, page: r.page, post: r.n })}
        onHome={home_}
        onRetry={() => void found.reload()}
      />
    );
  }

  if (route.view === "board") {
    const page = board.data;
    return (
      <BoardPage
        phone={phone}
        board={page?.board ?? { id: route.id, name: "", desc: "", category: "" }}
        rows={page ? rowsFromEngine(page, now, lang, t) : null}
        error={board.error}
        writing={write.busy}
        notice={write.notice}
        onCloseNotice={write.dismiss}
        onWriteNow={write.run}
        onHome={home_}
        onTopic={(id, unread) => go({ view: "topic", id, page: unread ? "last" : 1 })}
        onNew={() => go({ view: "new", board: route.id })}
        onSearch={() => openSearch("")}
        onRetry={() => void board.reload()}
      />
    );
  }

  if (route.view === "topic") {
    const page = topic.data;
    const info = page?.topic;
    return (
      <TopicView
        phone={phone}
        live
        title={info?.title ?? ""}
        category={info?.board.category ?? ""}
        board={info ? { id: info.board.id, name: info.board.name } : null}
        posts={page ? postsFromEngine(page, now, lang, t) : null}
        error={topic.error}
        locked={info?.locked ?? false}
        writing={write.busy}
        notice={write.notice}
        onCloseNotice={write.dismiss}
        onWriteNow={write.run}
        onHome={home_}
        onBoard={() => go(info ? { view: "board", id: info.board.id } : { view: "home" })}
        onRemovePost={async (post) => {
          try {
            await call("POST", "/forum/remove-post", { topic: route.id, post: post.id });
            await topic.reload();
            void home.reload();
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
        onDeleteTopic={async () => {
          try {
            await call("POST", "/forum/delete-topic", { topic: route.id });
            void home.reload();
            go(info ? { view: "board", id: info.board.id } : HOME, { replace: true });
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
        paging={page?.paging ? { page: page.paging.page, pages: page.paging.pages, total: page.paging.live ?? page.paging.total } : undefined}
        onPage={(pg) => go({ view: "topic", id: route.id, page: pg })}
        focusPost={route.post}
        onSearch={() => openSearch("")}
        onSend={async (text, quoteOf, image) => {
          try {
            await call("POST", "/forum/reply", { topic: route.id, text, ...(quoteOf ? { quoteOf } : {}), ...(image ? { image: { url: image.url, alt: image.alt, gen: image.gen } } : {}) });
            // the answer is at the end: show the last page, and keep following it
            if (route.page === "last") await topic.reload();
            else go({ view: "topic", id: route.id, page: "last" }, { replace: true });
            void home.reload();
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
        onRetry={() => void topic.reload()}
        onSetLocked={async (locked) => {
          try {
            await call("POST", "/forum/lock", { topic: route.id, locked });
            await topic.reload();
            void home.reload();
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
      />
    );
  }

  const data = home.data;
  if (!data) {
    return (
      <div className="s-forum">
        <div className="fscroll">
          <div className="wrap">
            {home.error ? (
              <div className="empty">
                <div className="empty-text">{t("forum.error.load", { error: home.error })}</div>
                <button type="button" className="btn" onClick={() => void home.reload()}>{t("forum.retry")}</button>
              </div>
            ) : (
              <div className="mut pad">{t("forum.loading")}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Home
      phone={phone}
      live
      categories={categoriesFromEngine(data, lang, t)}
      strip={stripFromEngine(data)}
      online={onlineNames(data, t("shell.me"))}
      selfName={t("shell.me")}
      stats={data.stats}
      writing={write.busy}
      notice={write.notice}
      onCloseNotice={write.dismiss}
      onWriteNow={write.run}
      onSwitchOn={() => {
        void call("PUT", "/settings", { autonomous: true })
          .catch(() => undefined)
          .then(() => home.reload());
      }}
      onBoard={(id) => go({ view: "board", id })}
      onTopic={(id) => go(id ? { view: "topic", id, page: "last" } : HOME)}
      onSearch={openSearch}
      onNewTopic={() => go({ view: "new", board: "" })}
      onDefaults={() => {
        void call("POST", "/forum/boards", { categories: defaultBoards(t) })
          .catch(() => undefined)
          .then(() => home.reload());
      }}
      onAddBoard={addBoard}
    />
  );
}
