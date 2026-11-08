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
- A character's card is never read after the one-time digest (no leaks into prompts).

## Layout
- `src/main.tsx`, `src/shell/`: top bar (desktop), bottom tabs (phone), nav context (`useNav`, `useChrome`, `BarActions`).
- `src/screens/<messenger|forum|profiles|settings>/`: one folder per screen with `index.tsx`, `<name>.css` (every rule scoped
  under `.s-<name>`), `strings.ts`, and the mock data it needs in `src/mock/`.
- `src/components/`: `Flower` (status flower + `Envelope`), `Avatar`, `Logo`. Shared, small.
- `src/styles/`: `tokens.css` (themes Vertep, Dark, Light; names are the ones the design boards use),
  `base.css` (root, `.av`, `.btn`, `.ib`), `shell.css`.
- `plugins/<profiles|messenger|forum>/`: backend plugins. Stubs for now (501).
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
Query: `screen=messenger|forum|profiles|settings`, `theme=vertep|dark|light`, `lang=en|uk`, and per-screen `view=` / `state=`
values documented in the screen's `index.tsx` header.

## Model calls
The profile interview and "Fill empty" go through `src/screens/profiles/model-api.ts`, a fake shaped like the Roleplay `profile` plugin routes (`/profile/persona-ideas`, `/profile/fill`). The real calls come from adapting `plugins/profile/plugin.js` of Roleplay into `plugins/profiles/`.

## Decisions
See `docs/DECISIONS.md` for what the owner decided and where to continue.

## Open items
- The app cannot read the shell's scheme yet: the theme comes from `?theme=`, then the last choice, then Vertep.
- Reading Roleplay data needs an engine grant (separate engine work).
