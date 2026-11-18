// The journal's calls (plugin `journal`, issue #444). In the design preview (`?screen=journal`) they answer from a fake and change nothing.
import { PREVIEW, call } from "@/lib/api";

export type PostImage = { state: "ready"; url: string; alt?: string } | { state: "pending" | "failed"; prompt: string };

export interface JournalPost {
  id: string;
  /** A profile id, or "you". */
  owner: string;
  by: string;
  hue: number;
  picture: string;
  at: number;
  title: string;
  text: string;
  image?: PostImage;
  mood?: string;
  place?: string;
  tags: string[];
  visible: "all" | "friends" | "me";
  fromStory: boolean;
  mine: boolean;
  /** How many comments there are (only in the feed). */
  comments?: number;
  /** Does the user follow this character's journal (only in the feed). */
  following?: boolean;
}

export interface JournalComment {
  id: string;
  by: string;
  name: string;
  hue: number;
  picture: string;
  at: number;
  text: string;
  mine: boolean;
  /** What the post's author remembers of the commenter. */
  view?: string;
}

export interface Feed {
  /** The switch "keep expired stories in the journal". */
  on: boolean;
  posts: JournalPost[];
  more: boolean;
}

export type Visible = "all" | "friends" | "me";

export interface PostInput {
  title: string;
  text: string;
  mood: string;
  tags: string;
  visible: Visible;
}

const HOUR = 3600000;
const MOCK: JournalPost[] = [
  { id: "m1", owner: "mavka", by: "Mavka", hue: 150, picture: "", at: Date.now() - 2 * HOUR, title: "", text: "Mended the net by the reeds. The lake was calm and nobody came by.", tags: [], visible: "all", fromStory: true, mine: false, comments: 2, following: true },
  { id: "m2", owner: "you", by: "", hue: 200, picture: "", at: Date.now() - 20 * HOUR, title: "A quiet Sunday", text: "Rain all morning, so I stayed in and sorted the old letters.", mood: "calm", tags: ["home", "letters"], visible: "all", fromStory: false, mine: true },
];

/** `who`: "" everyone, "you" the user's own, "follow" the journals the user follows. */
export async function loadFeed(who: string, before?: number): Promise<Feed> {
  if (PREVIEW) return { on: true, posts: who === "you" ? MOCK.filter((p) => p.mine) : who === "follow" ? MOCK.filter((p) => p.following) : MOCK, more: false };
  const q = new URLSearchParams();
  if (who === "follow") q.set("follow", "1");
  else if (who) q.set("owner", who);
  if (before) q.set("before", String(before));
  const s = q.toString();
  return call<Feed>("GET", "/journal/feed" + (s ? "?" + s : ""));
}

export async function writePost(input: PostInput): Promise<JournalPost> {
  if (PREVIEW) return { ...MOCK[1], id: "m" + Date.now(), at: Date.now(), title: input.title, text: input.text, mood: input.mood || undefined, tags: [] };
  return (await call<{ post: JournalPost }>("POST", "/journal/post", input)).post;
}

export async function editPost(id: string, input: PostInput): Promise<JournalPost> {
  if (PREVIEW) return { ...MOCK[1], id, title: input.title, text: input.text, mood: input.mood || undefined };
  return (await call<{ post: JournalPost }>("POST", "/journal/edit", { id, ...input })).post;
}

export async function removePost(post: JournalPost): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/journal/remove", { id: post.id, owner: post.owner });
}

const MOCK_COMMENTS: JournalComment[] = [
  { id: "c1", by: "lis", name: "Lis", hue: 30, picture: "", at: Date.now() - 80 * 60000, text: "Nice work with the net! Bring me one next time.", mine: false, view: "Quick and kind." },
  { id: "c2", by: "you", name: "Me", hue: 210, picture: "", at: Date.now() - 30 * 60000, text: "How long did it take?", mine: true },
];

export async function loadComments(owner: string, post: string): Promise<JournalComment[]> {
  if (PREVIEW) return MOCK_COMMENTS;
  return (await call<{ comments: JournalComment[] }>("GET", `/journal/comments?owner=${encodeURIComponent(owner)}&post=${encodeURIComponent(post)}`)).comments;
}

export async function addComment(owner: string, post: string, text: string): Promise<JournalComment> {
  if (PREVIEW) return { id: "c" + Date.now(), by: "you", name: "Me", hue: 210, picture: "", at: Date.now(), text, mine: true };
  return (await call<{ comment: JournalComment }>("POST", "/journal/comment", { owner, post, text })).comment;
}

export async function removeComment(post: string, id: string): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/journal/comment/remove", { post, id });
}

export async function setFollow(id: string, on: boolean): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/journal/follow", { id, on });
}

export interface Friend {
  id: string;
  name: string;
  hue: number;
  picture: string;
}

/** The characters who may read the user's friends-only posts: followed by the user and following the persona back. */
export async function loadFriends(): Promise<Friend[]> {
  if (PREVIEW) return [{ id: "lis", name: "Lis", hue: 30, picture: "" }];
  return (await call<{ friends: Friend[] }>("GET", "/journal/friends")).friends;
}
