import { expect, test } from "bun:test";
import { announcements, type Unread } from "../src/lib/shell-notify";

const none: Unread = { messenger: [], forum: 0, forumLatest: null };
const c = (id: string, name = id, line = "hi") => ({ id, name, line });

test("the first look announces nothing: what was already waiting is not news", () => {
  expect(announcements(null, { messenger: [c("a")], forum: 2, forumLatest: { title: "T", who: "W", at: 5 } }, "Forum")).toEqual([]);
});

test("a contact who becomes unread is announced with their name and last line; one that stays unread is not", () => {
  const prev: Unread = { ...none, messenger: [c("a", "Мавка", "old")] };
  const now: Unread = { ...none, messenger: [c("a", "Мавка", "old"), c("b", "Ярина", "Привіт!")] };
  expect(announcements(prev, now, "Forum")).toEqual([{ title: "Ярина", text: "Привіт!" }]);
  expect(announcements(now, now, "Forum")).toEqual([]);
});

test("a newer unread forum post is announced with who wrote it; the user's own post has no name", () => {
  const prev: Unread = { ...none, forum: 1, forumLatest: { title: "Old", who: "A", at: 5 } };
  expect(announcements(prev, { ...none, forum: 2, forumLatest: { title: "Fence", who: "Мавка", at: 9 } }, "Forum")).toEqual([{ title: "Forum", text: "Мавка: Fence" }]);
  expect(announcements(prev, { ...none, forum: 1, forumLatest: { title: "Old", who: "A", at: 5 } }, "Forum")).toEqual([]);
  expect(announcements(none, { ...none, forum: 1, forumLatest: { title: "Mine", who: "", at: 9 } }, "Forum")).toEqual([{ title: "Forum", text: "Mine" }]);
  // everything read: nothing to announce
  expect(announcements(prev, { ...none, forum: 0, forumLatest: null }, "Forum")).toEqual([]);
});
