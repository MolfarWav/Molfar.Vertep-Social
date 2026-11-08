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
- Quality and correctness over speed: the owner accepts that work moves to another account when tokens run out.

## State (end of the UI build)
- PR #1 on `MolfarWav/Molfar.Vertep-Social`, branch `claude/project-thread-cqeckz`. All screens run on mock data.
- Plugins `profiles`, `messenger`, `forum` are stubs (501). Model calls are fakes.
- Guide pages: `.skills/guide/pages/` (index, messenger, forum, profiles, settings); translations (`l10n/`) are not made.

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
3. Next steps in order: issue #310 (profiles plugin, engine read grant, messenger, forum autonomy, notifications, Store entry).
4. Rules that bit during the build: no model names in commits or files; a new string goes into `en` and `uk`
   (`test/skeleton.test.ts`); never start a Ukrainian label with a lone "З" (Inter draws it like "3").
