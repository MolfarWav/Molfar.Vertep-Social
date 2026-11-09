import { expect, test } from "bun:test";
import {
  categoriesFromEngine,
  defaultBoards,
  highlightParts,
  noticeFromForce,
  onlineNames,
  postsFromEngine,
  rowsFromEngine,
  searchRowsFromEngine,
  stripFromEngine,
  whenLabel,
  whenShort,
  type EngineBoardPage,
  type EngineSearch,
  type EngineHome,
  type EngineTopicPage,
} from "../src/screens/forum/model";

const dict: Record<string, string> = {
  "shell.me": "Me",
  "forum.when.today": "today {time}",
  "forum.when.yesterday": "yesterday {time}",
  "forum.when.yesterdayShort": "yesterday",
  "forum.role.owner": "Owner",
  "forum.notice.written": "Written: {posts}.",
  "forum.notice.noModel": "No model",
  "forum.notice.noProfiles": "No profiles",
  "forum.notice.noTarget": "Nobody here",
  "forum.notice.noBoards": "No boards",
  "forum.notice.failed": "Failed: {error}",
};
const t = (key: string, vars?: Record<string, string | number>) => {
  let s = dict[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v));
  return s;
};

const NOW = new Date(2026, 10, 10, 15, 30).getTime();
const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

test("times: today, yesterday, an older date; short forms", () => {
  expect(whenLabel(at(10, 9, 5), NOW, "en", t)).toBe("today 09:05");
  expect(whenLabel(at(9, 22, 15), NOW, "en", t)).toBe("yesterday 22:15");
  expect(whenLabel(at(5, 19, 30), NOW, "en", t)).toMatch(/19:30$/);
  expect(whenShort(at(10, 9, 5), NOW, "en", t)).toBe("09:05");
  expect(whenShort(at(9, 22, 15), NOW, "en", t)).toBe("yesterday");
  expect(whenShort(at(5, 19, 30), NOW, "en", t)).not.toContain(":");
});

const home: EngineHome = {
  categories: [
    {
      id: "c1",
      name: "General",
      boards: [
        { id: "b1", name: "Guest", desc: "Hello", topics: 2, posts: 5, unread: true, last: { topicId: "t1", title: "Fence", by: "m1", name: "Мавка", hue: 150, at: at(10, 9, 5) } },
        { id: "b2", name: "Tales", desc: "", topics: 0, posts: 0, unread: false, last: null },
      ],
    },
  ],
  strip: { state: "on", posted: 3, max: 30, quietFrom: "01:00", quietTo: "08:00", nextInMin: 12, error: { at: 1, error: "boom", code: "no-model" }, profiles: 2, boards: 2 },
  online: [{ id: "m1", name: "Мавка" }],
  stats: { posts: 5, topics: 2, members: 3, newest: "Мавка" },
  unread: 1,
  now: NOW,
};

test("the home answer becomes boards with the last post, the strip and the online list", () => {
  const cats = categoriesFromEngine(home, "en", t);
  expect(cats[0].boards[0].last).toMatchObject({ topicId: "t1", title: "Fence", who: "Мавка", hue: 150, when: "today 09:05", whenShort: "09:05" });
  expect(cats[0].boards[1].last).toBeNull();
  expect(stripFromEngine(home)).toEqual({ state: "on", posted: 3, max: 30, quietFrom: "01:00", quietTo: "08:00", nextMin: 12, error: { error: "boom", code: "no-model" } });
  expect(onlineNames(home, "Me")).toEqual(["Me", "Мавка"]);
});

