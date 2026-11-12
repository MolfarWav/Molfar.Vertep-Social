// "@" in a reply box (issue #393): the word being typed after an "@", and the text with the chosen name put in.

// an "@" that starts the text or follows a space, a line break or "(" (an address like "a@b" is not one), then a name:
// letters, digits and a few marks, with one space allowed inside for a two-word name
const AT_WORD = /(^|[\s(])@([\p{L}\p{N}_.'’-]{0,40}(?: [\p{L}\p{N}_.'’-]{0,40})?)$/u;

/** The "@word" the caret is in, or null. `from` is the index of the "@", `query` what follows it up to the caret. */
export function mentionAt(text: string, caret: number): { from: number; query: string } | null {
  const upto = text.slice(0, caret);
  const m = AT_WORD.exec(upto);
  if (!m) return null;
  const query = m[2];
  return { from: upto.length - query.length - 1, query };
}

/** Names that start with the query (or whose later word does), the ones from the topic first; at most 6. */
export function mentionChoices(query: string, near: string[], all: string[]): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...near, ...all]) {
    const n = name.trim();
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    if (!q || key.startsWith(q) || key.split(/\s+/).some((w) => w.startsWith(q))) out.push(n);
  }
  return out.slice(0, 6);
}

/** The text with the "@word" replaced by "@Name " (no second space when one follows) and where the caret goes. */
export function applyMention(text: string, at: { from: number; query: string }, name: string): { text: string; caret: number } {
  const end = at.from + 1 + at.query.length;
  const rest = text.slice(end);
  const spaced = /^\s/.test(rest);
  const insert = "@" + name + (spaced ? "" : " ");
  return { text: text.slice(0, at.from) + insert + rest, caret: at.from + insert.length + (spaced ? 1 : 0) };
}
