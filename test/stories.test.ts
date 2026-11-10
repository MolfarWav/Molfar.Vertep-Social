// Stories (#358, idea 4): a short line (and a picture) from a character's diary of the day that vanishes after 24 hours.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const stories = await import(path.join(root, "plugins/stories/plugin.js"));

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const noon = Date.UTC(2026, 10, 10, 12, 0, 0);
const DAY = 86400000;
const profile = (id: string, extra: object = {}) => ({ name: id.toUpperCase(), hue: 120, about: "x", schedule: always, ...extra });

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

function world(settings: object = {}) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { stories: true, storiesPerDay: 1 }, ...settings }));
  files.set("profiles/mavka.json", JSON.stringify(profile("mavka")));
  files.set("life/diary/mavka.json", JSON.stringify({ entries: [{ id: "e1", at: noon - 3600000, day: "2026-11-10", text: "Mended the net by the reeds. The lake was calm and nobody came by.", kind: "routine", by: "model" }] }));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  const host: any = { fs: memFs(files), llm: { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) } };
  return { files, requests, host, setResults: (r: Record<string, unknown>) => (results = r) };
}
const run = <T,>(fn: () => T): T => {
  const n = Date.now;
  const r = Math.random;
  Date.now = () => noon;
  Math.random = () => 0;
  try {
    return fn();
  } finally {
    Date.now = n;
    Math.random = r;
  }
};
const saved = (w: ReturnType<typeof world>) => JSON.parse(w.files.get("stories/items.json")!);

test("captionFrom takes the first sentence of a diary line, or the line cut", () => {
  expect(stories.captionFrom("Mended the net by the reeds. The lake was calm.")).toBe("Mended the net by the reeds.");
  expect(stories.captionFrom("x".repeat(300)).length).toBe(140);
  expect(stories.captionFrom("Short")).toBe("Short");
});

test("no pictures: the tick posts the diary line itself as a text story, once a day, with no model call", () => {
  const w = world();
  run(() => stories.onTick({}, w.host));
  expect(w.requests).toHaveLength(0);
  const f = saved(w);
  expect(f.stories).toHaveLength(1);
  expect(f.stories[0]).toMatchObject({ by: "mavka", name: "MAVKA", text: "Mended the net by the reeds." });
  expect(f.stories[0].image).toBeUndefined();
  expect(f.counts).toEqual({ mavka: 1 });
  // the daily cap and the used entry: nothing more today
  run(() => stories.onTick({}, w.host));
  expect(saved(w).stories).toHaveLength(1);
});

