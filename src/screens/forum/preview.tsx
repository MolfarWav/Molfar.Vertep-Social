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
import type { NoticeRow, PollData, ShownPost, StripData, StripState, WriteNotice } from "./model";
import { NoticesPage } from "./NoticesPage";
import { NewTopic } from "./NewTopic";
import { TopicView } from "./TopicView";

type View = "home" | "board" | "topic" | "new" | "notices";

/** Replies to the user, drawn in the design preview (`state=nonotices` for the empty page). */
const MOCK_NOTICES: NoticeRow[] = [
  { id: "n1", kind: "reply", topic: "t1", who: "Мавка", hue: 150, picture: "", emoji: "", excerpt: "Я теж так думаю, але з лимоном смачніше.", title: "Чай чи кава?", when: "сьогодні 14:20", isNew: true },
  { id: "n2", kind: "react", topic: "t1", who: "Лісовик", hue: 30, picture: "", emoji: "❤️", excerpt: "", title: "Чай чи кава?", when: "сьогодні 12:05", isNew: true },
  { id: "n3", kind: "reply", topic: "t2", who: "Ярина", hue: 280, picture: "", emoji: "", excerpt: "Дякую, що підказали. Спробую в неділю.", title: "Нові голоси: представтеся", when: "вчора 22:15", isNew: false },
];

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

/** The mock poll (`state=poll` open, `state=pollclosed` ended). */
const MOCK_POLL: PollData = {
  closed: false,
  total: 5,
  options: [
    { id: "o1", text: "Мавка", n: 2, mine: false, who: ["Лісовик", "Ярина"] },
    { id: "o2", text: "Лісовик", n: 1, mine: false, who: ["Мавка"] },
    { id: "o3", text: "Хай господарює Домовик", n: 2, mine: false, who: ["Берегиня"] },
  ],
};

/** Reactions drawn in the design preview, by post number. */
const DEMO_REACT: Record<number, NonNullable<ShownPost["react"]>> = {
  1: [
    { emoji: "\u{1F44D}", n: 2, mine: true, who: "Ви, Мавка" },
    { emoji: "\u{1F602}", n: 1, mine: false, who: "Лісовик" },
  ],
  2: [{ emoji: "\u{1F525}", n: 1, mine: false, who: "Ярина" }],
};

function shown(p: MockPost, selfName: string): ShownPost {
  return { id: String(p.id), n: p.id, who: p.me ? selfName : p.who, me: p.me, hue: hueOf(p.who), role: p.role, count: p.count, joined: p.joined, subject: p.subject, clock: p.clock, text: p.text, quote: p.quote, sig: p.sig, ...(DEMO_REACT[p.id] ? { react: DEMO_REACT[p.id] } : {}) };
}

const STRIP_STATES: Record<string, StripState> = { autonomyoff: "off", limit: "limit", quiet: "quiet", nobody: "nobody" };

function viewOf(): View {
  const v = urlParam("view");
  return v === "topic" || v === "board" || v === "new" || v === "notices" ? v : "home";
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

  const [pollChoice, setPollChoice] = useState<string | null>(null);
  const [closed, setClosed] = useState<boolean | null>(null); // the mock "Close topic" button; null = what the state says
  const locked = closed ?? preview === "locked";
  const selfName = t("shell.me");
  const base = TOPIC.posts.map((p) => shown(p, selfName)).map((p) => (preview === "moderated" && p.n === 2 ? { ...p, removed: true } : p));
  const withRepost = preview === "repost" ? [...base, { ...base[base.length - 1]!, id: "rp", n: base.length + 1, who: "Ярина", me: false, hue: 280, text: "\u21BB Поширено допис: Мавка", repost: true, quote: { who: "Мавка", text: base[0]?.text.slice(0, 120) ?? "" } }] : base;
  const posts = [...withRepost, ...replies];
  const poll: PollData | undefined =
    preview === "poll" || preview === "pollclosed"
      ? {
          ...MOCK_POLL,
          closed: preview === "pollclosed",
          total: MOCK_POLL.total + (pollChoice ? 1 : 0),
          options: MOCK_POLL.options.map((o) => ({ ...o, mine: o.id === pollChoice, n: o.n + (o.id === pollChoice ? 1 : 0), who: o.id === pollChoice ? [...o.who, selfName] : o.who })),
        }
      : undefined;
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

  if (view === "notices") {
    return <NoticesPage phone={phone} rows={preview === "nonotices" ? [] : MOCK_NOTICES} error="" onOpen={() => setView("topic")} onHome={home} onRetry={noop} />;
  }
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
    return <NewTopic phone={phone} boards={boardChoices} boardId={BOARD_PAGE.id} polls onCancel={() => setView("board")} onSubmit={async () => {
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
        onReact={async () => undefined}
        posts={posts}
        poll={poll}
        onVote={async (id) => setPollChoice((cur) => (cur === id ? null : id))}
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
      notices={preview === "nonotices" ? 0 : 2}
      onNotices={() => setView("notices")}
      onNewTopic={() => setView("new")}
      onDefaults={noop}
      onAddBoard={async () => null}
    />
  );
}
