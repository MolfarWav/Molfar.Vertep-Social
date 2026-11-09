// Whether an image file is animated: a GIF with more than one frame is not checked here (GIFs are always left alone), an animated
// WebP and an APNG are. The browser re-encodes a picture it scales down through a canvas, which keeps one frame only, so an
// animated file must go to the engine as it is (issue #329: animated stickers and custom emoji).

/** The first bytes of a file are enough: the WebP animation flag and the PNG `acTL` chunk both come before the pixel data. */
export const ANIMATION_PROBE_BYTES = 64 * 1024;

const ascii = (b: Uint8Array, at: number, text: string): boolean => {
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

/** True for a WebP whose VP8X header has the animation flag, or a PNG that has an `acTL` chunk (APNG). */
export function isAnimatedImage(b: Uint8Array): boolean {
  // WebP: "RIFF" size "WEBP", then the first chunk; an extended file starts with "VP8X" whose flags byte has the animation bit (0x02)
  if (b.length >= 21 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return ascii(b, 12, "VP8X") && (b[20]! & 0x02) !== 0;
  // PNG: signature, then chunks (length, type, data, crc); `acTL` comes before the first `IDAT`
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, "PNG")) {
    let at = 8;
    while (at + 8 <= b.length) {
      const len = ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
      if (ascii(b, at + 4, "acTL")) return true;
      if (ascii(b, at + 4, "IDAT")) return false;
      at += 12 + len;
    }
  }
  return false;
}
