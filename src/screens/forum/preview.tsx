// The forum in the design preview (`?screen=forum`): every page runs on mock data and never calls the engine.
// The installed app uses live.tsx instead. Parameters are listed in index.tsx.
import { useState } from "react";
import "./forum.css";
import { useT } from "@/i18n/index";
import { useIsPhone } from "@/lib/use-phone";
import { useChrome } from "@/shell/nav";
import { AUTONOMY, BOARD_PAGE, BOARD_TOPICS, CATEGORIES, ONLINE, STATS, TOPIC, hueOf, type MockCategory, type MockPost } from "@/mock/forum";
import { BoardPage } from "./BoardPage";
import { Home } from "./Home";
import type { ShownPost, StripData, StripState, WriteNotice } from "./model";
import { NewTopic } from "./NewTopic";
import { TopicView } from "./TopicView";

type View = "home" | "board" | "topic" | "new";

function urlParam(name: string): string {
  try {
    return new URLSearchParams(location.search).get(name) ?? "";
  } catch {
    return "";
  }
}

/** The boards for a preview state: none, or the first one without topics. */
function boardsFor(state: string): MockCategory[] {
  if (state === "noboards") return [];
  if (state === "notopics") {
    return CATEGORIES.map((c, i) => (i === 0 ? { ...c, boards: c.boards.map((b, j) => (j === 0 ? { ...b, topics: 0, posts: 0, last: null } : b)) } : c));
  }
  return CATEGORIES;
}

const pad = (n: number) => String(n).padStart(2, "0");

function shown(p: MockPost, selfName: string): ShownPost {
  return { id: String(p.id), n: p.id, who: p.me ? selfName : p.who, me: p.me, hue: hueOf(p.who), role: p.role, count: p.count, joined: p.joined, subject: p.subject, clock: p.clock, text: p.text, quote: p.quote, sig: p.sig };
}

const STRIP_STATES: Record<string, StripState> = { autonomyoff: "off", limit: "limit", quiet: "quiet", nobody: "nobody" };

function viewOf(): View {
  const v = urlParam("view");
  return v === "topic" || v === "board" || v === "new" ? v : "home";
}

export function ForumPreview() {
  const t = useT();
  const phone = useIsPhone();
  const [preview] = useState(() => urlParam("state"));
  const [view, setView] = useState<View>(viewOf);
  const [autonomyOn, setAutonomyOn] = useState(preview !== "autonomyoff");
  const [replies, setReplies] = useState<ShownPost[]>([]);
  const [notice, setNotice] = useState<WriteNotice | null>(
    preview === "written" ? { kind: "ok", text: t("forum.notice.written", { posts: "2" }) } : preview === "nomodel" ? { kind: "error", text: t("forum.notice.noModel"), noModel: true } : null,
  );

  useChrome(phone ? { bar: view === "home", tabs: view === "home" || view === "board" } : {});

  const [closed, setClosed] = useState<boolean | null>(null); // the mock "Close topic" button; null = what the state says
  const locked = closed ?? preview === "locked";
  const selfName = t("shell.me");
  const base = TOPIC.posts.map((p) => shown(p, selfName)).map((p) => (preview === "moderated" && p.n === 2 ? { ...p, removed: true } : p));
  const posts = [...base, ...replies];
  const state: StripState = !autonomyOn ? "off" : (STRIP_STATES[preview] ?? "on");
  const strip: StripData = { state, posted: AUTONOMY.posted, max: AUTONOMY.max, quietFrom: AUTONOMY.quietFrom, quietTo: AUTONOMY.quietTo, nextMin: AUTONOMY.nextMin, error: null };
  const categories = boardsFor(preview);
  const rows = preview === "notopics" ? [] : BOARD_TOPICS;
  const home = () => setView("home");

  const onSend = async (text: string, quoteOf: string | null): Promise<string | null> => {
    const now = new Date();
    const target = posts.find((p) => p.id === quoteOf);
    const last = [...posts].reverse().find((p) => p.me);
    setReplies((r) => [
      ...r,
      {
        id: `r${posts.length + 1}`,
        n: posts.length + 1,
        who: selfName,
        me: true,
        role: last?.role ?? "",
        count: (last?.count ?? 31) + 1,
        joined: last?.joined ?? "02.11.2026",
        subject: `Re: ${TOPIC.title}`,
        clock: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        text,
        ...(target ? { quote: { who: target.who, text: target.text } } : {}),
      },
    ]);
    return null;
  };
  const noop = () => undefined;
  const boardChoices = CATEGORIES.flatMap((c) => c.boards.map((b) => ({ id: b.id, name: b.name, category: c.name })));

  if (view === "board") {
    return (
      <BoardPage
        phone={phone}
        board={BOARD_PAGE}
        rows={rows}
        error=""
        writing={false}
        notice={notice}
        onCloseNotice={() => setNotice(null)}
        onWriteNow={noop}
        onHome={home}
        onTopic={() => setView("topic")}
        onNew={() => setView("new")}
        onRetry={noop}
      />
    );
  }
  if (view === "new") {
    return <NewTopic phone={phone} boards={boardChoices} boardId={BOARD_PAGE.id} onCancel={() => setView("board")} onSubmit={async () => {
      setView("topic");
      return null;
    }} />;
  }
  if (view === "topic") {
    return (
      <TopicView
        phone={phone}
        live={false}
        title={TOPIC.title}
        category={TOPIC.category}
        board={{ id: BOARD_PAGE.id, name: TOPIC.board }}
        posts={posts}
        error=""
        locked={locked}
        onSetLocked={async (next) => {
          setClosed(next);
          return null;
        }}
        writing={false}
        notice={notice}
        onCloseNotice={() => setNotice(null)}
        onWriteNow={noop}
        onHome={home}
        onBoard={() => setView("board")}
        onSend={onSend}
        onRetry={noop}
      />
    );
  }
  return (
    <Home
      phone={phone}
      live={false}
      categories={categories}
      strip={strip}
      online={ONLINE}
      selfName={selfName}
      stats={STATS}
      writing={false}
      notice={notice}
      onCloseNotice={() => setNotice(null)}
      onWriteNow={noop}
      onSwitchOn={() => setAutonomyOn(true)}
      onBoard={() => setView("board")}
      onTopic={() => setView("topic")}
      onNewTopic={() => setView("new")}
      onDefaults={noop}
      onAddBoard={async () => null}
    />
  );
}
