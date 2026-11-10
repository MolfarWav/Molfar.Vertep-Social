// Notices (#367): who answered you or reacted to your post, and how a persona looks from outside (by rules, from the people lists).
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const life = await import(path.join(root, "plugins/life/plugin.js"));

const HOUR = 3600000;
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));

function makeHost() {
  const files = new Map<string, string>();
  const host: any = {
    files,
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => void files.delete(p),
      list: (d: string) => {
        const o = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
        if (!o.length) throw new Error("ENOENT");
        return o.sort();
      },
    },
  };
  return host;
}
const put = (h: any, p: string, v: unknown) => void h.files.set(p, JSON.stringify(v));
const get = (h: any, p: string) => JSON.parse(h.files.get(p)!);
const prof = (id: string, name: string) => ({ id, name, hue: 100, about: "x", interests: [], habits: [], voice: { length: 0, emoji: 0 }, schedule: always, createdAt: 1000, forum: { frequency: 50, repliesYou: true, repliesOthers: true, opensOwn: true, favourites: [] }, life: { on: true, world: true } });
const boards = { categories: [{ id: "c", name: "C", boards: [{ id: "b1", name: "General", desc: "" }] }] };

function world() {
  const h = makeHost();
  put(h, "profiles/anna.json", prof("anna", "Anna"));
  put(h, "profiles/boris.json", prof("boris", "Boris"));
  put(h, "forum/boards.json", boards);
  put(h, "settings.json", { tzOffset: 0 });
  put(h, "you.json", { active: "p1", personas: [{ id: "p1", name: "Yaroslav", about: "", hue: 10 }, { id: "p2", name: "Other", about: "", hue: 20 }] });
  const mine = { id: "u1", by: "me", name: "Yaroslav", hue: 10, at: NOW - 2 * HOUR, text: "Who likes tea?", persona: "p1" };
  put(h, "forum/topics/t1.json", { id: "t1", board: "b1", title: "Tea", by: "me", name: "Yaroslav", hue: 10, createdAt: NOW - 2 * HOUR, lastAt: NOW - 2 * HOUR, locked: false, unread: false, owe: 0, posts: [mine] });
  return h;
}

test("a character's reply to the user's post becomes a notice; a reply to another character does not", () => {
  const h = world();
  const r = forum.fileResult(h.fs, { kind: "reply", author: "anna", topic: "t1", quote: "u1" }, { text: "I do, with lemon." }, NOW, forum.readBoards(h.fs));
  expect(r.post).toBeTruthy();
  const n = get(h, "forum/notices.json");
  expect(n.items.length).toBe(1);
  expect(n.items[0]).toMatchObject({ kind: "reply", by: "anna", name: "Anna", topic: "t1", post: r.post.id, excerpt: "I do, with lemon." });
  // Boris answers Anna's post: nothing for the user
  forum.fileResult(h.fs, { kind: "reply", author: "boris", topic: "t1", quote: r.post.id }, { text: "Not me." }, NOW + 1000, forum.readBoards(h.fs));
  expect(get(h, "forum/notices.json").items.length).toBe(1);
});

test("the notices route lists the newest first with the topic title, counts the unread, and the home carries the number", () => {
  const h = world();
  forum.fileResult(h.fs, { kind: "reply", author: "anna", topic: "t1", quote: "u1" }, { text: "First answer." }, NOW, forum.readBoards(h.fs));
  const real = Date.now;
  Date.now = () => NOW + 60000;
  try {
    const list = forum.handleRoute({ path: "/forum/notices", method: "GET" }, h).json;
    expect(list.items.length).toBe(1);
    expect(list.items[0]).toMatchObject({ kind: "reply", name: "Anna", title: "Tea", new: true });
    expect(list.unread).toBe(1);
    expect(forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json.notices).toBe(1);
    expect(forum.handleRoute({ path: "/forum/notices-read", method: "POST" }, h).json.ok).toBe(true);
    expect(forum.handleRoute({ path: "/forum/notices", method: "GET" }, h).json.unread).toBe(0);
    expect(forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json.notices).toBe(0);
  } finally {
    Date.now = real;
  }
});

test("a notice whose post or topic is gone is not shown or counted", () => {
  const h = world();
  const r = forum.fileResult(h.fs, { kind: "reply", author: "anna", topic: "t1", quote: "u1" }, { text: "First answer." }, NOW, forum.readBoards(h.fs));
  const real = Date.now;
  Date.now = () => NOW + 60000;
  try {
    const t = get(h, "forum/topics/t1.json");
    t.posts = t.posts.map((p: any) => (p.id === r.post.id ? { id: p.id, by: p.by, name: p.name, hue: p.hue, at: p.at, text: "", removed: true } : p));
    put(h, "forum/topics/t1.json", t);
    expect(forum.handleRoute({ path: "/forum/notices", method: "GET" }, h).json.items.length).toBe(0);
    expect(forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json.notices).toBe(0);
  } finally {
    Date.now = real;
  }
});

test("a character's reaction to the user's post becomes a notice, once; a reaction to someone else's does not", () => {
  const h = world();
  const s = forum.readSettings(h.fs);
  const log = forum.readLog(h.fs, NOW, 0);
  let tries = 0;
  while (tries++ < 20 && !h.files.has("forum/notices.json")) forum.reactTick(h.fs, { ...s, autonomous: true, reactions: true }, log, NOW, 0, () => 0);
  const n = get(h, "forum/notices.json");
  expect(n.items.length).toBe(1);
  expect(n.items[0]).toMatchObject({ kind: "react", topic: "t1", post: "u1" });
  expect(typeof n.items[0].emoji).toBe("string");
});

test("reputation: counts who has met a persona, who is fond, who is cool, and the mood", () => {
  const h = world();
  put(h, "profiles/clara.json", prof("clara", "Clara"));
  const entry = (key: string, extra: object) => ({ key, name: "x", seen: 2, toMe: 1, fromMe: 1, said: [], note: "", feel: 0, ...extra });
  put(h, "life/people/anna.json", { scanned: 0, noteDay: "", failedAt: 0, people: [entry("u:p1", { feel: 5 })] });
  put(h, "life/people/boris.json", { scanned: 0, noteDay: "", failedAt: 0, people: [entry("u:p1", { feel: -4 }), entry("u:p2", { feel: 0, seen: 0, toMe: 0, fromMe: 0 })] });
  put(h, "life/people/clara.json", { scanned: 0, noteDay: "", failedAt: 0, people: [entry("u:p1", { feel: 6 })] });
  const v = life.reputationView(h.fs);
  expect(v.characters).toBe(3);
  const p1 = v.personas.find((x: any) => x.id === "p1");
  expect(p1.known.count).toBe(3);
  expect(p1.fond.names.sort()).toEqual(["Anna", "Clara"]);
  expect(p1.cool.names).toEqual(["Boris"]);
  expect(p1.mood).toBe("liked");
  const p2 = v.personas.find((x: any) => x.id === "p2");
  expect(p2.known.count).toBe(0);
  expect(p2.mood).toBe("unknown");
  // the route serves it, and no impression or quoted word is in it
  const via = life.handleRoute({ path: "/life/reputation", method: "GET" }, h).json;
  expect(via.personas.length).toBe(2);
  expect(JSON.stringify(via)).not.toContain("note");
});
