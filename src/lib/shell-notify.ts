// Social tells the shell what waits for the user (issue MolfarWav/Molfar.Vertep#310, step 5): the number on its tab, and a
// short message when something new arrives. The shell decides whether and how it is shown (the user's switch for this app,
// a popup or a system notification); an engine without the channel just has no `notify`, and nothing happens.

export interface Unread {
  messenger: { id: string; name: string; line: string }[];
  forum: number;
  forumLatest: { title: string; who: string; at: number } | null;
}

export interface Announcement {
  title: string;
  text: string;
}

/**
 * What is new since the last look: a contact who has become unread (the first message of a chat shows its name and its
 * last line), and a forum with a newer unread post. The first look (`prev` null) announces nothing: what was already
 * waiting is not news.
 */
export function announcements(prev: Unread | null, now: Unread, forumLabel: string): Announcement[] {
  if (!prev) return [];
  const out: Announcement[] = [];
  const had = new Set(prev.messenger.map((c) => c.id));
  for (const c of now.messenger) if (!had.has(c.id)) out.push({ title: c.name, text: c.line });
  const f = now.forumLatest;
  if (f && now.forum > 0 && (!prev.forumLatest || f.at > prev.forumLatest.at)) out.push({ title: forumLabel, text: f.who ? `${f.who}: ${f.title}` : f.title });
  return out;
}

type Notify = (n: { count?: number; title?: string; text?: string }) => Promise<unknown>;
const channel = (): Notify | null => {
  try {
    const n = (window as unknown as { molfarShell?: { notify?: Notify } }).molfarShell?.notify;
    return typeof n === "function" ? n : null;
  } catch {
    return null;
  }
};

/** Puts the number on the app's tab (0 clears it). */
export function reportCount(count: number): void {
  const n = channel();
  if (n) void n({ count }).catch(() => undefined);
}

/** A short message, with the number that goes with it. The shell may refuse it (its switch is off, or the user is looking). */
export function announce(a: Announcement, count: number): void {
  const n = channel();
  if (n) void n({ count, title: a.title.slice(0, 80), text: a.text.slice(0, 200) }).catch(() => undefined);
}
