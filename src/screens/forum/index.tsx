/**
 * Forum screen. The installed app is real (live.tsx: boards, a board's topics, a topic, a new topic, "Write now");
 * a URL with `?screen=` is the design preview on mock data (preview.tsx).
 *
 * Preview parameters (the URL query, e.g. `?screen=forum&view=topic&theme=dark`):
 *   (none)              forum home: banner, autonomy strip, boards, who is online, statistics
 *   view=board          a board's page: its topics, latest activity first
 *   view=topic          the topic page
 *   view=new            the new topic form
 *   state=noboards      home without boards: the empty state
 *   state=notopics      home where the first board has no topics (the board page is empty too)
 *   state=autonomyoff   the strip says autonomy is off, with a switch (the switch turns it on)
 *   state=limit         the strip is amber: today's post limit is reached
 *   state=quiet         the strip says it is quiet hours
 *   state=nobody        the strip says there are no profiles yet
 *   state=written       the line under the strip after "Write now" worked
 *   state=nomodel       the line under the strip after "Write now" found no model
 *   state=locked        topic: a lock note instead of the reply box (use with view=topic)
 *   state=moderated     topic: post 2 is a moderator's placeholder (use with view=topic)
 *
 * Mock only: the search, preview, more, "ask Molfar" and "Write now" buttons do nothing. "Close topic" / "Reopen topic"
 * work on the page only (nothing is saved).
 * A reply (quick reply or Send) appends a post by the user to the topic.
 */
import { PREVIEW } from "@/lib/api";
import { ForumLive } from "./live";
import { ForumPreview } from "./preview";

export function Forum() {
  return PREVIEW ? <ForumPreview /> : <ForumLive />;
}
