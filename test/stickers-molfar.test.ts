import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { MAX_FILE_BYTES, type StickerPack } from "../src/stickers/model";
import { fileFromDataUrl, fileKey, missingMolfar, MOLFAR_ITEMS, MOLFAR_PACKS, molfarPack } from "../src/stickers/molfar-pack";
import { ANIMATION_PROBE_BYTES, isAnimatedImage } from "../src/lib/animated-image";

const dir = path.resolve(import.meta.dir, "../src/stickers/molfar");

test("the table and the bundled files agree: every item has a sticker and an emoji file, animated, under the limit", () => {
  const names = fs.readdirSync(dir).sort();
  expect(names.length).toBe(MOLFAR_ITEMS.length * MOLFAR_PACKS.length);
  for (const spec of MOLFAR_PACKS) {
    for (const item of MOLFAR_ITEMS) {
      const file = path.join(dir, path.basename(fileKey(item.id, spec)));
      const bytes = fs.readFileSync(file);
      expect(bytes.length).toBeLessThan(MAX_FILE_BYTES);
      expect(isAnimatedImage(bytes.subarray(0, ANIMATION_PROBE_BYTES))).toBe(true);
    }
  }
});

test("pack and item ids fit the token and the pack builder keeps the table's order", () => {
  for (const spec of MOLFAR_PACKS) expect(spec.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
  for (const i of MOLFAR_ITEMS) expect(i.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
  const urls = Object.fromEntries(MOLFAR_ITEMS.map((i) => [i.id, `/v1/assets/${i.id}`]));
  const p = molfarPack(MOLFAR_PACKS[1]!, urls);
  expect(p.id).toBe("molfar-emoji");
  expect(p.kind).toBe("emoji");
  expect(p.items.map((i) => i.id)).toEqual(MOLFAR_ITEMS.map((i) => i.id));
  // a missing picture is left out, not a broken item
  expect(molfarPack(MOLFAR_PACKS[0]!, { happy: "/v1/assets/h" }).items.length).toBe(1);
});

test("missingMolfar: both, one, none", () => {
  const mine = (id: string): StickerPack => ({ id, name: id, kind: "sticker", items: [] });
  expect(missingMolfar([]).map((s) => s.id)).toEqual(["molfar", "molfar-emoji"]);
  expect(missingMolfar([mine("molfar")]).map((s) => s.id)).toEqual(["molfar-emoji"]);
  expect(missingMolfar([mine("molfar"), mine("molfar-emoji"), mine("cats")])).toEqual([]);
});

test("a bundled data URL becomes a File with the same bytes", async () => {
  const bytes = fs.readFileSync(path.join(dir, "happy-emoji.webp"));
  const f = fileFromDataUrl(`data:image/webp;base64,${bytes.toString("base64")}`, "happy-emoji.webp");
  expect(f?.type).toBe("image/webp");
  expect(Buffer.from(await f!.arrayBuffer()).equals(bytes)).toBe(true);
  expect(fileFromDataUrl("https://example.com/x.webp", "x")).toBeNull();
});
