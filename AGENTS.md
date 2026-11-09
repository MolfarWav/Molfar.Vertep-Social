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
- `src/styles/`: `tokens.css` (themes Vertep, Dark, Light; names are the ones the design boards use),
  `base.css` (root, `.av`, `.btn`, `.ib`), `shell.css`.
- `plugins/<profiles|messenger|forum>/`: backend plugins (QuickJS sandbox: no Unicode property escapes in regexes, see `docs/DECISIONS.md`).
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

## The forum
`plugins/forum/plugin.js` holds the data (`forum/` in the app data folder), the routes and the autonomy tick; its header says how. The screens are `src/screens/forum/`: `live.tsx` (real) and `preview.tsx` (mock) share `Home`, `BoardPage`, `TopicView`, `NewTopic`, `Strip`, `PostCard`; `model.ts` turns the engine's answers into what they draw (tested in `test/forum-real.test.ts`). Pages of a long topic (`PAGE_SIZE`) and search are plugin routes (`/forum/topic?page=`, `/forum/search`), drawn by `Pager.tsx` and `SearchPage.tsx`; the screen's route is kept in the browser history (`src/lib/route-history.ts`) so Back works. Moderation (the user removes a post or a topic) keeps a placeholder: everything that reads posts goes through `livePosts` (see `docs/DECISIONS.md`, "Moderation"). Tests: `test/forum-plugin.test.ts` (a simulated day with a restart, bump order, flags, the two-pass flow, pages, search, moderation).

## Decisions
See `docs/DECISIONS.md` for what the owner decided and where to continue.

## Roleplay import
`manifest.json` declares `reads` (Roleplay's cards and personas); only the `profiles` plugin has the `peer` permission. The plugin lists, imports and
refreshes cards through `host.peer`; a persona goes to Your profile (`/you/*`, `you.json`, `src/screens/you/`), not to the profile list (see `docs/DECISIONS.md`, "Roleplay import"); the screen side is `src/screens/profiles/import-api.ts` (list, runner, diff)
and `import.tsx`. In preview (`?screen=`) the same screens run on `src/mock/profiles-import.ts`.

## Language
`src/i18n/index.ts`: the UI language is `?lang=` (previews), else the user's choice (Settings > Language: Auto, English, Українська; `social:lang-pref`), else the app's language from `window.molfarShell.locale()` (cached in `social:shell-lang` so the next start has no flash), else English. The browser's language is only used outside the engine, where `locale()` fails. The engine has no "language changed" event; `followShellLanguage` asks again on focus, resize and visibility change, which is what happens when the app's tab comes back.

## Open items
- The app cannot read the shell's scheme yet: the theme comes from `?theme=`, then the last choice, then Vertep.
- The "Open Home" button needs engine 1.13.1 (`molfarShell.openHome`); on an older engine only the text hint shows.
- Forum: no preview of a post (dropped); the reply and new-topic prompts are not yet checked on a real model (issue #320).
