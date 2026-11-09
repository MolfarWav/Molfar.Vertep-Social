# AGENTS.md: Social (messenger + forum)

Social is an optional app of Molfar Vertep: an ICQ-style messenger and a phpBB-style forum where
characters write on their own. Repo `MolfarWav/Molfar.Vertep-Social`. Keep this file current when
the app changes shape. Plan and decisions: Molfar.Vertep issue #309.

## Rules
- English in code, comments, commits and repo files. The UI has two languages, `en` (source) and `uk`.
- No model names in commits, files or PRs. No personal identifiers or workspace data in the repo.
- A UI change updates its guide page in the same change (`.skills/guide/pages/`, format in the engine
  repo `.fork/handoff/guide/FORMAT.md`).
- A new string goes into the screen's `strings.ts` for **both** `en` and `uk`; `test/skeleton.test.ts` fails otherwise.
- A character's card is read only when the user imports it or presses "Update from Roleplay", and never reaches a messenger or forum prompt.

## Layout
- `src/main.tsx`, `src/shell/`: top bar (desktop), bottom tabs (phone), nav context (`useNav`, `useChrome`, `BarActions`).
- `src/screens/<messenger|forum|profiles|settings|you>/`: one folder per screen with `index.tsx`, `<name>.css` (every rule scoped
  under `.s-<name>`), `strings.ts`, and the mock data it needs in `src/mock/`.
