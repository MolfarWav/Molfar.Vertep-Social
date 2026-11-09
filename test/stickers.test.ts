import { expect, test } from "bun:test";
import path from "node:path";
import { addItems, findItem, MAX_ITEMS, newPack, parseToken, searchPacks, slug, splitTokens, tokenOf, uniqueId, withoutItem, type StickerPack } from "../src/stickers/model";

const plugin = await import(path.resolve(import.meta.dir, "../plugins/stickers/plugin.js"));
const messenger = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));
const forum = await import(path.resolve(import.meta.dir, "../plugins/forum/plugin.js"));

const pack = (): StickerPack => ({ id: "cats", name: "Cats", kind: "sticker", items: [{ id: "grumpy", name: "Grumpy cat", url: "/v1/assets/a1", tags: ["angry"] }] });

test("tokens: split, parse and round-trip", () => {
  expect(splitTokens("hi :cats/grumpy: and :x/y:!")).toEqual([
    { text: "hi " },
    { pack: "cats", item: "grumpy", raw: ":cats/grumpy:" },
    { text: " and " },
    { pack: "x", item: "y", raw: ":x/y:" },
    { text: "!" },
  ]);
  expect(splitTokens("no tokens, a:b or 12:30")).toEqual([{ text: "no tokens, a:b or 12:30" }]);
  expect(parseToken(tokenOf("cats", "grumpy"))).toEqual({ pack: "cats", item: "grumpy" });
  expect(parseToken(":cats/grumpy: more")).toBeNull();
  expect(parseToken(":" + "a".repeat(41) + "/b:")).toBeNull();
});

test("ids: slug, unique, pack and item names", () => {
  expect(slug("Мої Коти!")).toBe("");
  expect(slug("My Cats 2")).toBe("my-cats-2");
  expect(uniqueId("cats", ["cats", "cats-2"], "pack")).toBe("cats-3");
  expect(uniqueId("", [], "pack")).toBe("pack");
  const p = newPack([pack()], "Cats", "emoji");
  expect(p.id).toBe("cats-2");
  expect(p.kind).toBe("emoji");
});

test("addItems keeps ids unique and stops at the pack limit", () => {
  const r = addItems(pack(), [{ name: "Grumpy cat", url: "/v1/assets/a2" }, { name: "Пес", url: "/v1/assets/a3" }]);
  expect(r.pack.items.map((i) => i.id)).toEqual(["grumpy", "grumpy-cat", "item"]);
  const full = { ...pack(), items: Array.from({ length: MAX_ITEMS }, (_, n) => ({ id: "i" + n, name: "i", url: "/v1/assets/x" })) };
  const r2 = addItems(full, [{ name: "more", url: "/v1/assets/y" }]);
  expect(r2.pack.items.length).toBe(MAX_ITEMS);
  expect(r2.dropped).toBe(1);
  expect(withoutItem(pack(), "grumpy").items).toEqual([]);
});

test("search matches the name and the tags", () => {
  const packs = [pack()];
  expect(searchPacks(packs, "grum").length).toBe(1);
  expect(searchPacks(packs, "angry").length).toBe(1);
  expect(searchPacks(packs, "angry dog").length).toBe(0);
  expect(searchPacks(packs, "  ").length).toBe(0);
  expect(findItem(packs, "cats", "grumpy")?.item.name).toBe("Grumpy cat");
  expect(findItem(packs, "cats", "nope")).toBeNull();
});

function host() {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
    },
  };
}

test("plugin: the pack list round-trips and bad entries are dropped", () => {
  const h = host();
  expect(plugin.handleRoute({ path: "/stickers/packs", method: "GET" }, h).json).toEqual({ packs: [] });
  const bad = [
    {
      id: "cats",
      name: "  Cats <b>",
      kind: "emoji",
      items: [
        { id: "a", name: "A", url: "/v1/assets/x1" },
        { id: "a", name: "dup", url: "/v1/assets/x2" },
        { id: "b c", name: "bad id", url: "/v1/assets/x3" },
        { id: "evil", name: "e", url: "https://example.com/x.png" },
        { id: "js", name: "j", url: "javascript:alert(1)" },
      ],
    },
    { id: "cats", name: "duplicate pack", items: [] },
    { id: "no/slash", name: "bad pack id", items: [] },
    "junk",
  ];
  const put = plugin.handleRoute({ path: "/stickers/packs", method: "PUT", body: { packs: bad } }, h);
  expect(put.json.ok).toBe(true);
  expect(put.json.packs).toEqual([{ id: "cats", name: "Cats b", kind: "emoji", items: [{ id: "a", name: "A", url: "/v1/assets/x1" }] }]);
  expect(plugin.handleRoute({ path: "/stickers/packs", method: "GET" }, h).json.packs).toEqual(put.json.packs);
  expect(plugin.handleRoute({ path: "/stickers/packs", method: "PUT", body: {} }, h).status).toBe(400);
  expect(plugin.handleRoute({ path: "/stickers/packs", method: "POST" }, h).status).toBe(405);
  expect(plugin.handleRoute({ path: "/other", method: "GET" }, h)).toBeNull();
});

test("plugin: a pack holds at most 200 items and 40 packs", () => {
  const items = Array.from({ length: 250 }, (_, n) => ({ id: "i" + n, name: "i", url: "/v1/assets/x" }));
  const many = Array.from({ length: 60 }, (_, n) => ({ id: "p" + n, name: "p", kind: "sticker", items: n === 0 ? items : [] }));
  const out = plugin.cleanPacks(many);
  expect(out.length).toBe(40);
  expect(out[0].items.length).toBe(200);
});

test("messages keep a sticker field in both plugins, and only a well-formed one", () => {
  for (const m of [messenger, forum]) {
    expect(m.cleanImage({ state: "ready", url: "/v1/assets/a1", alt: "Grumpy cat", sticker: "cats/grumpy" })).toEqual({ state: "ready", url: "/v1/assets/a1", alt: "Grumpy cat", sticker: "cats/grumpy" });
    expect(m.cleanImage({ state: "ready", url: "/v1/assets/a1", sticker: "cats grumpy" })).toEqual({ state: "ready", url: "/v1/assets/a1" });
    expect(m.cleanImage({ state: "ready", url: "/v1/assets/a1", sticker: { x: 1 } })).toEqual({ state: "ready", url: "/v1/assets/a1" });
    expect(m.imageLine({ state: "ready", url: "/v1/assets/a1", alt: "Grumpy cat", sticker: "cats/grumpy" })).toBe("[a sticker: Grumpy cat]");
    expect(m.imageLine({ state: "ready", url: "/v1/assets/a1", alt: "A lake" })).toBe("[a picture: A lake]");
  }
});