test("a board page becomes rows in the engine's order; the user's own name is localized", () => {
  const page: EngineBoardPage = {
    board: { id: "b1", name: "Guest", desc: "", category: "General" },
    topics: [
      { id: "t2", title: "Mine", by: "me", name: "", hue: 200, createdAt: 1, replies: 0, lastAt: at(10, 14, 0), lastBy: "me", lastName: "", lastHue: 200, locked: false, unread: false },
      { id: "t1", title: "Older", by: "m1", name: "Мавка", hue: 150, createdAt: 1, replies: 4, lastAt: at(9, 8, 0), lastBy: "y1", lastName: "Ярина", lastHue: 10, locked: true, unread: true },
    ],
  };
  const rows = rowsFromEngine(page, NOW, "en", t);
  expect(rows.map((r) => r.id)).toEqual(["t2", "t1"]);
  expect(rows[0]).toMatchObject({ who: "Me", me: true, last: { who: "Me", when: "today 14:00" } });
  expect(rows[1]).toMatchObject({ who: "Мавка", replies: 4, locked: true, unread: true, last: { who: "Ярина", whenShort: "yesterday" } });
});

test("a topic becomes posts: numbers, the Re: subject, ranks, quotes with names, and the user as Owner", () => {
  const page: EngineTopicPage = {
    topic: {
      id: "t1",
      title: "Fence",
      board: { id: "b1", name: "Guest", category: "General" },
      createdAt: 1,
      lastAt: 2,
      locked: false,
      unread: false,
      posts: [
        { id: "p1", by: "m1", name: "Мавка", hue: 150, at: at(10, 9, 5), text: "Who broke the fence?" },
        { id: "p2", by: "me", name: "", hue: 200, at: at(10, 9, 30), text: "Not me.", quote: { by: "m1", name: "Мавка", text: "Who broke" } },
        { id: "p3", by: "gone", name: "Старий", hue: 40, at: at(10, 9, 40), text: "Hm." },
      ],
    },
    authors: {
      m1: { name: "Мавка", hue: 150, rank: "Elder", signature: "reeds", count: 12, joined: at(2, 12, 0), online: true },
      me: { name: "", hue: 200, rank: "", signature: "", count: 3, joined: 0, online: true },
    },
  };
  const posts = postsFromEngine(page, NOW, "en", t);
  expect(posts.map((p) => p.n)).toEqual([1, 2, 3]);
  expect(posts[0]).toMatchObject({ who: "Мавка", role: "Elder", sig: "reeds", count: 12, joined: "02.11.2026", subject: "Fence", online: true, when: "Today 09:05" });
  expect(posts[1]).toMatchObject({ who: "Me", me: true, role: "Owner", subject: "Re: Fence", quote: { who: "Мавка", text: "Who broke" }, joined: "" });
  expect(posts[2]).toMatchObject({ who: "Старий", hue: 40, online: false, count: 0 }); // an author whose profile is gone still reads
});

test("the Write now answer becomes the line under the strip", () => {
  const plural = (n: number) => `${n} posts`;
  expect(noticeFromForce({ ok: true, written: 2 }, plural, t)).toEqual({ kind: "ok", text: "Written: 2 posts." });
  expect(noticeFromForce({ ok: false, errors: [{ error: "x", code: "no-model" }] }, plural, t)).toMatchObject({ kind: "error", noModel: true });
  expect(noticeFromForce({ ok: false, code: "no-profiles", error: "x" }, plural, t).text).toBe("No profiles");
  expect(noticeFromForce({ ok: false, code: "no-target", error: "there are no boards yet" }, plural, t).text).toBe("No boards");
  expect(noticeFromForce({ ok: false, code: "no-target", error: "no character can write here" }, plural, t).text).toBe("Nobody here");
  expect(noticeFromForce({ ok: false, errors: [{ error: "the model's answer was not a topic" }] }, plural, t).text).toBe("Failed: the model's answer was not a topic");
});

test("default boards are neutral: sections and boards with names and descriptions from the strings", () => {
  const boards = defaultBoards(t);
  expect(boards).toHaveLength(2);
  expect(boards.flatMap((c) => c.boards)).toHaveLength(5);
  expect(boards[0].name).toBe("forum.defaults.general"); // the key itself here: the real strings are checked by skeleton.test.ts
});