test("off by default, and off when life is off, the character is away from the schedule, or has no diary line of today", () => {
  const off = world({ community: { stories: false } });
  run(() => stories.onTick({}, off.host));
  expect(off.files.has("stories/items.json")).toBe(false);
  const noLife = world({ life: { on: false } });
  run(() => stories.onTick({}, noLife.host));
  expect(noLife.files.has("stories/items.json")).toBe(false);
  const sleeping = world();
  sleeping.files.set("profiles/mavka.json", JSON.stringify(profile("mavka", { schedule: Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off")) })));
  run(() => stories.onTick({}, sleeping.host));
  expect(sleeping.files.has("stories/items.json")).toBe(false);
  const old = world();
  old.files.set("life/diary/mavka.json", JSON.stringify({ entries: [{ id: "e0", at: noon - 2 * DAY, day: "2026-11-08", text: "Old.", by: "model" }] }));
  run(() => stories.onTick({}, old.host));
  expect(old.files.has("stories/items.json")).toBe(false);
  const mine = world();
  mine.files.set("life/diary/mavka.json", JSON.stringify({ entries: [{ id: "e2", at: noon, day: "2026-11-10", text: "Written by the user.", kind: "you", by: "you" }] }));
  run(() => stories.onTick({}, mine.host));
  expect(mine.files.has("stories/items.json")).toBe(false);
});

test("with pictures on: one model request in the forum's model, the answer is filed with a pending picture", () => {
  const w = world({ images: { on: true, perDay: 2 }, models: { forum: "prov/forum-model", image: "prov/img" } });
  run(() => stories.onTick({}, w.host));
  expect(w.requests).toHaveLength(1);
  expect(w.requests[0].key).toBe("st:mavka:e1");
  expect(w.requests[0].req.model).toBe("prov/forum-model");
  expect(w.requests[0].req.messages[0].content).toContain("Mended the net");
  expect(saved(w).pending.mavka).toBe(noon);
  // while a request is out nothing else is asked
  run(() => stories.onTick({}, w.host));
  expect(w.requests).toHaveLength(1);
  w.setResults({ "st:mavka:e1": { text: '{"caption": "The lake is calm today", "image": "A calm lake with reeds at dawn"}' } });
  run(() => stories.onTick({}, w.host));
  const f = saved(w);
  expect(f.stories[0]).toMatchObject({ text: "The lake is calm today", image: { state: "pending", prompt: "A calm lake with reeds at dawn", gen: true } });
  expect(f.pending).toEqual({});
  // the page asks which pictures wait, draws, and files the result
  const images = stories.handleRoute({ path: "/stories/images", method: "GET" }, w.host).json.items;
  expect(images).toEqual([{ id: f.stories[0].id, prompt: "A calm lake with reeds at dawn", model: "prov/img" }]);
  expect(stories.handleRoute({ path: "/stories/image", method: "POST", body: { id: f.stories[0].id, url: "/v1/assets/abc123" } }, w.host).json.state).toBe("ready");
  expect(saved(w).stories[0].image).toMatchObject({ state: "ready", url: "/v1/assets/abc123" });
  expect(stories.handleRoute({ path: "/stories/images", method: "GET" }, w.host).json.items).toEqual([]);
});

test("a failed model call waits; a bad picture url is a failed picture", () => {
  const w = world({ images: { on: true, perDay: 2 } });
  run(() => stories.onTick({}, w.host));
  w.setResults({ "st:mavka:e1": { error: "boom" } });
  run(() => stories.onTick({}, w.host));
  expect(saved(w).failedAt.mavka).toBe(noon);
  expect(saved(w).stories).toHaveLength(0);
  w.setResults({});
  run(() => stories.onTick({}, w.host));
  expect(w.requests).toHaveLength(1); // not asked again at once
  const ok = world();
  run(() => stories.onTick({}, ok.host));
  expect(saved(ok).stories).toHaveLength(1);
  const id = saved(ok).stories[0].id;
  ok.files.set("stories/items.json", JSON.stringify({ ...saved(ok), stories: [{ ...saved(ok).stories[0], image: { state: "pending", prompt: "p", gen: true } }] }));
  expect(stories.handleRoute({ path: "/stories/image", method: "POST", body: { id, url: "https://evil.example/x.png" } }, ok.host).json.state).toBe("failed");
});

test("a story lives 24 hours; the user marks it seen and can remove it", () => {
  const w = world();
  run(() => stories.onTick({}, w.host));
  const id = saved(w).stories[0].id;
  const list = () => stories.handleRoute({ path: "/stories", method: "GET" }, w.host).json;
  expect(list().stories[0]).toMatchObject({ id, seen: false, by: "mavka", until: noon + DAY });
  expect(stories.handleRoute({ path: "/stories/seen", method: "POST", body: { id } }, w.host).json.ok).toBe(true);
  expect(list().stories[0].seen).toBe(true);
  expect(stories.handleRoute({ path: "/stories/seen", method: "POST", body: { id: "nope" } }, w.host).status).toBe(404);
  // after a day it is gone from the list, and the tick sweeps the file
  const later = noon + DAY + 1000;
  const n = Date.now;
  Date.now = () => later;
  try {
    expect(list().stories).toEqual([]);
    stories.onTick({}, w.host);
    expect(saved(w).stories).toEqual([]);
  } finally {
    Date.now = n;
  }
  const again = world();
  run(() => stories.onTick({}, again.host));
  const id2 = saved(again).stories[0].id;
  expect(stories.handleRoute({ path: "/stories/remove", method: "POST", body: { id: id2 } }, again.host).json.ok).toBe(true);
  expect(saved(again).stories).toEqual([]);
});

test("the manifest asks only for what the plugin uses", () => {
  const m = JSON.parse(require("node:fs").readFileSync(path.join(root, "plugins/stories/manifest.json"), "utf8"));
  expect(m.permissions).toEqual(["routes", "fs", "llm", "schedule"]);
  expect(m.networkHosts).toBeUndefined();
});
