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
}

export interface Feed {
  /** The switch "keep expired stories in the journal". */
  on: boolean;
  posts: JournalPost[];
  more: boolean;
}

export interface PostInput {
  title: string;
  text: string;
  mood: string;
  tags: string;
}

const HOUR = 3600000;
const MOCK: JournalPost[] = [
  { id: "m1", owner: "mavka", by: "Mavka", hue: 150, picture: "", at: Date.now() - 2 * HOUR, title: "", text: "Mended the net by the reeds. The lake was calm and nobody came by.", tags: [], visible: "all", fromStory: true, mine: false },
  { id: "m2", owner: "you", by: "", hue: 200, picture: "", at: Date.now() - 20 * HOUR, title: "A quiet Sunday", text: "Rain all morning, so I stayed in and sorted the old letters.", mood: "calm", tags: ["home", "letters"], visible: "all", fromStory: false, mine: true },
];

export async function loadFeed(owner: string, before?: number): Promise<Feed> {
  if (PREVIEW) return { on: true, posts: owner === "you" ? MOCK.filter((p) => p.mine) : MOCK, more: false };
  const q = new URLSearchParams();
  if (owner) q.set("owner", owner);
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
