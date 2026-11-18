// Journal leftovers of #453: friends-only posts and pictures from characters, hiding a character's post, a place on the user's post,
// the count of new comments, and the author's view of a commenter worded once when Life has no note.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const journal = await import(path.join(root, "plugins/journal/plugin.js"));

const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));

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
function world(community: object = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { journalPosts: true, journalComments: true, ...community } }));
  files.set("you.json", JSON.stringify({ active: "me1", personas: [{ id: "me1", name: "Me" }] }));
  files.set("profiles/mavka.json", JSON.stringify({ name: "Mavka", hue: 120, about: "A mavka of the lake.", schedule: always }));
  files.set("profiles/lis.json", JSON.stringify({ name: "Lis", hue: 30, about: "A fox.", schedule: always }));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  const host: any = { fs: memFs(files), llm: { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) } };
  return { files, host, requests, setResults: (r: Record<string, unknown>) => (results = r) };
}
type World = ReturnType<typeof world>;
const at = <T,>(t: number, fn: () => T): T => {
  const n = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = n;
  }
};
const withRandom = <T,>(r: number, fn: () => T): T => {
  const old = Math.random;
  Math.random = () => r;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
};
const route = (w: World, method: string, p: string, body: object = {}, query: object = {}, t = noon) => at(t, () => journal.handleRoute({ method, path: p, body, query } as any, w.host));
const posts = (w: World, owner: string) => JSON.parse(w.files.get(`journal/${owner}.json`)!).posts;

test("a character's post: the model may make it friends-only, and with the pictures switch it may describe a photo", () => {
  expect(journal.postSystem({ name: "Mavka", about: "", voice: {} }, false)).not.toContain('"picture"');
  expect(journal.postSystem({ name: "Mavka", about: "", voice: {} }, true)).toContain('"picture"');
  const w = world();
  w.files.set("journal/state.json", JSON.stringify({ day: "2026-11-10", pending: { mavka: { at: noon, entries: ["e1"] } } }));
  const answer = JSON.stringify({ title: "Quiet", text: "Only for you all.", mood: "calm", tags: [], for: "friends", picture: "The lake at dawn" });
  at(noon, () => journal.fileWriterResult(w.host.fs, "jp:mavka", { text: answer }, noon, 0));
  const p1 = posts(w, "mavka")[0];
  expect(p1.visible).toBe("friends");
  // the switch is off: the picture is not kept
  expect(p1.image).toBeUndefined();
  w.files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { journalPosts: true, journalPictures: true } }));
  w.files.set("journal/state.json", JSON.stringify({ day: "2026-11-10", pending: { mavka: { at: noon, entries: ["e2"] } } }));
  at(noon, () => journal.fileWriterResult(w.host.fs, "jp:mavka", { text: JSON.stringify({ title: "Dawn", text: "Look.", for: "everyone", picture: "The lake at dawn" }) }, noon + 1, 0));
  const p2 = posts(w, "mavka").find((p: any) => p.title === "Dawn");
  expect(p2.visible).toBe("all");
  expect(p2.image).toEqual({ state: "pending", prompt: "The lake at dawn", gen: true });
  // the page's picture worker finds it
  expect(route(w, "GET", "/journal/images").json.items.map((x: any) => x.id)).toContain(p2.id);
});

test("the user hides a character's post from every other character and shows it again; a bad value is refused", () => {
  const w = world();
  w.files.set("journal/mavka.json", JSON.stringify({ posts: [{ id: "p1", at: noon - 1000, title: "", text: "Hello", tags: [], visible: "all", from: "diary:e1" }] }));
  expect(route(w, "POST", "/journal/visible", { owner: "mavka", id: "p1", visible: "me" }).json.visible).toBe("me");
  expect(posts(w, "mavka")[0].visible).toBe("me");
  expect(journal.canRead({ follows: [], you: { id: "me1" }, peopleFor: () => new Map() }, "lis", "mavka", posts(w, "mavka")[0])).toBe(false);
  expect(route(w, "POST", "/journal/visible", { owner: "mavka", id: "p1", visible: "nobody" }).status).toBe(404);
  route(w, "POST", "/journal/visible", { owner: "mavka", id: "p1", visible: "all" });
  expect(posts(w, "mavka")[0].visible).toBe("all");
});

test("the user's post carries a place of the town by its id; an unknown id adds nothing; an edit can clear it", () => {
  const w = world();
  // the city's tick writes the town once; the journal only reads it
  w.files.set("city/places.json", JSON.stringify({ districts: [{ id: "centre", name: "Centre" }], places: [{ id: "cafe", district: "centre", name: "The cafe by the park" }] }));
  const r = route(w, "POST", "/journal/post", { text: "Coffee time", place: "cafe" });
  expect(r.json.post.place).toBe("The cafe by the park");
  const odd = route(w, "POST", "/journal/post", { text: "Somewhere", place: "nowhere" });
  expect(odd.json.post.place).toBeUndefined();
  const kept = route(w, "POST", "/journal/edit", { id: r.json.post.id, text: "Coffee time!" });
  expect(kept.json.post.place).toBe("The cafe by the park");
  const cleared = route(w, "POST", "/journal/edit", { id: r.json.post.id, place: "" });
  expect(cleared.json.post.place).toBeUndefined();
});