test("the posts of a later page are numbered from their place in the topic", () => {
  const page: EngineTopicPage = {
    topic: { id: "t", title: "T", board: { id: "b", name: "B", category: "C" }, createdAt: 1, lastAt: 2, locked: false, unread: false, posts: [{ id: "p26", by: "me", name: "", hue: 1, at: 1, text: "x" }, { id: "p27", by: "me", name: "", hue: 1, at: 2, text: "y" }] },
    paging: { page: 2, pages: 2, size: 25, total: 27, from: 25 },
    authors: {},
  };
  const shown = postsFromEngine(page, 2, "en", t);
  expect(shown.map((p) => p.n)).toEqual([26, 27]);
  expect(shown.map((p) => p.subject)).toEqual(["Re: T", "Re: T"]); // only the very first post carries the title
  const first = postsFromEngine({ ...page, paging: { page: 1, pages: 2, size: 25, total: 27, from: 0 } }, 2, "en", t);
  expect(first.map((p) => p.subject)).toEqual(["T", "Re: T"]);
  // an engine that does not page counts from 1
  expect(postsFromEngine({ ...page, paging: undefined }, 2, "en", t).map((p) => p.n)).toEqual([1, 2]);
});

test("search rows name the place, the author and the post; the user's own hit reads as 'Me'", () => {
  const s: EngineSearch = {
    q: "well",
    words: ["well"],
    tooShort: false,
    truncated: false,
    topics: [
      { id: "a", title: "A", board: { id: "b1", name: "Guest" }, category: "General", by: "m1", name: "Мавка", hue: 150, at: 5, n: 34, page: 2, matches: 3, titleHit: false, snippet: "the well", lastAt: 9 },
      { id: "b", title: "B", board: { id: "b2", name: "" }, category: "", by: "me", name: "", hue: 1, at: 6, n: 1, page: 1, matches: 0, titleHit: true, snippet: "x", lastAt: 9 },
    ],
  };
  const rows = searchRowsFromEngine(s, 10, "en", t);
  expect(rows[0]).toMatchObject({ id: "a", where: "General › Guest", who: "Мавка", me: false, n: 34, page: 2, matches: 3 });
  expect(rows[1]).toMatchObject({ where: "", who: "Me", me: true, titleHit: true });
});

test("the searched words are marked in any case, and are never read as a pattern", () => {
  const marks = (text: string, words: string[]) => highlightParts(text, words).map((p) => (p.hit ? `[${p.text}]` : p.text)).join("");
  expect(marks("The old WELL behind the well-house", ["well"])).toBe("The old [WELL] behind the [well]-house");
  expect(marks("Ліс ШУМИТЬ", ["шумить", "ліс"])).toBe("[Ліс] [ШУМИТЬ]");
  expect(marks("a.b (c) [d]", ["(c)", ".", "[d]"])).toBe("a[.]b [(c)] [[d]]");
  expect(marks("plain", [])).toBe("plain");
  expect(marks("", ["x"])).toBe("");
  expect(marks("longer words win: wellness", ["well", "wellness"])).toBe("longer words win: [wellness]");
});

test("a removed post is shown as a placeholder in its place, without text", () => {
  const page: EngineTopicPage = {
    topic: { id: "t", title: "T", board: { id: "b", name: "B", category: "C" }, createdAt: 1, lastAt: 2, locked: false, unread: false, posts: [{ id: "p1", by: "me", name: "", hue: 1, at: 1, text: "a" }, { id: "p2", by: "m1", name: "Мавка", hue: 1, at: 2, text: "", removed: true }] },
    authors: {},
  };
  const shown = postsFromEngine(page, 2, "en", t);
  expect(shown.map((p) => [p.n, p.removed === true, p.text])).toEqual([[1, false, "a"], [2, true, ""]]);
});
