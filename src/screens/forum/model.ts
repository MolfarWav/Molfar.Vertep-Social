// What the Forum screens draw, and the engine's answers turned into it. Pure: no React and no network, so
// test/forum-real.test.ts can drive it. The mock data (src/mock/forum.ts) is shaped like these types too, so
// the design preview and the real forum share every component.
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

// ---------- what the components draw ----------

export interface ForumLast {
  /** The topic of the last post, so a click opens it (real mode). */
  topicId?: string;
  title: string;
  who: string;
  hue?: number;
  /** Desktop byline time, e.g. "today 20:41". */
  when: string;
  /** Phone byline time, shorter. */
  whenShort: string;
}

export interface ForumBoard {
  id: string;
  name: string;
  desc: string;
  /** Shorter description on phone, where the board has one (mock). */
  descPhone?: string;
  subs?: string;
  topics: number;
  posts: number;
  last: ForumLast | null;
  unread: boolean;
  /** false: the phone board leaves this row out (mock). */
  onPhone?: boolean;
}

export interface ForumCategory {
  id: string;
  name: string;
  boards: ForumBoard[];
}

/** One line of a board page: a topic with its replies and its last post. */
export interface TopicRow {
  id: string;
  title: string;
  who: string;
  hue?: number;
  me: boolean;
  replies: number;
  last: { who: string; hue?: number; when: string; whenShort: string };
  locked: boolean;
  unread: boolean;
}

export interface ShownPost {
  id: string;
  /** The place in the topic, 1-based, printed as #n. */
  n: number;
  who: string;
  me?: boolean;
  hue?: number;
  /** The author's picture (an engine asset URL); empty = the letter. */
  picture?: string;
  role: string;
  count: number;
  joined: string;
  subject: string;
  /** "HH:MM" and the full label ("Today, 20:41"). */
  clock: string;
  when?: string;
  text: string;
  quote?: { who: string; text: string };
  sig?: string;
  /** false: the author is offline now (real mode). Undefined counts as online. */
  online?: boolean;
  removed?: boolean;
}

/** The autonomy strip: the engine's state and the numbers. */
export type StripState = "on" | "off" | "limit" | "quiet" | "nobody";
export interface StripData {
  state: StripState;
  posted: number;
  max: number;
  quietFrom: string;
  quietTo: string;
  /** Minutes to the next autonomous post; null when none is planned. */
  nextMin: number | null;
  error: { error: string; code?: "no-model" } | null;
}

// ---------- what the engine answers (plugins/forum/plugin.js) ----------

export interface EngineLast {
  topicId: string;
  title: string;
  by: string;
  name: string;
  hue: number;
  at: number;
}
export interface EngineBoard {
  id: string;
  name: string;
  desc: string;
  topics: number;
  posts: number;
  unread: boolean;
  last: EngineLast | null;
}
export interface EngineHome {
  categories: { id: string; name: string; boards: EngineBoard[] }[];
  strip: {
    state: StripState;
    posted: number;
    max: number;
    quietFrom: string;
    quietTo: string;
    nextInMin: number | null;
    error: { at: number; error: string; code?: "no-model" } | null;
    profiles: number;
    boards: number;
  };
  online: { id: string; name: string }[];
  stats: { posts: number; topics: number; members: number; newest: string };
  unread: number;
  now: number;
}
export interface EngineTopicRow {
  id: string;
  title: string;
  by: string;
  name: string;
  hue: number;
  createdAt: number;
  replies: number;
  lastAt: number;
  lastBy: string;
  lastName: string;
  lastHue: number;
  locked: boolean;
  unread: boolean;
}
export interface EngineBoardPage {
  board: { id: string; name: string; desc: string; category: string };
  topics: EngineTopicRow[];
}
export interface EnginePost {
  id: string;
  by: string;
  name: string;
  hue: number;
  at: number;
  text: string;
  quote?: { by: string; name: string; text: string };
}
export interface EngineAuthor {
  name: string;
  hue: number;
  picture?: string;
  rank: string;
  signature: string;
  count: number;
  joined: number;
  online: boolean;
}
export interface EngineTopicPage {
  topic: {
    id: string;
    title: string;
    board: { id: string; name: string; category: string };
    createdAt: number;
    lastAt: number;
    locked: boolean;
    unread: boolean;
    posts: EnginePost[];
  };
  /** Which page of the topic this is; absent from an engine that does not page. */
  paging?: EnginePaging;
  authors: Record<string, EngineAuthor>;
}
/** One page of a topic: `from` is the index (0-based) of its first post in the whole topic. */
export interface EnginePaging {
  page: number;
  pages: number;
  size: number;
  total: number;
  from: number;
}
/** One topic that matched a search: the first matching post, a snippet around the match and the page that post is on. */
export interface EngineSearchHit {
  id: string;
  title: string;
  board: { id: string; name: string };
  category: string;
  by: string;
  name: string;
  hue: number;
  at: number;
  n: number;
  page: number;
  matches: number;
  titleHit: boolean;
  snippet: string;
  lastAt: number;
}
export interface EngineSearch {
  q: string;
  words: string[];
  topics: EngineSearchHit[];
  tooShort: boolean;
  truncated: boolean;
}
/** The answer of POST /forum/force. */
export interface ForceAnswer {
  ok: boolean;
  written?: number;
  error?: string;
  code?: string;
  errors?: { error: string; code?: string }[];
}

