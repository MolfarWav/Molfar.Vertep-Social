// Putting an emoji into a text box: at the caret, or over the selected text.
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;

/**
 * The text after inserting `text` over [start, end), and where the caret goes (right after the new text).
 * Positions are UTF-16 offsets, as a text box reports them. They are clamped to the text, swapped when reversed,
 * and moved off the middle of a surrogate pair so a pair is never torn.
 */
export function insertAt(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  const len = value.length;
  let a = Math.min(Math.max(Number.isFinite(start) ? start : len, 0), len);
  let b = Math.min(Math.max(Number.isFinite(end) ? end : a, 0), len);
  if (a > b) [a, b] = [b, a];
  const collapsed = a === b;
  if (a > 0 && a < len && isLow(value.charCodeAt(a)) && isHigh(value.charCodeAt(a - 1))) a -= 1;
  // a caret in the middle of a pair goes in front of it; a selection that ends in the middle takes the whole pair
  if (collapsed) b = a;
  else if (b > 0 && b < len && isLow(value.charCodeAt(b)) && isHigh(value.charCodeAt(b - 1))) b += 1;
  return { value: value.slice(0, a) + text + value.slice(b), caret: a + text.length };
}
