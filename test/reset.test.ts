import { expect, test } from "bun:test";
import path from "node:path";
import { effectiveParts, RESET_PARTS } from "../src/screens/settings/reset-api";

// "Start over" (issue #366): the parts the profiles plugin can clear, and what each one leaves alone.
const profiles = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

function makeHost(initial: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(initial));
  // like the engine: removing a path removes a folder with everything in it
  const gone = (p: string) => [...files.keys()].filter((k) => k === p || k.startsWith(p + "/"));
  const host: any = {
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => {
        for (const k of gone(p)) files.delete(k);
      },
      list: (d: string) => {
        const out = [...new Set([...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1).split("/")[0]!))];
        if (!out.length) throw new Error("ENOENT");
        return out.sort();
      },
    },
  };
  return { host, files };
}

const world = () => ({
  "forum/topics/t1.json": "{}",
  "forum/topics/t2.json": "{}",
  "forum/boards.json": "{}",
  "forum/events.json": "{}",
  "forum/life-used.json": "{}",
  "forum/gossip.json": "{}",
  "forum/log.json": "{}",
  "chats/rp-a.json": "{}",
  "chats/rp-b.json": "{}",
  "chatter/a--b.json": "{}",
  "firstlog.json": "{}",
  "life/diary/rp-a.json": "{}",
  "life/people/rp-a.json": "{}",
  "life/people-meta.json": "{}",
  "life/place.json": "{}",
  "stories/items.json": "{}",
  "you.json": JSON.stringify({ active: "p1", personas: [{ id: "p1", name: "Ann", hue: 10, about: "" }] }),
  "profiles/rp-a.json": JSON.stringify({ id: "rp-a", name: "Alla" }),
  "profiles/rp-b.json": JSON.stringify({ id: "rp-b", name: "Bohdan" }),
  "settings.json": "{}",
  "stickers/packs.json": '{"packs":[]}',
  ".cache/life/world.json": "{}",
});

const left = (files: Map<string, string>) => [...files.keys()].sort();
const POST = (host: any, parts: unknown) => profiles.handleRoute({ method: "POST", path: "/settings/reset", body: { parts } }, host);

test("counts say what each part holds", () => {
  const { host } = makeHost(world());
  const r = profiles.handleRoute({ method: "GET", path: "/settings/reset" }, host);
  expect(r.json.counts).toEqual({ forum: 2, chats: 2, diaries: 1, personas: 1, profiles: 2, settings: null });
});

test("clearing the forum leaves everything else, with no boards", () => {
  const { host, files } = makeHost(world());
  const r = POST(host, ["forum"]);
  expect(r.json).toEqual({ ok: true, cleared: ["forum"] });
  expect(left(files).filter((k) => k.startsWith("forum/"))).toEqual([]);
  expect(files.has("chats/rp-a.json")).toBe(true);
  expect(files.has("profiles/rp-a.json")).toBe(true);
  expect(files.has("settings.json")).toBe(true);
});

test("chats take the characters' talks and the first-message log, not the diaries", () => {
  const { host, files } = makeHost(world());
  POST(host, ["chats"]);
  expect(files.has("chats/rp-a.json") || files.has("chatter/a--b.json") || files.has("firstlog.json")).toBe(false);
  expect(files.has("life/diary/rp-a.json")).toBe(true);
});

test("diaries take people and stories, not the weather place", () => {
  const { host, files } = makeHost(world());
  POST(host, ["diaries"]);
  expect(files.has("life/diary/rp-a.json") || files.has("life/people/rp-a.json") || files.has("life/people-meta.json") || files.has("stories/items.json")).toBe(false);
  expect(files.has("life/place.json")).toBe(true);
});

test("clearing the characters takes their chats and diaries too", () => {
  const { host, files } = makeHost(world());
  const r = POST(host, ["profiles"]);
  expect(r.json.cleared).toEqual(["chats", "diaries", "profiles"]);
  expect(left(files).filter((k) => /^(profiles|chats|chatter|life\/diary|life\/people|stories)/.test(k))).toEqual([]);
  expect(files.has("forum/topics/t1.json")).toBe(true);
  expect(files.has("you.json")).toBe(true);
});

test("personas and settings go on their own; stickers and the news feed never", () => {
  const { host, files } = makeHost(world());
  POST(host, ["personas", "settings"]);
  expect(files.has("you.json") || files.has("settings.json") || files.has("life/place.json")).toBe(false);
  expect(files.has("profiles/rp-a.json")).toBe(true);
  const all = makeHost(world());
  POST(all.host, [...RESET_PARTS]);
  expect(left(all.files)).toEqual([".cache/life/world.json", "stickers/packs.json"]);
});

test("nothing chosen or unknown parts clear nothing", () => {
  const { host, files } = makeHost(world());
  const before = left(files);
  expect(POST(host, []).status).toBe(400);
  expect(POST(host, ["everything", "../x", "constructor"]).status).toBe(400);
  expect(profiles.handleRoute({ method: "POST", path: "/settings/reset", body: null }, host).status).toBe(400);
  expect(left(files)).toEqual(before);
});

test("the screen and the plugin agree on what goes with the profiles", () => {
  expect(profiles.resetParts(["profiles"])).toEqual(effectiveParts(new Set(["profiles"] as const)));
  expect(profiles.resetParts(["settings", "forum"])).toEqual(effectiveParts(new Set(["settings", "forum"] as const)));
  expect(Object.keys(profiles.RESET_PARTS)).toEqual(RESET_PARTS);
});