// ---------- times ----------

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const dayStart = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "today 20:41", "yesterday 22:15", "6 Nov 19:30". */
export function whenLabel(ms: number, now: number, lang: string, t: Translate): string {
  const days = Math.round((dayStart(now) - dayStart(ms)) / 86400000);
  if (days <= 0) return t("forum.when.today", { time: clock(ms) });
  if (days === 1) return t("forum.when.yesterday", { time: clock(ms) });
  return `${new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "short" })} ${clock(ms)}`;
}

/** The phone's short form: the time today, "yesterday", or the date. */
export function whenShort(ms: number, now: number, lang: string, t: Translate): string {
  const days = Math.round((dayStart(now) - dayStart(ms)) / 86400000);
  if (days <= 0) return clock(ms);
  if (days === 1) return t("forum.when.yesterdayShort");
  return new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "short" });
}

/** The join date as DD.MM.YYYY; "" when unknown. */
export function joinedLabel(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

// ---------- engine to view ----------

export function categoriesFromEngine(home: EngineHome, lang: string, t: Translate): ForumCategory[] {
  return home.categories.map((c) => ({
    id: c.id,
    name: c.name,
    boards: c.boards.map((b) => ({
      id: b.id,
      name: b.name,
      desc: b.desc,
      topics: b.topics,
      posts: b.posts,
      unread: b.unread,
      last: b.last
        ? {
            topicId: b.last.topicId,
            title: b.last.title,
            who: b.last.by === "me" ? t("shell.me") : b.last.name,
            hue: b.last.by === "me" ? undefined : b.last.hue,
            when: whenLabel(b.last.at, home.now, lang, t),
            whenShort: whenShort(b.last.at, home.now, lang, t),
          }
        : null,
    })),
  }));
}

export function stripFromEngine(home: EngineHome): StripData {
  const s = home.strip;
  return {
    state: s.state,
    posted: s.posted,
    max: s.max,
    quietFrom: s.quietFrom,
    quietTo: s.quietTo,
    nextMin: s.nextInMin,
    error: s.error ? { error: s.error.error, ...(s.error.code ? { code: s.error.code } : {}) } : null,
  };
}

/** Who is on the forum now: the user first (the screen prints it in the accent colour), then the profiles online. */
export function onlineNames(home: EngineHome, me: string): string[] {
  return [me, ...home.online.map((o) => o.name)];
}

export function rowsFromEngine(page: EngineBoardPage, now: number, lang: string, t: Translate): TopicRow[] {
  return page.topics.map((r) => ({
    id: r.id,
    title: r.title,
    who: r.by === "me" ? t("shell.me") : r.name,
    hue: r.by === "me" ? undefined : r.hue,
    me: r.by === "me",
    replies: r.replies,
    last: {
      who: r.lastBy === "me" ? t("shell.me") : r.lastName,
      hue: r.lastBy === "me" ? undefined : r.lastHue,
      when: whenLabel(r.lastAt, now, lang, t),
      whenShort: whenShort(r.lastAt, now, lang, t),
    },
    locked: r.locked,
    unread: r.unread,
  }));
}

export function postsFromEngine(page: EngineTopicPage, now: number, lang: string, t: Translate): ShownPost[] {
  const title = page.topic.title;
  const from = page.paging?.from ?? 0;
  return page.topic.posts.map((p, i) => {
    const a = page.authors[p.by];
    const me = p.by === "me";
    return {
      id: p.id,
      n: from + i + 1,
      who: me ? t("shell.me") : (a?.name ?? p.name),
      me,
      hue: me ? undefined : (a?.hue ?? p.hue),
      picture: me ? undefined : (a?.picture || undefined),
      role: me ? t("forum.role.owner") : (a?.rank ?? ""),
      count: a?.count ?? 0,
      joined: a ? joinedLabel(a.joined) : "",
      subject: from + i === 0 ? title : `Re: ${title}`,
      clock: clock(p.at),
      when: whenLabel(p.at, now, lang, t).replace(/^./, (c) => c.toUpperCase()),
      text: p.text,
      ...(p.quote ? { quote: { who: p.quote.by === "me" ? t("shell.me") : p.quote.name, text: p.quote.text } } : {}),
      ...(a?.signature ? { sig: a.signature } : {}),
      online: a?.online ?? false,
    };
  });
}

/** One line of the search results. */
export interface SearchRow {
  id: string;
  title: string;
  where: string;
  who: string;
  hue?: number;
  me: boolean;
  when: string;
  /** The number of the first matching post, and the page it is on. */
  n: number;
  page: number;
  matches: number;
  titleHit: boolean;
  snippet: string;
}

export function searchRowsFromEngine(s: EngineSearch, now: number, lang: string, t: Translate): SearchRow[] {
  return s.topics.map((h) => {
    const me = h.by === "me";
    return {
      id: h.id,
      title: h.title,
      where: [h.category, h.board.name].filter(Boolean).join(" › "),
      who: me ? t("shell.me") : h.name,
      hue: me ? undefined : h.hue,
      me,
      when: whenLabel(h.at, now, lang, t),
      n: h.n,
      page: h.page,
      matches: h.matches,
      titleHit: h.titleHit,
      snippet: h.snippet,
    };
  });
}

/** `text` cut into pieces, the ones that hold a searched word marked `hit` (any case; the words are plain text, not patterns). */
export function highlightParts(text: string, words: string[]): { text: string; hit: boolean }[] {
  const list = words.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length || !text) return [{ text, hit: false }];
  const re = new RegExp(list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu");
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m[0] === "") continue;
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), hit: false });
    out.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

