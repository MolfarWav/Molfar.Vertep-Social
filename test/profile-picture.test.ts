import { expect, test } from "bun:test";
import path from "node:path";
import { portraitPrompt } from "../src/screens/profiles/picture";
import { imageModelsFrom, imageOptions } from "../src/screens/profiles/picture-api";

const profiles = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));
const messenger = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));
const forum = await import(path.resolve(import.meta.dir, "../plugins/forum/plugin.js"));

test("the portrait prompt carries the name, a trimmed About and the interests, and stays one paragraph", () => {
  const p = portraitPrompt({ name: " Мавка ", about: "Мешканка озера.\n\nТиха   і уважна.", interests: ["очерет", " ", "пісні"] });
  expect(p).toContain("A portrait of Мавка.");
  expect(p).toContain("Мешканка озера. Тиха і уважна.");
  expect(p).toContain("Interests: очерет, пісні.");
  expect(p).toContain("no text, no watermark");
  expect(p).not.toContain("\n");
  const long = portraitPrompt({ name: "A", about: "word ".repeat(400), interests: [] });
  expect(long.length).toBeLessThanOrEqual(1200);
  expect(long).toContain("…");
  expect(portraitPrompt({ name: "", about: "", interests: [] })).toContain("A portrait of a character.");
});

test("the engine's image models: favourites first, in their order, with the user's own names", () => {
  const models = imageModelsFrom({
    models: [
      { provider: "nano", id: "a", label: "A", connectionName: "NanoGPT" },
      { provider: "nano", id: "b", label: "B", connectionName: "NanoGPT" },
      { provider: "or", id: "c", label: "C" },
      { id: "broken" },
    ],
    favorites: [{ ref: "or/c", name: "My C" }, { ref: "gone/x" }, { ref: "or/c" }],
  });
  expect(models.map((m) => [m.ref, m.label])).toEqual([["or/c", "My C"], ["nano/a", "A"], ["nano/b", "B"]]);
  const opts = imageOptions(models, "old/removed", "Engine default");
  expect(opts[0]).toEqual({ value: "", label: "Engine default" });
  expect(opts.at(-1)).toEqual({ value: "old/removed", label: "old/removed" });
  expect(imageModelsFrom({})).toEqual([]);
});

function host(files: Record<string, unknown>) {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    fs: {
      read: (p: string) => {
        if (!map.has(p)) throw new Error("ENOENT");
        return map.get(p)!;
      },
      write: (p: string, c: string) => void map.set(p, c),
      remove: (p: string) => void map.delete(p),
      list: (d: string) => {
        const out = [...map.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1));
        if (!out.length) throw new Error("ENOENT");
        return out.sort();
      },
    },
    llm: { results: {}, request: () => undefined },
  };
}

test("a profile keeps a picture only if it is an engine asset URL", () => {
  const h = host({});
  const put = (picture: unknown) => profiles.handleRoute({ method: "PUT", path: "/profiles/a", body: { name: "A", picture } }, h).json.profile.picture;
  const id = "a".repeat(64);
  expect(put(`/v1/assets/${id}`)).toBe(`/v1/assets/${id}`);
  expect(put("https://example.com/x.png")).toBe("");
  expect(put("//example.com/x.png")).toBe("");
  expect(put("/v1/assets/../../etc")).toBe("");
  expect(put("/v1/assets/a b")).toBe("");
  expect(put("javascript:alert(1)")).toBe("");
  expect(put(5)).toBe("");
  expect(put(undefined)).toBe("");
});

test("the messenger contact list and the forum authors carry the picture", () => {
  const url = "/v1/assets/" + "b".repeat(64);
  const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
  const files = { "profiles/mavka.json": { id: "mavka", name: "Мавка", hue: 150, source: "own", picture: url, schedule: always }, "profiles/yaryna.json": { id: "yaryna", name: "Ярина", hue: 20, source: "own", picture: "https://evil.example/x.png", schedule: always } };
  const contacts = messenger.handleRoute({ method: "GET", path: "/messenger/contacts" }, host(files)).json.contacts;
  expect(contacts.find((c: any) => c.id === "mavka").picture).toBe(url);
  expect(contacts.find((c: any) => c.id === "yaryna").picture).toBe("");
  const h = host({
    ...files,
    "forum/boards.json": { categories: [{ id: "c1", name: "G", boards: [{ id: "b1", name: "Guest", desc: "" }] }] },
    "forum/topics/t1.json": { id: "t1", board: "b1", title: "T", by: "mavka", name: "Мавка", hue: 150, createdAt: 1, lastAt: 1, locked: false, unread: false, owe: 0, posts: [{ id: "p1", by: "mavka", name: "Мавка", hue: 150, at: 1, text: "Hi" }] },
  });
  const t = forum.handleRoute({ method: "GET", path: "/forum/topic", query: { id: "t1" } }, h).json;
  expect(t.authors.mavka.picture).toBe(url);
});
