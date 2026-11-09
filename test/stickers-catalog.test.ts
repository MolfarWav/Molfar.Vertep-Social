import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const plugin = await import(path.resolve(import.meta.dir, "../plugins/stickers/plugin.js"));
const dir = path.resolve(import.meta.dir, "../catalog");
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));

const kindOf = (b: Buffer) => (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "png" : b.subarray(0, 3).toString() === "GIF" ? "gif" : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "webp" : "");

test("the catalog index is whole: the plugin keeps every pack and every item, with a licence and an author", () => {
  const kept = plugin.cleanCatalog(index);
  expect(kept.map((p: any) => p.id)).toEqual(index.packs.map((p: any) => p.id));
  for (const [n, p] of index.packs.entries()) {
    expect(kept[n].items.length).toBe(p.items.length);
    expect(Object.keys(plugin.LICENSES)).toContain(p.license);
    expect(p.author.length).toBeGreaterThan(0);
    expect(p.source).toMatch(/^https:\/\//);
  }
});

test("every catalog file exists, is what its extension says and fits the limits; every pack has a preview and its licence text", () => {
  for (const p of index.packs) {
    const preview = fs.readFileSync(path.join(dir, p.id, "preview.png"));
    expect(kindOf(preview)).toBe("png");
    expect(preview.length).toBeLessThan(300000);
    expect(fs.existsSync(path.join(dir, p.id, "LICENSE")) || fs.existsSync(path.join(dir, p.id, "LICENSE.md"))).toBe(true);
    for (const it of p.items) {
      const bytes = fs.readFileSync(path.join(dir, p.id, it.file));
      expect(kindOf(bytes)).toBe(it.file.split(".").pop());
      expect(bytes.length).toBeLessThan(512 * 1024);
      if (kindOf(bytes) === "png") {
        expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(512);
        expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(512);
      }
    }
    // no stray files: the folder holds the items, the preview and the licence only
    const names = new Set([...p.items.map((i: any) => i.file), "preview.png", "LICENSE", "LICENSE.md"]);
    for (const f of fs.readdirSync(path.join(dir, p.id))) expect(names.has(f)).toBe(true);
  }
});

test("cleanCatalog drops what is not safe: no licence, an unknown licence, a path in a file name, a bad id", () => {
  const good = { id: "a", name: "A", author: "Me", license: "MIT", items: [{ id: "x", name: "X", file: "x.png" }] };
  const kept = (p: object) => plugin.cleanCatalog({ packs: [p] });
  expect(kept(good).length).toBe(1);
  expect(kept(good)[0].licenseLabel).toBe("MIT");
  expect(kept({ ...good, license: "CC-BY-NC-4.0" })).toEqual([]);
  expect(kept({ ...good, license: undefined })).toEqual([]);
  expect(kept({ ...good, author: "" })).toEqual([]);
  expect(kept({ ...good, id: "../x" })).toEqual([]);
  expect(kept({ ...good, items: [{ id: "x", file: "../../x.png" }, { id: "y", file: "y.svg" }, { id: "z", file: "z/z.png" }] })).toEqual([]);
  expect(kept({ ...good, source: "javascript:alert(1)" })[0].source).toBeUndefined();
  expect(plugin.cleanCatalog(null)).toEqual([]);
});

test("pictureMime reads the first bytes, not the name", () => {
  const b64 = (b: Buffer) => b.toString("base64");
  expect(plugin.pictureMime(b64(fs.readFileSync(path.join(dir, "fluent-3d", "fire.png"))))).toBe("image/png");
  expect(plugin.pictureMime(b64(fs.readFileSync(path.join(dir, "noto-animated", "fire.webp"))))).toBe("image/webp");
  expect(plugin.pictureMime(b64(Buffer.from("GIF89a....")))).toBe("image/gif");
  expect(plugin.pictureMime(b64(Buffer.from("<svg xmlns=...>")))).toBe("");
  expect(plugin.pictureMime("")).toBe("");
});

// the routes: a request in the first pass, the answer in the second (the engine's two-phase exchange)
const run = (route: string, query: Record<string, string>, results: Record<string, unknown>) => {
  const asked: { key: string; spec: any }[] = [];
  const host = { net: { request: (key: string, spec: any) => void asked.push({ key, spec }), results }, fs: { read: () => "", write() {} } };
  const first: any = plugin.handleRoute({ method: "GET", path: route, query }, host);
  if (first && first.__llmPending) {
    const second = plugin.handleRoute({ method: "GET", path: route, query, stash: first.stash }, host);
    return { asked, first, answer: second };
  }
  return { asked, first, answer: first };
};

test("GET /stickers/catalog asks GitHub for index.json under the repo catalog folder and cleans the answer", () => {
  const r = run("/stickers/catalog", {}, { index: { ok: true, status: 200, text: JSON.stringify(index) } });
  expect(r.asked[0].spec.url).toBe("https://raw.githubusercontent.com/MolfarWav/Molfar.Vertep-Social/main/catalog/index.json");
  expect(r.answer.json.ok).toBe(true);
  expect(r.answer.json.packs.length).toBe(index.packs.length);
  const bad = run("/stickers/catalog", {}, { index: { ok: true, status: 200, text: "<html>" } });
  expect(bad.answer.json.ok).toBe(false);
  const down = run("/stickers/catalog", {}, { index: { ok: false, error: "host not in the networkHosts allowlist: example.com" } });
  expect(down.answer.json.ok).toBe(false);
});

test("a catalog file is fetched by checked parts only, and must be a real picture within the size limit", () => {
  const png = fs.readFileSync(path.join(dir, "fluent-3d", "fire.png")).toString("base64");
  const ok = run("/stickers/catalog/file", { pack: "fluent-3d", file: "fire.png" }, { file: { ok: true, status: 200, base64: png } });
  expect(ok.asked[0].spec.url).toBe("https://raw.githubusercontent.com/MolfarWav/Molfar.Vertep-Social/main/catalog/fluent-3d/fire.png");
  expect(ok.asked[0].spec.binary).toBe(true);
  expect(ok.answer.json).toMatchObject({ ok: true, mime: "image/png", base64: png });
  expect(run("/stickers/catalog/file", { pack: "fluent-3d", file: "fire.png" }, { file: { ok: true, base64: Buffer.from("<svg/>").toString("base64") } }).answer.json.ok).toBe(false);
  const huge = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(600 * 1024)]).toString("base64");
  expect(run("/stickers/catalog/file", { pack: "x", file: "x.gif" }, { file: { ok: true, base64: huge } }).answer.json).toMatchObject({ ok: false, error: "too big" });
  for (const q of [{ pack: "../x", file: "a.png" }, { pack: "x", file: "../a.png" }, { pack: "x", file: "a.svg" }, { pack: "x" }]) {
    const r = run("/stickers/catalog/file", q, {});
    expect(r.asked.length).toBe(0);
    expect(r.answer.status).toBe(404);
  }
  const prev = run("/stickers/catalog/preview", { pack: "fluent-3d" }, { preview: { ok: true, base64: png } });
  expect(prev.answer.json.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  expect((plugin.handleRoute({ method: "POST", path: "/stickers/catalog" }, {}) as any).status).toBe(405);
});

test("the manifest allows the network for raw.githubusercontent.com only", () => {
  const m = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, "../plugins/stickers/manifest.json"), "utf8"));
  expect(m.permissions).toContain("network");
  expect(m.networkHosts).toEqual(["raw.githubusercontent.com"]);
});

test("a pack saved with a credit keeps it, strings only", () => {
  const packs = plugin.cleanPacks([{ id: "p", name: "P", kind: "sticker", credit: { author: "Google", license: "CC BY 4.0", source: "https://example.com/x", extra: 1 }, items: [{ id: "a", name: "A", url: "/v1/assets/abc" }] }]);
  expect(packs[0].credit).toEqual({ author: "Google", license: "CC BY 4.0", source: "https://example.com/x" });
  expect(plugin.cleanPacks([{ id: "p", credit: { author: "x" }, items: [{ id: "a", url: "/v1/assets/abc" }] }])[0].credit).toBeUndefined();
});
