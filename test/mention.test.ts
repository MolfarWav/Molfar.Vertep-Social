import { expect, test } from "bun:test";
import { applyMention, mentionAt, mentionChoices } from "../src/screens/forum/mention-logic";

test("mentionAt finds the @word the caret is in, and nothing in an address or past a space", () => {
  expect(mentionAt("hi @Ya", 6)).toEqual({ from: 3, query: "Ya" });
  expect(mentionAt("@", 1)).toEqual({ from: 0, query: "" });
  expect(mentionAt("write to a@b.com", 16)).toBeNull();
  expect(mentionAt("hi @Ярина", 9)).toEqual({ from: 3, query: "Ярина" });
  expect(mentionAt("hi @Maya Y", 10)).toEqual({ from: 3, query: "Maya Y" });
  expect(mentionAt("hi @Ya and more", 15)).toBeNull();
  expect(mentionAt("hi @Ya  x", 9)).toBeNull();
  expect(mentionAt("hello", 5)).toBeNull();
});

test("mentionChoices: topic names first, prefix of any word, no repeats, at most six", () => {
  expect(mentionChoices("ya", ["Yaryna", "Bram"], ["Yaroslav", "yaryna", "Maya Yan"])).toEqual(["Yaryna", "Yaroslav", "Maya Yan"]);
  expect(mentionChoices("", ["A", "B"], ["C", "D", "E", "F", "G", "H"])).toHaveLength(6);
  expect(mentionChoices("zz", ["A"], ["B"])).toEqual([]);
});

test("applyMention puts the name in and the caret after it", () => {
  const at = mentionAt("hi @Ya there", 6)!;
  expect(applyMention("hi @Ya there", at, "Yaryna")).toEqual({ text: "hi @Yaryna there", caret: 11 });
});
