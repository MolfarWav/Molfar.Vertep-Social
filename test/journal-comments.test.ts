// Journal J3 (#444): comments and follows. Characters comment under posts of those they follow or are close to, and answer the user.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const journal = await import(path.join(root, "plugins/journal/plugin.js"));

const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const asleep = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off"));

function memFs(files: Map<string, string>) {
  return {
    read: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    write: (p: string, c: string) => void files.set(p, c),
    remove: (p: string) => void files.delete(p),
    list: (d: string) => {
      const o = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
      if (!o.length) throw new Error("ENOENT");
      return o;
    },
  } as any;
}

function talkWorld(settings: object = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { journalComments: true, journalCommentsPerDay: 2 }, ...settings }));
  files.set("you.json", JSON.stringify({ active: "me1", personas: [{ id: "me1", name: "Me" }] }));
  files.set("profiles/mavka.json", JSON.stringify({ name: "Mavka", hue: 120, about: "A mavka of the lake.", schedule: always }));
  files.set("profiles/lis.json", JSON.stringify({ name: "Lis", hue: 30, about: "A fox.", schedule: always }));
  files.set("journal/mavka.json", JSON.stringify({ posts: [{ id: "p1", at: noon - 3600000, title: "By the reeds", text: "I mended the net today.", tags: [], visible: "all", from: "diary:e1" }] }));
  files.set("life/people/lis.json", JSON.stringify({ people: [{ key: "c:mavka", lvl: "friend", fol: true, note: "A calm friend of the lake." }, { key: "u:me1", lvl: "acquaintance", fol: false }] }));
  files.set("life/people/mavka.json", JSON.stringify({ people: [{ key: "c:lis", lvl: "penfriend", fol: false, note: "Lis is quick and kind." }, { key: "u:me1", lvl: "acquaintance", fol: true, note: "Me asks good questions." }] }));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  const host: any = { fs: memFs(files), llm: { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) } };
  return { files, host, requests, setResults: (r: Record<string, unknown>) => (results = r) };
}
type World = ReturnType<typeof talkWorld>;
const withRandom = <T,>(r: number, fn: () => T): T => {
  const old = Math.random;
  Math.random = () => r;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
};
const at = <T,>(t: number, fn: () => T): T => {
  const n = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = n;
  }
};
const tick = (w: World, rnd: number, t = noon) => at(t, () => withRandom(rnd, () => journal.onTick({}, w.host)));
const jroute = (w: World, method: string, p: string, body: object = {}, query: object = {}, t = noon) => at(t, () => journal.handleRoute({ method, path: p, body, query } as any, w.host));
const asked = (w: World) => w.requests.filter((r) => r.key.startsWith("jc:")).map((r) => r.key);

test("the user comments, lists, removes; the author's memory of the commenter shows; a removed post takes its comments", () => {
  const w = talkWorld();
  const made = jroute(w, "POST", "/journal/comment", { owner: "mavka", post: "p1", text: " Nice\r\n\r\n\r\n <b>net</b> " });
  expect(made.status).toBe(200);
  expect(made.json.comment.text).toBe("Nice\n\nnet");
  const list = jroute(w, "GET", "/journal/comments", {}, { owner: "mavka", post: "p1" }).json.comments;
  expect(list.length).toBe(1);
  expect(list[0].mine).toBe(true);
  expect(list[0].name).toBe("Me");
  expect(list[0].view).toBe("Me asks good questions.");
  expect(jroute(w, "POST", "/journal/comment", { owner: "mavka", post: "p1", text: "  " }).status).toBe(400);
  expect(jroute(w, "POST", "/journal/comment", { owner: "mavka", post: "nope", text: "x" }).status).toBe(404);
  expect(jroute(w, "GET", "/journal/comments", {}, { owner: "../x", post: "p1" }).status).toBe(404);
  expect(jroute(w, "GET", "/journal/feed").json.posts.find((p: any) => p.id === "p1").comments).toBe(1);
  expect(jroute(w, "POST", "/journal/comment/remove", { post: "p1", id: made.json.comment.id }).json.ok).toBe(true);
  expect(jroute(w, "GET", "/journal/comments", {}, { owner: "mavka", post: "p1" }).json.comments).toEqual([]);
  jroute(w, "POST", "/journal/comment", { owner: "mavka", post: "p1", text: "again" });
  jroute(w, "POST", "/journal/remove", { id: "p1", owner: "mavka" });
  expect(w.files.has("journal/comments/p1.json")).toBe(false);
});

test("follow a journal: the Following feed and the flag on posts", () => {
  const w = talkWorld();
  w.files.set("journal/lis.json", JSON.stringify({ posts: [{ id: "p2", at: noon - 1000, text: "fox post", tags: [], visible: "all", from: "you" }] }));
  expect(jroute(w, "POST", "/journal/follow", { id: "lis", on: true }).json.following).toBe(true);
  expect(jroute(w, "POST", "/journal/follow", { id: "ghost", on: true }).status).toBe(404);
  expect(jroute(w, "POST", "/journal/follow", { id: "you", on: true }).status).toBe(404);
  const only = jroute(w, "GET", "/journal/feed", {}, { follow: "1" }).json.posts;
  expect(only.map((p: any) => p.id)).toEqual(["p2"]);
  expect(only[0].following).toBe(true);
  expect(jroute(w, "GET", "/journal/feed").json.posts.find((p: any) => p.id === "p1").following).toBe(false);
  jroute(w, "POST", "/journal/follow", { id: "lis", on: false });
  expect(jroute(w, "GET", "/journal/feed", {}, { follow: "1" }).json.posts).toEqual([]);
});