/** The line under the strip after "Write now": what came of it. `kind` picks the style. */
export interface WriteNotice {
  kind: "ok" | "error";
  text: string;
  /** The error is "no model": the line offers the Settings link. */
  noModel?: boolean;
}

export function noticeFromForce(ans: ForceAnswer, plural: (n: number) => string, t: Translate): WriteNotice {
  if (ans.ok) return { kind: "ok", text: t("forum.notice.written", { posts: plural(ans.written ?? 1) }) };
  const first = ans.errors?.[0];
  const code = ans.code ?? first?.code;
  if (code === "no-model") return { kind: "error", text: t("forum.notice.noModel"), noModel: true };
  if (code === "no-profiles") return { kind: "error", text: t("forum.notice.noProfiles") };
  if (code === "no-target") return { kind: "error", text: ans.error === "there are no boards yet" ? t("forum.notice.noBoards") : t("forum.notice.noTarget") };
  return { kind: "error", text: t("forum.notice.failed", { error: ans.error ?? first?.error ?? "" }) };
}

/** The boards "Create default boards" makes: neutral names in the user's language, no setting of any world. */
export function defaultBoards(t: Translate): { name: string; boards: { name: string; desc: string }[] }[] {
  return [
    {
      name: t("forum.defaults.general"),
      boards: [
        { name: t("forum.defaults.welcome"), desc: t("forum.defaults.welcome.desc") },
        { name: t("forum.defaults.talk"), desc: t("forum.defaults.talk.desc") },
        { name: t("forum.defaults.news"), desc: t("forum.defaults.news.desc") },
      ],
    },
    {
      name: t("forum.defaults.interests"),
      boards: [
        { name: t("forum.defaults.stories"), desc: t("forum.defaults.stories.desc") },
        { name: t("forum.defaults.games"), desc: t("forum.defaults.games.desc") },
      ],
    },
  ];
}