test("new comments: under the user's posts and after the user's own comment elsewhere; opening the journal marks them seen", () => {
  const w = world();
  w.files.set("journal/you.json", JSON.stringify({ posts: [{ id: "u1", at: noon - 7200000, title: "", text: "Mine", tags: [], visible: "all", from: "you" }] }));
  w.files.set("journal/mavka.json", JSON.stringify({ posts: [{ id: "m1", at: noon - 7200000, title: "", text: "Hers", tags: [], visible: "all", from: "diary:e1" }, { id: "m2", at: noon - 7200000, title: "", text: "Other", tags: [], visible: "all", from: "diary:e2" }] }));
  w.files.set("journal/comments/u1.json", JSON.stringify({ comments: [{ id: "c1", by: "lis", at: noon - 3600000, text: "Nice" }] }));
  w.files.set("journal/comments/m1.json", JSON.stringify({ comments: [{ id: "c2", by: "lis", at: noon - 5000000, text: "Before you" }, { id: "c3", by: "you", at: noon - 4000000, text: "Hi" }, { id: "c4", by: "mavka", at: noon - 3000000, text: "Hi back" }] }));
  // a talk the user is not part of does not count
  w.files.set("journal/comments/m2.json", JSON.stringify({ comments: [{ id: "c5", by: "lis", at: noon - 3000000, text: "Not to you" }] }));
  expect(route(w, "GET", "/journal/unread").json.unread).toBe(2);
  const feed = route(w, "GET", "/journal/feed").json.posts;
  expect(feed.find((p: any) => p.id === "u1").fresh).toBe(1);
  expect(feed.find((p: any) => p.id === "m1").fresh).toBe(1);
  expect(feed.find((p: any) => p.id === "m2").fresh).toBeUndefined();
  route(w, "POST", "/journal/seen");
  expect(route(w, "GET", "/journal/unread", {}, {}, noon + 1000).json.unread).toBe(0);
});

test("the author's view: Life's note first; without one, one call words it, it is filed and shown, and a day has a cap", () => {
  const w = world();
  w.files.set("journal/mavka.json", JSON.stringify({ posts: [{ id: "m1", at: noon - 3600000, title: "", text: "Hers", tags: [], visible: "all", from: "diary:e1" }] }));
  w.files.set("journal/comments/m1.json", JSON.stringify({ comments: [{ id: "c1", by: "lis", at: noon - 1800000, text: "Lovely nets!" }, { id: "c2", by: "mavka", at: noon - 1700000, text: "Thank you" }] }));
  // the reply owed to nobody, chance never met: only the view is asked
  at(noon, () => withRandom(0.99, () => journal.onTick({}, w.host)));
  expect(w.requests.map((r) => r.key)).toEqual(["jv:mavka:lis"]);
  expect(w.requests[0].req.messages[0].content).toContain("Lovely nets!");
  w.setResults({ "jv:mavka:lis": { text: '"Lis is quick and generous."' } });
  at(noon + 1000, () => withRandom(0.99, () => journal.onTick({}, w.host)));
  w.setResults({});
  const comments = route(w, "GET", "/journal/comments", {}, { owner: "mavka", post: "m1" }).json.comments;
  expect(comments.find((c: any) => c.by === "lis").view).toBe("Lis is quick and generous.");
  expect(comments.find((c: any) => c.by === "mavka").view).toBeUndefined();
  // worded once: not asked again
  w.requests.length = 0;
  at(noon + 600000, () => withRandom(0.99, () => journal.onTick({}, w.host)));
  expect(w.requests.filter((r) => r.key.startsWith("jv:"))).toEqual([]);
  // Life's note wins over the worded view
  w.files.set("life/people/mavka.json", JSON.stringify({ people: [{ key: "c:lis", lvl: "friend", note: "A fox from the woods." }] }));
  expect(route(w, "GET", "/journal/comments", {}, { owner: "mavka", post: "m1" }).json.comments.find((c: any) => c.by === "lis").view).toBe("A fox from the woods.");
  // the switch off: nothing is asked
  const off = world({ journalComments: false });
  off.files.set("journal/mavka.json", w.files.get("journal/mavka.json")!);
  off.files.set("journal/comments/m1.json", w.files.get("journal/comments/m1.json")!);
  at(noon, () => withRandom(0.99, () => journal.onTick({}, off.host)));
  expect(off.requests).toEqual([]);
});
