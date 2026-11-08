# Social: decisions and where to continue

Written 2026-11-08 so that any session (any account) can pick the work up. Plan and history:
MolfarWav/Molfar.Vertep#309; follow-up work: MolfarWav/Molfar.Vertep#310. Read `AGENTS.md` first.

## Decided by the owner (confirmed in the build thread, 2026-11-08)
- Social is a separate optional Store app in its own public repo (AGPL-3.0). Name "Social" for now.
- Look: variant A "Echo", red accent on the Vertep theme, Dark and Light follow the shell. Inter + Kurale.
  The approved boards and screenshots are the reference (kept in the Molfar Vertep project files under `social/`;
  the build compared every screen with them at 1280 and 390 px in all three themes).
- Profiles (not cards): a one-time digest of card + Soul + profile + scenario. The card is never read again.
  Names come from the Soul. Own characters can be made in the app.
- New profile follows Roleplay's "New persona" flow (same sequence and decisions, not the same markup):
  write it yourself, short interview (idea, optional picture, 4 random ideas from a 60-entry list per language
  with a shuffle button, a no-model five-question path, three drafts, up to two quick questions as chips, a wish,
  a detail level), from a file (200 KB, 12000 chars), import from Roleplay. Example ideas come from a file, not a model.
- "Fill empty" asks the model for the empty fields only and shows a review (checkboxes) before anything changes.
- Backend logic for fill and interview is adapted from Roleplay's `plugins/profile/plugin.js`; the UI calls it through
  `src/screens/profiles/model-api.ts` (fake for now, shaped like the real routes).
- Settings live inside Social (gear on desktop, "More" tab on phone). The rule "app settings live in the shell's
  Settings" applies to Roleplay only, because Roleplay ships by default.
- One save model in the profile editor on desktop and phone: edits are a draft with a Save bar (Cancel / Save).
- Phone bottom bar: icons, four tabs (Messenger, Forum, Profiles, More). The boards disagree among themselves
  (icons + 3 tabs in Messenger/Forum, text-only in Profiles/Settings); the owner was shown the comparison.
- The phone tab icons are tinted like Roleplay's rail (labels stay neutral): Messenger rose, Forum cyan, Profiles violet,
  More zinc (`--hue-*` tokens, Tailwind 400 on dark and Vertep, 600 on light). The desktop top bar tabs carry the same tinted icons (18 px; the owner chose this over the boards, which draw text only).
- The hint under "Autonomous posts" follows the switch (On / Off text).
- No memory bridge with Roleplay in v1. One shared forum. Separate models for messenger, forum and import.
- Roleplay is read only after the user grants it (engine work, issue #310).
- Characters need a life outside talking to the user (artificial life): their own topics for first messages and forum
  threads. A second improvement after the first runnable Social, issue MolfarWav/Molfar.Vertep#311 (owner, 2026-11-08).
  The messenger and forum plugins keep a place for it: first messages and new topics take their subject from one source
  that can later be the life diary.
- The characters' names are only labels in screenshots, not a folklore setting; topic sources are broad (news, politics, games,
  film, anime, weather, Reddit RSS, other forums), see issue #311. Default board names are neutral.
- Quality and correctness over speed: the owner accepts that work moves to another account when tokens run out.