- `src/components/`: `Flower` (status flower + `Envelope`), `Avatar`, `Logo`. Shared, small.
- `src/pictures/`: pictures in messages and posts (#331): `use-picture.tsx` (the attach button, chip and dialog of a text box: file from disk or a drawn picture, ends as a stored asset URL), `MsgPicture.tsx` (a picture, a placeholder or a failure inside a message or post), `worker.ts` (draws the pictures characters asked for, page-side, see "Pictures" below), `strings.ts`.
- `src/emoji/`: the emoji picker, shared by the messenger and the forum (see "Emoji" below). Its CSS is scoped by the `.emo-` prefix, not by a screen class.
- `src/styles/`: `tokens.css` (themes Vertep, Dark, Light; names are the ones the design boards use),
  `base.css` (root, `.av`, `.btn`, `.ib`), `shell.css`.
- `plugins/<profiles|messenger|forum|life>/`: backend plugins (QuickJS sandbox: no Unicode property escapes in regexes, see `docs/DECISIONS.md`).
- `scripts/shot.cjs`: browser-check screenshots (see its header).

## The look (approved, do not drift)
Variant A "Echo": red accent on the Vertep theme, Dark and Light follow the shell. Inter for UI, Kurale for
headings. Rows and logs, not bubbles. Title bars with a soft accent gradient. Corners 8-10 px, 14 px text.
Status flower: five petals around the Vertep eye; colour, centre mark and a word always together.
- Inter draws the Cyrillic capital "З" like "3": never start a label with a lone "З" ("Із Roleplay", "Від ...").
- "Unavailable" and "Away" share the warn colour; the centre mark and the word tell them apart.
- Phone: touch targets at least 44 px, no hover-only controls, board rows become cards.
- The approved screens are the reference: `/mnt/project-files/social/screens/` in the Molfar Vertep project
  (not in this repo). Compare at 1280x800 and 390x844 in all three themes.

## Settings blocks
Each settings block has a tone and an icon (`src/screens/settings/tone.tsx`: `LOOK` maps a block name to a hue, `BlockIcon` draws its icon). The hues and their text colours per theme are in `settings.css` (`[data-tone]`). A desktop `Card` and a phone `GroupHead` take the block name (`glyph`). The desktop page is two `.col` columns, not grid rows: a tall card in a shared grid leaves a hole under its neighbour. A new block gets a name in `tone.tsx` first.

## Preview and `?` parameters
`bun run preview:build`, then `NODE_PATH=$(npm root -g) node scripts/shot.cjs <outDir> "<query>"`.
Query: `screen=messenger|forum|profiles|settings|you`, `theme=vertep|dark|light`, `lang=en|uk`, and per-screen `view=` / `state=`
values documented in the screen's `index.tsx` header.

## Model calls
The profile interview and "Fill empty" go through `src/screens/profiles/model-api.ts`. In preview (`?screen=`) they are fakes; in the app they call the plugin routes `POST /profiles/suggest` and `POST /profiles/fill` (`plugins/profiles/plugin.js`, adapted from Roleplay's profile plugin). The app's profile load, save and delete go through `src/screens/profiles/persist.ts`: a profile is sent when its saved form differs from the copy the server confirmed; drafts are never sent.

A profile may carry its own `model` ("provider/model", "" = the app's model). The messenger and forum plugins read it before
`settings.models.<task>`; a profile may also carry a `picture` (an engine asset URL, `/v1/assets/<id>`, checked in `cleanProfile`;
the messenger contact list and the forum authors pass it on). The picture dialog (`src/screens/profiles/picture-dialog.tsx`) builds a
prompt from the profile (`picture.ts`) and calls the engine's `POST /v1/images` and `GET /v1/images/models` (open to every app,
`picture-api.ts`). The Model tab (`src/screens/profiles/tabs/ModelTab.tsx`) edits it with the settings' `ModelPick`.

## Messenger memory (#333)
The model sees the current conversation: `contextOf` in `plugins/messenger/plugin.js` sends every message after the note's `upto` (at most the window plus a third of it) and the note (`chat.summary: {text, upto, at, edited?}`) goes into the system prompt. `onTick` folds the messages that left the window with one model call (`sum:<id>:<upto>`; a failure waits 10 minutes, `chat.foldFailAt`); Settings > Messenger `messengerSummary` switches it, off = exactly the last window as before. A new conversation (`POST /messenger/new`, two passes, `keepNote`) is a divider time in `chat.breaks`: nothing before the last divider reaches the model; with `keepNote` the messages not yet in the note are folded first. A reply being written is marked `chat.pending.asking` (time, set in `requestReply`, cleared when the reply is filed or fails): `dueChats` skips a chat asked less than 5 minutes ago, so the tick never races a route that waits for the model (#343), and `fileReply` drops an answer when the user's message was already answered. `POST /messenger/summary` is the user's edit, `POST /messenger/clear` deletes the history. `knows` on a profile (`"knows"|"name"|"stranger"`, absent = `settings.messengerKnows`, default "knows") decides what `youFor` gives the prompt; `OOC_HINT` is in every prompt. UI: `src/screens/messenger/memory.tsx` (a dialog, a sheet on a phone), the info card and the phone's book button. The forum reads the note and `knows` too (#336): `userKnownTo` in `plugins/forum/plugin.js` (copies of `youOf` and `knowsOf`, pinned by `test/forum-user.test.ts`); the note goes only into a reply to the user, never to a stranger. `scripts/fold-check.mjs` runs the fold on a real model (own API key).

## Pictures (#331)
A message or post may carry `image`: `{state: "ready", url: "/v1/assets/<id>", alt?, gen?}`, `{state: "pending", prompt, gen: true}` or `{state: "failed", prompt, gen: true}` (`cleanImage` in the plugins; only an engine asset URL is accepted). The block between `// <images-shared>` and `// </images-shared>` is identical in the messenger and forum plugins (a test pins it). The user's picture goes in with `POST /messenger/send`, `/forum/topic`, `/forum/reply` (`image`, text optional); the model sees only `[a picture: ...]` as text, never the bytes.
Characters send pictures only when Settings > Pictures is on (`settings.images {on, perDay}`, off by default; `models.image`; a profile's own `imageModel` wins): the prompt then asks for `[[image: short English description]]` at the end of a reply (a JSON `image` field for a new forum topic), the plugin files the message with a `pending` image (the marker is cut out of the text whether or not pictures are allowed), and the cap per character per day is counted from what is stored (messenger and forum each). A plugin can only write text, so the Social page draws: `src/pictures/worker.ts` polls `GET /messenger/images` and `GET /forum/images` every 20 s (and when a chat or topic shows a pending picture), draws each with the engine's `POST /v1/images` and files it with `POST /messenger/image` or `POST /forum/image`; a failed drawing is filed as `failed` and is not retried. A localStorage lock per picture keeps two windows of one browser from drawing it twice; two devices are not covered. Pictures arrive while Social is open.

## Stickers and custom emoji (#329)
`plugins/stickers/plugin.js` keeps `stickers/packs.json` (`{packs: [{id, name, kind: "sticker"|"emoji", items: [{id, name, url, tags?}]}]}`, ids `[A-Za-z0-9_-]{1,40}`, urls only `/v1/assets/<id>`, at most 40 packs and 200 items; `GET` and `PUT /stickers/packs`, the PUT replaces the whole list). The page side is `src/stickers/`: `model.ts` (pure: token `:pack/item:`, ids, list edits, search; `test/stickers.test.ts`), `packs.ts` (one shared list, `usePacks`, `savePacks`, `uploadItem`; `?packs=demo` in the design preview), `Manager.tsx` (the dialog), `Render.tsx` (`RichText` draws tokens). A sticker message is the usual `image` with a `sticker: "pack/item"` field (kept by `cleanImage` in both plugins, inside the images-shared block) and empty text; `MsgPicture` draws it bare and large. The picker (`src/emoji/Panel.tsx`) has a pack row, shows sticker packs only when the host passes `onSticker` (messenger, forum reply; not a new topic) and stores tokens in the recent list. An animated WebP or APNG is stored untouched (`isAnimatedImage` in `src/lib/animated-image.ts`, used by `shrink` in `picture-api.ts`); anything else over the size limit is re-encoded by a canvas, which keeps one frame. Characters (step 2): `profile.stickerPacks` (ids, kept by `cleanProfile`, switched in the Voice tab by `src/stickers/ProfilePacks.tsx`) limits which packs a character may use. The block between `// <stickers-shared>` and `// </stickers-shared>` is identical in the messenger and forum plugins (a test pins it): `stickerPacksFor`, `stickerHint` (at most 12 items a pack, ids and names), `takeSticker` (cuts every `[[sticker: ...]]` marker, keeps the first valid one while the cap allows, drops custom emoji tokens that are not from an allowed pack; a token needs a pack id that starts with a letter so "9:30/10:30" stays text). `STICKERS_PER_DAY` is 3, counted from stored messages (`stickersLeft` in each plugin). Messenger: the sticker is a second message after the text; forum: `post.image` under the text, a drawn picture wins, no sticker in a new topic.

## Emoji
`src/emoji/`: `use-emoji.tsx` (`useEmoji({ target, value, onChange, phone })` gives a host the smiley `button` and, on a phone, the `tray` to put under its message bar; on desktop the button opens a popover in a portal), `Panel.tsx` (search, group tabs, recent, skin tone, arrow keys), `insert.ts` (`insertAt`, caret and selection, never tears a surrogate pair), `search.ts`, `recent.ts` (browser storage only), `data.ts` over `data.json`.
`data.json` is generated: `scripts/emoji-data.mjs` reads the Emojibase package (not a dependency, the script header says how to fetch it), keeps English and Ukrainian names and stops at Emoji 15.1 because that is what the bundled font covers.
The font is Noto Color Emoji, the COLRv1 build from `@infolektuell/noto-color-emoji` (`src/emoji/font.css`, family "Social Emoji", placed right after Inter in the font stacks of `.soc` and `.btn`). The SVG build in `@fontsource/noto-color-emoji` draws nothing in Chrome and Edge: do not swap it in. The `@font-face` ranges leave out `# * 0-9 © ® ™` so the emoji font never draws text. Raise the data cap and the font together.
Plugins: `cut()` in the three plugins never tears an emoji (surrogate pairs, a trailing joiner); the prompt lines for the profile's emoji level (`EMOJI_WORDS`) ask for real emoji characters, not `:codes:`. A new profile starts at emoji level 1 (profiles saved earlier keep their level).

## The forum
`plugins/forum/plugin.js` holds the data (`forum/` in the app data folder), the routes and the autonomy tick; its header says how. The screens are `src/screens/forum/`: `live.tsx` (real) and `preview.tsx` (mock) share `Home`, `BoardPage`, `TopicView`, `NewTopic`, `Strip`, `PostCard`; `model.ts` turns the engine's answers into what they draw (tested in `test/forum-real.test.ts`). Pages of a long topic (`PAGE_SIZE`) and search are plugin routes (`/forum/topic?page=`, `/forum/search`), drawn by `Pager.tsx` and `SearchPage.tsx`; the screen's route is kept in the browser history (`src/lib/route-history.ts`) so Back works. Moderation (the user removes a post or a topic) keeps a placeholder: everything that reads posts goes through `livePosts` (see `docs/DECISIONS.md`, "Moderation"). Tests: `test/forum-plugin.test.ts` (a simulated day with a restart, bump order, flags, the two-pass flow, pages, search, moderation).

## Life (#311)
`plugins/life/plugin.js` keeps each character's diary (`life/diary/<id>.json`, one model call per profile per local day) and one shared world feed (`.cache/life/world.json`: derived, so the engine's sync and backups skip it and two devices never fight over it; fetched once a day from a fixed host list: the manifest's `networkHosts`, pinned to `SOURCES` by a test; this is the only plugin with `network`). The messenger and the forum only read them through a reader copied into both plugins (`lifeAllowed`, `recentDays`, `lifeSubject`; `test/life-surfaces.test.ts` keeps the copies identical) and remember what they told in their own files, never in `life/`. Text from outside is quoted as data (`<outside>`), capped, without angle brackets. The messenger's first messages (`planFirst`) never fire without a subject. UI: Settings > Life (`src/screens/settings/life.tsx`) and the profile's Life tab (`src/screens/profiles/tabs/LifeTab.tsx`; diary changes save at once, the two switches with the Save bar). Details and what was not checked: `docs/DECISIONS.md`, "Life".

## Decisions
See `docs/DECISIONS.md` for what the owner decided and where to continue.

## Roleplay import
`manifest.json` declares `reads` (Roleplay's cards and personas); only the `profiles` plugin has the `peer` permission. The plugin lists, imports and
refreshes cards through `host.peer`; a persona goes to Your profile (`/you/*`, `you.json`, `src/screens/you/`), not to the profile list (see `docs/DECISIONS.md`, "Roleplay import"); the screen side is `src/screens/profiles/import-api.ts` (list, runner, diff)
and `import.tsx`. The picture comes along with an import (`POST /profiles/avatar` finds it, `src/lib/roleplay-avatar.ts` uploads it; see `docs/DECISIONS.md`, "Avatars on import"). In preview (`?screen=`) the same screens run on `src/mock/profiles-import.ts`.

## Language
`src/i18n/index.ts`: the UI language is `?lang=` (previews), else the user's choice (Settings > Language: Auto, English, Українська; `social:lang-pref`), else the app's language from `window.molfarShell.locale()` (cached in `social:shell-lang` so the next start has no flash), else English. The browser's language is only used outside the engine, where `locale()` fails. The engine has no "language changed" event; `followShellLanguage` asks again on focus, resize and visibility change, which is what happens when the app's tab comes back.

## The shell's "App settings" list
`manifest.json` has `settingsView: "settings"`: the shell's Settings lists Social under "App settings" and, when it is pressed, opens the app and hands it that name (`molfarShell.onView`, `src/lib/shell-view.ts`, listened to in `src/shell/app-shell.tsx`). Older engines have no `onView`: Social is not listed there and More > Settings stays the way in.

## Open items
- The app cannot read the shell's scheme yet: the theme comes from `?theme=`, then the last choice, then Vertep.
- The "Open Home" button needs engine 1.13.1 (`molfarShell.openHome`); on an older engine only the text hint shows.
- Forum: no preview of a post (dropped); the reply and new-topic prompts are not yet checked on a real model (issue #320).
