import { expect, test } from "bun:test";
import { isAnimatedImage } from "../src/lib/animated-image";

const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

// a WebP header: "RIFF" size "WEBP" then a VP8X chunk (flags byte, 3 reserved bytes, canvas size)
const webp = (flags: number, chunk = "VP8X") => new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP"), ...text(chunk), 10, 0, 0, 0, flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = (...chunks: [string, number][]) => {
  const out = [0x89, ...text("PNG"), 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [type, len] of chunks) out.push(...u32(len), ...text(type), ...new Array(len).fill(0), 0, 0, 0, 0);
  return new Uint8Array(out);
};

test("an animated WebP has the animation flag in its VP8X header", () => {
  expect(isAnimatedImage(webp(0x12))).toBe(true); // animation + alpha
  expect(isAnimatedImage(webp(0x10))).toBe(false); // alpha only
  expect(isAnimatedImage(webp(0x02, "VP8 "))).toBe(false); // a simple lossy file has no VP8X
});

test("an APNG has an acTL chunk before the pixel data", () => {
  expect(isAnimatedImage(png(["IHDR", 13], ["acTL", 8], ["IDAT", 4]))).toBe(true);
  expect(isAnimatedImage(png(["IHDR", 13], ["IDAT", 4], ["IEND", 0]))).toBe(false);
  expect(isAnimatedImage(png(["IHDR", 13], ["iCCP", 300], ["acTL", 8], ["IDAT", 4]))).toBe(true);
});

test("anything else, and short or empty data, is not animated", () => {
  expect(isAnimatedImage(new Uint8Array([]))).toBe(false);
  expect(isAnimatedImage(new Uint8Array(text("GIF89a......")))).toBe(false);
  expect(isAnimatedImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(false);
  expect(isAnimatedImage(webp(0x12).slice(0, 18))).toBe(false);
});
