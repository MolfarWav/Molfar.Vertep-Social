// The user deletes a board (#367 follow-up): the board and its topics go for good, an emptied category goes too, the others stay.
import { expect, test } from "bun:test";
import path from "node:path";

const forum = await import(path.resolve(import.meta.dir, "../plugins/forum/plugin.js"));

function makeHost() {
  const files = new Map<string, string>();
  return {
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
  } as any;
}
const topic = (id: string, board: string) => ({ id, board, title: id + " title", by: "me", name: "Me", hue: 1, createdAt: 1000, lastAt: 1000, locked: false, unread: false, owe: 0, posts: [{ id: "p-" + id, by: "me", name: "Me", hue: 1, at: 1000, text: "hello" }] });
const route = (h: any, body: object) => forum.handleRoute({ path: "/forum/delete-board", method: "POST", body }, h);

function world() {
  const h = makeHost();
  h.files.set("forum/boards.json", JSON.stringify({ categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Chat", desc: "" }, { id: "b2", name: "Games", desc: "" }] }, { id: "c2", name: "Art", boards: [{ id: "b3", name: "Pictures", desc: "" }] }] }));
  for (const [id, board] of [["t1", "b1"], ["t2", "b1"], ["t3", "b2"], ["t4", "b3"]]) h.files.set(`forum/topics/${id}.json`, JSON.stringify(topic(id, board)));
  return h;
}

test("deleting a board removes it and its topics and leaves the rest", () => {
  const h = world();
  const r = route(h, { board: "b1" }).json;
  expect(r).toMatchObject({ ok: true, deleted: "b1", topics: 2 });
  expect(h.files.has("forum/topics/t1.json")).toBe(false);
  expect(h.files.has("forum/topics/t2.json")).toBe(false);
  expect(h.files.has("forum/topics/t3.json")).toBe(true);
  const boards = forum.readBoards(h.fs);
  expect(boards.categories.map((c: any) => c.boards.map((b: any) => b.id))).toEqual([["b2"], ["b3"]]);
  // the front page no longer lists it, and the topic route does not find its topics
  const home = forum.handleRoute({ path: "/forum/home", method: "GET" }, h).json;
  expect(home.categories.flatMap((c: any) => c.boards.map((b: any) => b.id))).toEqual(["b2", "b3"]);
  expect(forum.handleRoute({ path: "/forum/board", method: "GET", query: { id: "b1" } }, h).status).toBe(404);
});

test("the last board of a category takes the category with it; an unknown board is refused", () => {
  const h = world();
  route(h, { board: "b3" });
  expect(forum.readBoards(h.fs).categories.map((c: any) => c.id)).toEqual(["c1"]);
  expect(route(h, { board: "b3" }).status).toBe(404);
  expect(route(h, { board: "nope" }).status).toBe(404);
  expect(route(h, {}).status).toBe(404);
  // every board gone: an empty forum that can be filled again
  route(h, { board: "b1" });
  route(h, { board: "b2" });
  expect(forum.readBoards(h.fs).categories).toEqual([]);
  forum.handleRoute({ path: "/forum/boards", method: "POST", body: { categories: [{ name: "New", boards: [{ name: "One", desc: "" }] }] } }, h);
  expect(forum.readBoards(h.fs).categories.length).toBe(1);
});
