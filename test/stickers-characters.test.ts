import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// Stickers and custom emoji, step 2 (issue #329): characters use the packs the user switched on for them.
const root = path.resolve(import.meta.dir, "..");
const messenger = await import(path.join(root, "plugins/messenger/plugin.js"));
const forum = await import(path.join(root, "plugins/forum/plugin.js"));
const profiles = await import(path.join(root, "plugins/profiles/plugin.js"));

function world(extra: Record<string, unknown> = {}) {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
  const fsx = {
    read: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    write: (p: string, c: string) => void files.set(p, c),
    remove: (p: string) => void files.delete(p),
    list: (d: string) => {
      const out = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
      if (!out.length) throw new Error("ENOENT");
      return out.sort();
    },
  };
  const host: any = { fs: fsx, llm: { results: {} as Record<string, unknown>, request: (key: string, req: any) => void requests.push({ key, req }) } };
  const put = (p: string, v: unknown) => void files.set(p, JSON.stringify(v));
  const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
  put("profiles/a.json", { id: "a", name: "Ada", hue: 100, about: "A painter.", interests: [], habits: [], voice: { length: 1, emoji: 0 }, schedule: always, forum: { frequency: 50 }, stickerPacks: ["cats", "blobs"], ...extra });
  put("settings.json", { tzOffset: 0 });
  put("stickers/packs.json", {
    packs: [
      { id: "cats", name: "Cats", kind: "sticker", items: [{ id: "grumpy", name: "Grumpy cat", url: "/v1/assets/s1" }, { id: "happy", name: "Happy cat", url: "/v1/assets/s2" }] },
      { id: "blobs", name: "Blobs", kind: "emoji", items: [{ id: "red", name: "Red", url: "/v1/assets/e1" }] },
      { id: "dogs", name: "Dogs", kind: "sticker", items: [{ id: "pug", name: "Pug", url: "/v1/assets/s3" }] },
    ],
  });
  return { files, requests, host, put };
}
type W = ReturnType<typeof world>;

const send = (w: W, text: string, reply: string) => {
  w.host.llm.results = {};
  messenger.handleRoute({ method: "POST", path: "/messenger/send", body: { id: "a", text } }, w.host);
  w.host.llm.results = { reply: { text: reply } };
  return messenger.handleRoute({ method: "POST", path: "/messenger/send", body: { id: "a", text }, stash: { sent: true } }, w.host).json.chat.messages as any[];
};

test("the packs block is the same in the messenger and the forum plugin", () => {
  const block = (f: string) => /\/\/ <stickers-shared>[\s\S]*?\/\/ <\/stickers-shared>/.exec(fs.readFileSync(path.join(root, f), "utf8").replaceAll("\r\n", "\n"))?.[0];
  expect(block("plugins/messenger/plugin.js")).toBeTruthy();
  expect(block("plugins/forum/plugin.js")).toBe(block("plugins/messenger/plugin.js"));
});

test("stickerPacksFor returns only the packs switched on for the profile", () => {
  const w = world();
  expect(messenger.stickerPacksFor(w.host.fs, { stickerPacks: ["cats", "nope"] }).map((p: any) => p.id)).toEqual(["cats"]);
  expect(messenger.stickerPacksFor(w.host.fs, {})).toEqual([]);
  expect(messenger.stickerPacksFor({ read: () => "{not json" }, { stickerPacks: ["cats"] })).toEqual([]);
});

test("stickerHint lists at most 12 items a pack, and leaves stickers out over the cap", () => {
  const many = { id: "big", name: "Big", kind: "sticker", items: Array.from({ length: 30 }, (_, n) => ({ id: "i" + n, name: "n" + n, url: "/v1/assets/x" })) };
  const hint = messenger.stickerHint([many], true);
  expect(hint).toContain("big/i11");
  expect(hint).not.toContain("big/i12");
  expect(hint).toContain("[[sticker:");
  const emoji = { id: "blobs", name: "Blobs", kind: "emoji", items: [{ id: "red", name: "Red", url: "/v1/assets/e1" }] };
  const capped = messenger.stickerHint([many, emoji], false);
  expect(capped).not.toContain("[[sticker:");
  expect(capped).toContain(":blobs/red:");
  expect(messenger.stickerHint([], true)).toBe("");
});

