// Journal J4 (#444): friends-only posts. One rule, `canRead`, decides who may read what; a character never comments on what it may not read.
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

/** Lis is close to the user (follows the persona, pen friend); the user's post has the given visibility; `follows` is the user's own list. */
function world(visible: string, opts: { follows?: string[]; lisFollowsUser?: boolean } = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { journalComments: true, journalCommentsPerDay: 2 } }));
  files.set("you.json", JSON.stringify({ active: "me1", personas: [{ id: "me1", name: "Me" }] }));
  files.set("profiles/lis.json", JSON.stringify({ name: "Lis", hue: 30, about: "A fox.", schedule: always }));
  files.set("profiles/mavka.json", JSON.stringify({ name: "Mavka", hue: 120, schedule: always }));
  files.set("journal/you.json", JSON.stringify({ posts: [{ id: "y1", at: noon - 1000, text: "My quiet day.", tags: [], visible, from: "you" }] }));
  files.set("life/people/lis.json", JSON.stringify({ people: [{ key: "u:me1", lvl: "friend", fol: opts.lisFollowsUser !== false }] }));
  files.set("life/people/mavka.json", JSON.stringify({ people: [] }));
  if (opts.follows) files.set("journal/follows.json", JSON.stringify({ you: opts.follows }));
  const requests: { key: string; req: any }[] = [];
  const host: any = { fs: memFs(files), llm: { results: {}, request: (key: string, req: any) => void requests.push({ key, req }) } };
  return { files, host, requests };
}
type World = ReturnType<typeof world>;
const tick = (w: World) => {
  const n = Date.now;
  const r = Math.random;
  Date.now = () => noon;
  Math.random = () => 0;
  try {
    journal.onTick({}, w.host);
  } finally {
    Date.now = n;
    Math.random = r;
  }
};
const asked = (w: World) => w.requests.filter((r) => r.key.startsWith("jc:")).map((r) => r.key);
const route = (w: World, method: string, p: string, body: object = {}) => journal.handleRoute({ method, path: p, body, query: {} } as any, w.host);

test("a post for everyone is commented by a character who is close; friends-only needs a friend; only-me needs nobody", () => {
  const open = world("all");
  tick(open);
  expect(asked(open)).toEqual(["jc:lis:you:y1"]);

  const friends = world("friends", { follows: ["lis"] });
  tick(friends);
  expect(asked(friends)).toEqual(["jc:lis:you:y1"]);

  const mine = world("me", { follows: ["lis"] });
  tick(mine);
  expect(asked(mine)).toEqual([]);
});

test("a friend is followed by the user AND follows the persona back: one side is not enough", () => {
  const notFollowed = world("friends"); // lis follows the user, the user does not follow lis
  tick(notFollowed);
  expect(asked(notFollowed)).toEqual([]);
  const notBack = world("friends", { follows: ["lis"], lisFollowsUser: false });
  tick(notBack);
  expect(asked(notBack)).toEqual([]);
  const wrongOne = world("friends", { follows: ["mavka"] });
  tick(wrongOne);
  expect(asked(wrongOne)).toEqual([]);
});

test("canRead: the rule in one place, for the user's posts and between characters", () => {
  const people: Record<string, Map<string, any>> = {
    a: new Map([["c:b", { fol: true }], ["u:me1", { fol: true }]]),
    b: new Map([["c:a", { fol: true }]]),
    c: new Map([["c:a", { fol: true }]]),
  };
  const ctx = { follows: ["a"], you: { id: "me1", name: "Me" }, peopleFor: (id: string) => people[id] ?? new Map() };
  const post = (visible: string) => ({ visible });
  expect(journal.canRead(ctx, "z", "you", post("all"))).toBe(true);
  expect(journal.canRead(ctx, "a", "you", post("friends"))).toBe(true);
  expect(journal.canRead(ctx, "b", "you", post("friends"))).toBe(false); // the user does not follow b
  expect(journal.canRead(ctx, "a", "you", post("me"))).toBe(false);
  // between characters: each follows the other
  expect(journal.canRead(ctx, "b", "a", post("friends"))).toBe(true);
  expect(journal.canRead(ctx, "c", "a", post("friends"))).toBe(false); // a does not follow c
  expect(journal.canRead(ctx, "a", "a", post("me"))).toBe(true); // the owner
  expect(journal.canRead(ctx, "b", "a", post("something else"))).toBe(false);
});

test("the friends route lists the characters who may read friends-only posts", () => {
  const w = world("friends", { follows: ["lis", "mavka", "ghost"] });
  expect(route(w, "GET", "/journal/friends").json.friends.map((f: any) => f.id)).toEqual(["lis"]);
  expect(route(world("all"), "GET", "/journal/friends").json.friends).toEqual([]);
});

test("the visibility of a post is written and edited by the user, and a bad value is ignored", () => {
  const w = world("all");
  const made = route(w, "POST", "/journal/post", { text: "For friends", visible: "friends" });
  expect(made.json.post.visible).toBe("friends");
  const edited = route(w, "POST", "/journal/edit", { id: made.json.post.id, visible: "me" });
  expect(edited.json.post.visible).toBe("me");
  expect(route(w, "POST", "/journal/edit", { id: made.json.post.id, visible: "everyone" }).json.post.visible).toBe("me");
  expect(route(w, "POST", "/journal/post", { text: "Default" }).json.post.visible).toBe("all");
});

test("a comment that arrives after the post became private is not filed", () => {
  const w = world("friends", { follows: ["lis"] });
  tick(w);
  expect(asked(w)).toEqual(["jc:lis:you:y1"]);
  // the user makes it private before the answer comes
  route(w, "POST", "/journal/edit", { id: "y1", visible: "me" });
  const r = journal.fileCommentResult(w.host.fs, "jc:lis:you:y1", { text: "Lovely." }, noon + 1000, 0);
  expect(r.error).toBeTruthy();
  expect(w.files.has("journal/comments/y1.json")).toBe(false);
});