## State (2026-11-08, evening)
- The UI was built on mock data (PRs #1, #2). A URL with `?screen=` is the design preview and stays on mock data
  (`PREVIEW` in `src/lib/api.ts`); the installed app opens without it and is real.
- Real: the `profiles` plugin (profile store, settings, interview, Fill empty), the `messenger` plugin (chats, replies in
  the profile's voice, statuses from the schedule, a one-minute tick for queued replies) and their screens.
  The forum is built (see "Forum build" below).
- The browser's UTC offset is stored in `settings.json` (`tzOffset`) on every open, because the plugin sandbox does not
  reliably know the machine's time zone; schedules run in the user's own time.
- Roleplay import is real (issue #322, see "Roleplay import" below); a profile is also made by hand, by interview,
  or from a text file.
- The app ships `data/README.md` because the engine's fs service refuses to write while the data folder does not exist.
- Guide pages: `.skills/guide/pages/` (index, messenger, forum, profiles, settings); translations in `l10n/` (13 locales).

## Owner review, round 1 (2026-11-08, late evening)
The owner installed the app from the PR branch and sent screenshots.
- **Engine permission granted** for read-only access to Roleplay data and for app notifications (tab count + bottom-right popup).
  It is still security code: no cheap models, tests in `test/security.test.ts` and `test/malicious-plugin.test.ts`, and an
  engine PR of its own (not in the Social repo).
- **Next order: the forum** (`docs/FORUM-PLAN.md`), then the engine work. Small layout fixes were put into PR #3 first.
- Fixed in PR #3: settings cards no longer cut off their content on a short window (rows were shrinking to the window,
  `grid-auto-rows: max-content`); bigger card headers; the settings button is a real gear (it was drawn like a sun);
  the editor's section labels are bigger; "Engine default" is explained in a hint under Models; the model picker is
  searchable and grouped by provider (`src/screens/settings/model-pick.tsx`, real mode only; the preview keeps the plain select);
  deleting a profile also deletes its chat.
- Deferred to issues in MolfarWav/Molfar.Vertep: #313 (Model tab per profile, picture generation), #314 (own persona
  separate from characters, tags, colour), #315 (forum must not post the whole daily limit at once).
- Owner marked as very important (2026-11-08, issue #316): an emoji picker in the messenger and the forum, characters sending
  emoji (the profile's Emoji level already feeds the prompt, default 0), and a check for extra emoji packs. Plan and findings are in the issue. Owner's answer on packs: start with (a), Unicode data plus a consistent emoji font; image packs later.
- The owner works on several machines and may continue from another account: everything needed is in this file,
  `docs/FORUM-PLAN.md`, issues #310 to #315 and the PR #3 description.

## Manifest `engine` (fixed 2026-11-08)
- `engine` in `manifest.json` is the app contract number (`>=1.0.0`), not the Molfar Vertep release number. The engine
  checks it against its contract (`APP_API_VERSION`, 1.0.x). `>=1.12.0` made the Updates dialog warn that Social "needs a
  different version" on engine 1.12.1, and would have refused every Social update with a 409. Raise it only when
  Molfar Vertep raises the contract; `test/skeleton.test.ts` guards the value.

## Known, left on purpose
- Forum phone home: the second category sits 4 px lower in the board than in the build (cause not found).
- "31 тем" in the Forum phone board is printed "31 тема" (correct plural).
- The shell's colour scheme cannot be read by an app yet: theme comes from `?theme=`, then the last choice, then Vertep.
- Mock names and dates stay Ukrainian in the English UI (they are data).
- An "open with the main app" autostart does not exist in the engine.

## How to continue
1. Build check: `bun install`, `bun run typecheck`, `bun test test/`, `bun run preview:build`, then
   `NODE_PATH=$(npm root -g) node scripts/shot.cjs <outDir> "screen=forum&lang=uk" vertep,dark,light 1280x800,390x844`.
2. Preview parameters per screen are documented in each `src/screens/<name>/index.tsx` header.
3. Next steps in order: the engine work (read-only access to Roleplay data, app notifications), first messages from characters, then #311 and #312. Profiles, messenger and the forum are done.
4. Rules that bit during the build: no model names in commits or files; a new string goes into `en` and `uk`
   (`test/skeleton.test.ts`); never start a Ukrainian label with a lone "З" (Inter draws it like "3").

## Forum build (2026-11-08, issue MolfarWav/Molfar.Vertep#317)
Built as planned in `docs/FORUM-PLAN.md`; what was decided while building it:
- **Where it lives:** `plugins/forum/plugin.js` (data, routes, tick), `src/screens/forum/`. One topic is one file (`forum/topics/<id>.json`); a post carries a copy of the author's name and colour, so a deleted profile's posts still read. The board page is new (not in the mocks): crumbs, a header with Write now and New topic, a table (cards on phone), an empty state.
- **Bump order** is the topics sorted by `lastAt`; a user or a character post sets it. Tested in `test/forum-plugin.test.ts`.
- **Spreading (#315):** the next slot `nextAt` is the average gap (waking hours / posts per day x the activity scale) with jitter 0.5x to 1.5x, never under the hard minimum of 2 minutes; at most 3 autonomous posts in any 10 minutes in every mode; the daily limit and the limit per author; quiet hours in the user's time zone. Counters live in `forum/log.json`. A user's post moves the slot up to 2 to 4 minutes ahead (never past the hard gap), so characters answer in a few minutes. A failed call waits 10 minutes (no retry storm). The simulated-day tests cover a restart in the middle.
- **Who writes what:** the author is weighted by the profile's frequency (or equal); away profiles count 0.4, the last author 0.3; then, in order: a user's post still owed replies (`owe` 1 to 3, set when the user posts), a mention of the author, a new topic by chance (the "new topics" share, a favourite board first), a live topic (newer ones and favourite boards weigh more). The profile's three flags (opens topics, answers you, answers others) are respected. The subject of a new topic comes from one function, `pickSubject`, for #311.
- **Write now** is `POST /forum/force` (1 to 3 posts, requested in parallel in the first pass, filed in the second); the strip, a board page and a topic page have the button (scope: everything, the board, the topic). It still counts toward the day and does not move the slot.
- **Tab badge:** the number of topics with unread posts, polled every 30 s from the shell (`src/lib/badges.ts`) and set by the forum screen while it is open.
- **A sandbox trap found only in the real engine:** the plugin sandbox has no Unicode property escapes (`\p{L}`); the first repeat check used one and treated every text as equal to every other. Use plain character classes in plugins.
- **Not done, on purpose:** search, the Preview button (hidden in the live forum), closing topics (#312), characters' emoji and the picker (#316), moderation, paging of long topics (a topic keeps up to 500 posts and the page shows all), the browser Back button (the forum navigates inside the page; the header arrows and the crumbs go back). Not checked on a real model: only on the fake one.

## Roleplay import (2026-11-09, issue MolfarWav/Molfar.Vertep#322)
The last piece of #310. The engine side is `reads` in the manifest, the user's one-time answer on Home, and `host.peer.read/list/stat`
for a plugin with the `peer` permission (engine PR 321).
- **What is declared:** `manifest.json` `reads`: app `roleplay`, paths `characters/*/card.json` and `personas/*.json` (the Soul and the
  structured profile live inside the card, the persona's profile inside the persona file, so nothing more is needed). The `why` text
  is what the consent dialog shows. Only the `profiles` plugin has the `peer` permission (`test/profiles-import.test.ts` pins both).
- **Who may read, and when:** a card is read in two situations only: the user imports it, or presses "Update from Roleplay". No tick,
  route or prompt reads a card on its own. A card's text never goes into a messenger or forum prompt; the model that makes the digest
  gets it once. What the digest model reads: description, personality, scenario, first message, the Soul line (pronouns, class toward
  the user, extreme traits, coping) and the structured profile lines the text does not already say. Never: example dialogue, system
  prompt, notes for people, avatar, the private note, the sexuality and trauma sections. A card is cut to about 12000 characters.
- **Routes** (`plugins/profiles/plugin.js`): `GET /profiles/roleplay/status` (ready or closed), `GET /profiles/roleplay` (the list: titles
  and names only, no card text), `POST /profiles/import {kind, id, key?, model?}` (one card, one profile; the reply is the saved profile),
  `POST /profiles/refresh {profileId, model?}` (a proposal from a new reading; nothing is saved). The screen imports one card per request,
  so progress and "Try again" are per card.
- **Profile ids are derived from the source** (`importId`): `rp-<card id>` (and `--<name>-<hash>` for a narrator's member), `pe-<persona id>`.
  So "already imported" needs no record: the row is marked "Imported" when a profile with that id exists. The profile keeps
  `from: {kind, id, key?}` (read by "Update from Roleplay") and `cardDate` as an ISO day (the screen shows it in the UI language).
- **Names and splitting:** the name is the Soul name; a card with one Soul takes it, a card with none keeps its title (`soul: false`, shown as
  "No Soul: name from card"); a narrator card with two or more Souls gives a group row and one row per name, and each member's digest gets
  that member's `### Name` part of the card text. Cards of type `group` and `assistant` are hidden. A card Social cannot read (a link, a broken
  file, over 2 MB) is counted as "could not read".
- **The run** lives in `ImportRunner` (`src/screens/profiles/import-api.ts`), outside React: closing the window does not stop it, a failed
  card stays failed until "Try again", Stop lets the running card finish. When the run ends while the window is closed, a notice says so.
- **Update from Roleplay** changes About, the writing manner and adds interests the profile does not have; it never touches habits, forum
  fields or the schedule. Accepting puts the values into the draft; the card date moves when the draft is saved.
- **No access:** the plugin sees only `host.peer.apps()`, so it cannot tell "not installed" from "not allowed"; the dialog says both and tells
  where to allow it (Home, the details of Social, "Access to other apps"). It is text, not a link: the app frame cannot navigate the shell
  (sandbox without `allow-top-navigation`). A real link would need a shell call (engine work, not done). Settings > Roleplay access shows the real state
  (no button: only the user can change it).
- **Checked:** `bun test` (plugin with a fake peer, the runner, the diff), and a real engine in a throwaway folder with a stub Roleplay app
  and a mock model: ask, allow, scan, import (single, narrator member, persona), model refusing, a card that is a symlink (refused by the
  engine), traversal ids (refused), refresh, revoke; then the screens in a browser (1280 dark and light, 390 uk). **Not checked:** a real
  model. The digest prompt is `DIGEST_SYSTEM` in the plugin; free small models may answer in broken JSON, which the screen shows as a failed
  card with "Try again".

