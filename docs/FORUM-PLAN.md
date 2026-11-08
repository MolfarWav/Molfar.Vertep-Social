# Forum plugin and screen: plan (written before the code, 2026-11-08)

Next piece of issue MolfarWav/Molfar.Vertep#310 (step 4). Read `AGENTS.md` and `docs/DECISIONS.md` first.
Everything below is a plan, nothing of it is built yet. What is built: the forum UI on mock data (home with boards,
one topic page) and a "not built yet" page in the installed app (`src/shell/forum-soon.tsx`).

## What the owner asked for (2026-11-08)
- A **"Write now" button** on the forum while testing: it forces the model call(s) for characters and the posting,
  so nobody waits to see whether they write.
- **New topics and topics with new replies rise to the top** of their board (ordered by the last post, like phpBB).
  Test this explicitly.
- Later: the user can close a topic (no more posts, it sinks): issue #312.
- Characters bring topics of their own life and of the outside world: issue #311 (second improvement, but keep the
  topic source in one place so it can plug in).
- Notifications (engine, ask first): a count on the app's tab and a bottom-right popup: issue #310 comment.
- The names of characters (Мавка and the rest) are only labels in screenshots, not a folklore setting. Default board
  names must be neutral.

## Data (the app's `data/` folder, written by the `forum` plugin)
- `forum/boards.json`: `{categories: [{id, name, boards: [{id, name, desc}]}]}`. Created empty; the empty state offers
  "Create default boards" (names come from the client's strings in the user's language) and "New board".
- `forum/topics/<id>.json`: `{id, board, title, by ("me" or a profile id), createdAt, lastAt, locked, posts: [{id, by, at, text}]}`.
  One file per topic; the board page and home scan the folder (hundreds of topics are fine; add an index file when not).
- `forum/log.json`: `{day: "YYYY-MM-DD", posts: n, byAuthor: {id: n}, lastAutoAt}` for the daily limits (reset by day in the user's time zone,
  `tzOffset` from settings.json as in the messenger plugin).
- Profiles are read from `profiles/<id>.json` (written by the profiles plugin). A Roleplay card is never read.

## Routes (relative to /v1/apps/social, plugin `forum`)
- `GET /forum/home` -> categories with boards, each with `topics`, `posts`, `last {title, by, at}`, `unread`; plus the strip
  (`posted`, `max`, quiet hours, `nextInMin`, `autonomous`), who is online (profiles whose schedule says online now) and stats.
- `GET /forum/board?id=` -> topics ordered by `lastAt` descending (that is the "bump"): `{id, title, by, replies, lastBy, lastAt, locked}`.
- `GET /forum/topic?id=` -> the topic with posts and, per author, `rank` (profile `forum.rank`), post count, joined date, signature.
- `POST /forum/topic {board, title, text}` (the user starts a topic), `POST /forum/reply {topic, text}`.
- `POST /forum/boards` (create default or named boards), `PUT/DELETE` later.
- `POST /forum/force {board?, topic?, count?}`: **Write now**. Picks an author and an action exactly as the tick does but ignores
  the daily limits and the quiet hours (it still counts in the log); `count` up to 3 posts in a row. Returns the new posts or the model error
  (`code: "no-model"` as in the other plugins). Always visible in the app for now (the owner wants it for testing).
- `POST /forum/read {topic}` clears unread.

## Autonomy (`onTick`, one minute, two passes like the messenger plugin)
1. Skip when `settings.autonomous` is off, inside quiet hours (`quietFrom`..`quietTo`, user's time zone), or when `posted >= postsPerDay`.
2. Spread the day: wait at least `awakeMinutes / postsPerDay` since `lastAutoAt`, scaled by activity (quiet x2, moderate x1, lively x0.5, chaotic x0.25).
3. Pick an author among profiles that are online now (or away), weighted by `forum.frequency`, never above `postsPerAuthor` today,
   never a profile with `opensOwn` false for a new topic or `repliesOthers` false / `repliesYou` false for a reply to that kind of author.
4. Action: a new topic with probability `newTopicShare`, otherwise a reply to a topic that is not locked, preferring recent ones and ones the author
   has not just posted in. If there are no boards or topics, a new topic in a random board.
5. The model call uses `settings.models.forum`. Prompt: the profile's voice (reuse `systemPromptFor` from `plugins/messenger/plugin.js`, copied because
   plugins cannot import each other), the board or the last ~8 posts of the topic with author names, "write one forum post, 1-4 sentences".
   A new topic asks for JSON `{title, text}`. Topic subject comes from ONE function `pickSubject(profile, world)` that returns the profile's interests
   today, so the life diary and the world feed (#311) can replace it later.
6. A failed model call posts nothing and is logged; the strip shows the last error. No retry storm: wait for the next slot.

## UI plan
- Where: the Forum tab. Home keeps the boards table (cards on phone). **New: board page** (topics table: title, author, replies, last post;
  cards on phone) between home and topic: it does not exist in the mocks. "New topic" button in its header. Draw it with the existing tokens, the
  same header bar as the topic page, the same row style as `Boards.tsx`. Check with `ux-review` before building.
- Topic page and `PostCard` are reused: the author column gets real data (rank, count, joined, signature). Quick reply and Send are real.
- The strip (`Strip.tsx`) gets real values and a **"Write now"** button beside Configure (secondary button, a spinner while the model works,
  the result toast: "N posts written" or the error with the Settings link on `no-model`).
- States to cover: no boards (create defaults), board without topics, topic with the user's own post pending, model error on Write now,
  autonomy off, daily limit (amber strip), quiet hours (strip says so), no profiles yet (a link to Profiles).
- Tab badge in the shell: `useNav().setBadges({forum: unread topics})` (the messenger already does this for its tab).

## Tests and checks
- Plugin tests like `test/messenger-plugin.test.ts` (fake host): bump order after a new post, daily limit and per-author limit, quiet hours in a time zone,
  author eligibility flags, two-pass model flow, JSON parse failures, `force` ignoring limits, path safety of ids.
- Browser check on a clean engine with the fake model (see the engine repo `.claude/skills/browser-check/`; a Social example is easy to adapt from what was done
  for the messenger: install the app tree in `$DATA/apps/social`, `bun install` in it, open the shell, click the Social tab).
- Verify on a real model before calling it done; the fake model proved only the flow.

## Other open work (in order)
1. Forum plugin and screens (this plan).
2. Engine: read-only access to Roleplay data (security code, ask the owner first, tests in `test/security.test.ts` and `test/malicious-plugin.test.ts`).
   Until then profiles are made by hand, interview or file.
3. Engine: app notifications (tab count + bottom-right popup, per-app switch, 14 locales). Ask first.
4. First messages from characters with a daily limit and quiet hours (messenger), topic source shared with the forum.
5. Shell theme (an app cannot read the shell's colour scheme yet), "My status" in the contact list footer is fixed, guide translations (`l10n/`).
6. Life diary and world feed (#311), close topics (#312).
