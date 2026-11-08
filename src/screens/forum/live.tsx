// The real forum: the boards, a board's topics, a topic, a new topic. Data comes from the forum plugin
// (plugins/forum/plugin.js) through the app's routes; the pages are the same components the design preview uses.
import { useCallback, useEffect, useMemo, useState } from "react";
import "./forum.css";
import { currentLang, useT } from "@/i18n/index";
import { call } from "@/lib/api";
import { refreshBadges } from "@/lib/badges";
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
  stripFromEngine,
  type EngineBoardPage,
  type EngineHome,
  type EngineTopicPage,
} from "./model";
import { NewTopic } from "./NewTopic";
import { TopicView } from "./TopicView";

type Route = { view: "home" } | { view: "board"; id: string } | { view: "topic"; id: string } | { view: "new"; board: string };

const HOME_POLL = 20000;
const PAGE_POLL = 15000;

export function ForumLive() {
  const t = useT();
  const lang = currentLang();
  const phone = useIsPhone();
  const nav = useNav();
  const [route, setRoute] = useState<Route>({ view: "home" });

  const home = useGet<EngineHome>("/forum/home", HOME_POLL);
  const board = useGet<EngineBoardPage>(route.view === "board" ? `/forum/board?id=${encodeURIComponent(route.id)}` : null, PAGE_POLL);
  const topic = useGet<EngineTopicPage>(route.view === "topic" ? `/forum/topic?id=${encodeURIComponent(route.id)}` : null, PAGE_POLL);

  useChrome(phone ? { bar: route.view === "home", tabs: route.view === "home" || route.view === "board" } : {});

  // the tab badge counts the topics with posts the user has not seen
  const unread = home.data?.unread;
  useEffect(() => {
    if (unread !== undefined) nav.setBadges({ forum: unread });
  }, [unread, nav]);

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
  const reloadPage = route.view === "board" ? board.reload : route.view === "topic" ? topic.reload : home.reload;
  const after = useCallback(() => {
    void reloadPage();
    void reloadHome();
  }, [reloadPage, reloadHome]);
  const write = useWriteNow(scope, key, plural, t, after);

  const go = (r: Route) => setRoute(r);
  const home_ = () => go({ view: "home" });
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
        onSubmit={async (boardId, title, text) => {
          try {
            const r = await call<{ topic: string }>("POST", "/forum/topic", { board: boardId, title, text });
            void home.reload();
            go({ view: "topic", id: r.topic });
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
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
        onTopic={(id) => go({ view: "topic", id })}
        onNew={() => go({ view: "new", board: route.id })}
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
        onSend={async (text, quoteOf) => {
          try {
            await call("POST", "/forum/reply", { topic: route.id, text, ...(quoteOf ? { quoteOf } : {}) });
            await topic.reload();
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
      onTopic={(id) => go(id ? { view: "topic", id } : { view: "home" })}
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