test("a character who follows the author comments once, within its cap, and the answer is cleaned", () => {
  const w = talkWorld();
  tick(w, 0);
  expect(asked(w)).toEqual(["jc:lis:mavka:p1"]);
  const ask = w.requests.find((r) => r.key.startsWith("jc:"))!;
  expect(ask.req.messages[0].content).toContain("I mended the net today.");
  expect(ask.req.messages[0].content).toContain("A calm friend of the lake.");
  expect(ask.req.systemPrompt).toContain("A fox.");
  w.setResults({ "jc:lis:mavka:p1": { text: '"Lis: Nice work with the net!"' } });
  tick(w, 0, noon + 60000);
  const comments = jroute(w, "GET", "/journal/comments", {}, { owner: "mavka", post: "p1" }).json.comments;
  expect(comments.map((c: any) => c.text)).toEqual(["Nice work with the net!"]);
  expect(comments[0].name).toBe("Lis");
  expect(comments[0].view).toBe("Lis is quick and kind.");
  // not twice by the same character
  w.setResults({});
  for (let i = 0; i < 5; i++) tick(w, 0, noon + (2 + i) * 60000);
  expect(asked(w).length).toBe(1);
});

test("no comment without a tie, on an old post, on a friends-only post, asleep, or with the switch off", () => {
  const cases: [string, (w: World) => void][] = [
    ["no tie", (w) => w.files.set("life/people/lis.json", JSON.stringify({ people: [{ key: "c:mavka", lvl: "acquaintance", fol: false }] }))],
    ["old post", (w) => w.files.set("journal/mavka.json", JSON.stringify({ posts: [{ id: "p1", at: noon - 5 * 24 * 3600000, text: "old", tags: [], visible: "all", from: "you" }] }))],
    ["friends only", (w) => w.files.set("journal/mavka.json", JSON.stringify({ posts: [{ id: "p1", at: noon - 3600000, text: "secret", tags: [], visible: "friends", from: "you" }] }))],
    ["asleep", (w) => w.files.set("profiles/lis.json", JSON.stringify({ name: "Lis", hue: 30, schedule: asleep }))],
  ];
  for (const [name, change] of cases) {
    const w = talkWorld();
    change(w);
    tick(w, 0);
    expect(asked(w), name).toEqual([]);
  }
  const off = talkWorld({ community: { journalComments: false } });
  tick(off, 0);
  expect(off.requests.length).toBe(0);
  const capped = talkWorld({ community: { journalComments: true, journalCommentsPerDay: 0 } });
  tick(capped, 0);
  expect(capped.requests.length).toBe(0);
});

test("an author answers the user's comment under her own post, whatever the chance, once", () => {
  const w = talkWorld();
  w.files.set("life/people/lis.json", JSON.stringify({ people: [] })); // lis has no tie: only the owed reply is left
  jroute(w, "POST", "/journal/comment", { owner: "mavka", post: "p1", text: "How long did it take?" });
  tick(w, 0.99);
  expect(asked(w)).toEqual(["jc:mavka:mavka:p1"]);
  const ask = w.requests.find((r) => r.key.startsWith("jc:"))!;
  expect(ask.req.systemPrompt).toContain("reply to them");
  expect(ask.req.messages[0].content).toContain("How long did it take?");
  w.setResults({ "jc:mavka:mavka:p1": { text: "All morning, by the reeds." } });
  tick(w, 0.99, noon + 60000);
  expect(jroute(w, "GET", "/journal/comments", {}, { owner: "mavka", post: "p1" }).json.comments.map((c: any) => c.by)).toEqual(["you", "mavka"]);
  w.setResults({});
  tick(w, 0.99, noon + 120000);
  expect(asked(w).length).toBe(1);
});

test("a character comments on the user's post when it knows them; a failed answer waits half an hour", () => {
  const w = talkWorld();
  w.files.delete("journal/mavka.json");
  w.files.set("journal/you.json", JSON.stringify({ posts: [{ id: "y1", at: noon - 1000, text: "My quiet day.", tags: [], visible: "all", from: "you" }] }));
  w.files.set("life/people/lis.json", JSON.stringify({ people: [{ key: "u:me1", lvl: "friend", fol: true }] }));
  w.files.set("life/people/mavka.json", JSON.stringify({ people: [] }));
  tick(w, 0);
  expect(asked(w)).toContain("jc:lis:you:y1");
  w.setResults({ "jc:lis:you:y1": { error: "rate limit" } });
  tick(w, 0, noon + 60000);
  expect(jroute(w, "GET", "/journal/comments", {}, { owner: "you", post: "y1" }).json.comments).toEqual([]);
  w.setResults({});
  const n = asked(w).length;
  tick(w, 0, noon + 10 * 60000);
  expect(asked(w).length).toBe(n);
  tick(w, 0, noon + 40 * 60000);
  expect(asked(w).length).toBe(n + 1);
  expect(journal.fileCommentResult(w.host.fs, "jc:../x:a:b", { text: "x" }, noon, 0).error).toBe("bad key");
});