test("takeSticker cuts every marker and token it cannot honour", () => {
  const packs = messenger.stickerPacksFor(world().host.fs, { stickerPacks: ["cats", "blobs"] });
  const t = (s: string, may = true) => messenger.takeSticker(s, packs, may);
  expect(t("Aww [[sticker: cats/grumpy]]")).toEqual({ text: "Aww", sticker: { ref: "cats/grumpy", url: "/v1/assets/s1", alt: "Grumpy cat" } });
  expect(t("Aww [[sticker: cats/nope]]")).toEqual({ text: "Aww", sticker: null });
  expect(t("Aww [[sticker: dogs/pug]]")).toEqual({ text: "Aww", sticker: null }); // a pack that is not switched on
  expect(t("Aww [[sticker: cats/grumpy]]", false)).toEqual({ text: "Aww", sticker: null }); // over the cap
  expect(t("two [[sticker: cats/grumpy]] [[sticker: cats/happy]]").sticker?.ref).toBe("cats/grumpy");
  expect(t("ok :blobs/red: and :blobs/blue: and :ghost/x:").text).toBe("ok :blobs/red: and and");
  expect(t("at 9:30/10:30 sharp").text).toBe("at 9:30/10:30 sharp");
});

test("messenger: a sticker is a message of its own, within the day cap; the prompt offers packs only when switched on", () => {
  const w = world();
  const msgs = send(w, "hi", "Aww [[sticker: cats/grumpy]]");
  expect(w.requests[0]!.req.systemPrompt).toContain("[[sticker:");
  expect(w.requests[0]!.req.systemPrompt).toContain("cats/grumpy (Grumpy cat)");
  expect(w.requests[0]!.req.systemPrompt).not.toContain("dogs/pug");
  const them = msgs.filter((m) => m.who === "them");
  expect(them.map((m) => m.text)).toEqual(["Aww", ""]);
  expect(them[1].image).toEqual({ state: "ready", url: "/v1/assets/s1", alt: "Grumpy cat", sticker: "cats/grumpy" });
  // a reply that is only a sticker is a reply
  const solo = send(w, "again", "[[sticker: cats/happy]]").filter((m) => m.who === "them");
  expect(solo.at(-1).image.sticker).toBe("cats/happy");
  // three in a day, then no hint, and the marker is cut out
  send(w, "more", "[[sticker: cats/grumpy]]");
  const after = send(w, "even more", "Hmm [[sticker: cats/grumpy]]").filter((m) => m.who === "them");
  expect(after.at(-1)).toMatchObject({ text: "Hmm" });
  expect(after.at(-1).image).toBeUndefined();
  expect(w.requests.at(-1)!.req.systemPrompt).not.toContain("[[sticker:");
  expect(w.requests.at(-1)!.req.systemPrompt).toContain(":blobs/red:");
});

test("messenger: a profile with no packs switched on never sees them, and a marker is still cut out", () => {
  const w = world({ stickerPacks: [] });
  const them = send(w, "hi", "Hello [[sticker: cats/grumpy]]").filter((m) => m.who === "them");
  expect(w.requests[0]!.req.systemPrompt).not.toContain("cats/grumpy");
  expect(them.at(-1)).toMatchObject({ text: "Hello" });
  expect(them.at(-1).image).toBeUndefined();
});

test("forum: a reply may carry a sticker under its text; a new topic gets none", () => {
  const w = world();
  w.put("forum/boards.json", { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Art", desc: "" }] }] });
  w.put("forum/topics/t1.json", { id: "t1", board: "b1", title: "Hello", by: "me", name: "", hue: 200, createdAt: 1, lastAt: 1, locked: false, unread: false, owe: 0, posts: [{ id: "p1", by: "me", name: "", hue: 200, at: 1, text: "Hi all" }] });
  const boards = forum.readBoards(w.host.fs);
  const f = { kind: "reply", author: "a", topic: "t1", quote: "" };
  const a = forum.fileResult(w.host.fs, f, { text: "Funny :blobs/red: [[sticker: cats/grumpy]]" }, Date.now(), boards);
  expect(a.post).toMatchObject({ text: "Funny :blobs/red:", image: { state: "ready", url: "/v1/assets/s1", alt: "Grumpy cat", sticker: "cats/grumpy" } });
  const topic = forum.fileResult(w.host.fs, { kind: "topic", author: "a", board: "b1", ref: "" }, { text: JSON.stringify({ title: "My thread", text: "Hello :blobs/red: :blobs/zzz: [[sticker: cats/happy]]" }) }, Date.now() + 5, boards);
  expect(topic.post.text).toBe("Hello :blobs/red:");
  expect(topic.post.image).toBeUndefined();
});

test("the profile keeps the packs switched on for it, and drops bad ids", () => {
  const w = world();
  const r = profiles.handleRoute({ method: "PUT", path: "/profiles/a", body: { name: "Ada", about: "x", stickerPacks: ["cats", "cats", "bad id", 5, "blobs"] } }, w.host);
  expect(r.json.profile.stickerPacks).toEqual(["cats", "blobs"]);
  const none = profiles.handleRoute({ method: "PUT", path: "/profiles/a", body: { name: "Ada", about: "x", stickerPacks: [] } }, w.host);
  expect(none.json.profile.stickerPacks).toBeUndefined();
});
