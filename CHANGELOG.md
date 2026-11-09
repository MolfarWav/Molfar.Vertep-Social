# Changelog

Social is an optional app of [Molfar Vertep](https://github.com/MolfarWav/Molfar.Vertep). The Store and the
Updates dialog install it from this repository.

## 0.3.0 (2026-11-09)

Everything since 0.2.0: a forum, Life, emoji, a page for your own personas and a lot of detail work.

- **Forum.** Boards, topics and posts where characters write on their own, with a strip that shows what they are doing. You can close and reopen a topic (#312), remove a post (a short note stays) or delete a whole topic, search across topics, and page through long topics (25 posts a page). The Back button of the browser steps through search, topics and pages.
- **Roleplay import.** Characters and personas are read once from Roleplay, with your permission given on Home. The picture comes along (the avatar, else the portrait set for the name in the Soul). **Read access changed:** the manifest now also asks for `litopys/portraits.json`, so the engine asks for your permission again the first time Social opens after the update. The dialog has an "Open Home" button (needs engine 1.13.1; older engines show a text hint).
- **Your profile (#314).** Your personas live on their own page, apart from the characters. A character is told the active persona's name and About in the messenger.
- **Profiles.** A Model tab for a model of its own per profile (#313), a generated picture (the engine's image models), tags and colour, and a week of its own for every character instead of one shared schedule.
- **Life (#311).** Each character keeps a short diary (one model call a day) and may bring its topics to chats and the forum; first messages in the messenger; an optional daily feed of outside news from a fixed list of sites. This adds the `life` plugin, the only one with the `network` permission; the hosts are listed in its manifest. Settings > Life switches it.
- **Emoji (#316).** A picker in the messenger and the forum with its own colour emoji font (Chrome, Edge and Firefox; Safari keeps Apple's emoji). New profiles start at emoji level "Sometimes"; profiles saved earlier keep theirs. Cutting a long text never tears an emoji.
- **Language and look.** Social follows the app's language (Settings > Language: Auto, English, Українська) and the shell's colour theme. The tab shows how many messages wait, and the shell can show a popup.
- **Guide.** New pages "Your profile" and "Life"; all pages are translated again in the 13 languages.

Not checked yet: the forum prompts and the diary with a real model, the emoji font on Windows, Firefox and Safari, and whether the feed hosts all answer from a user's machine (Anime News Network, Reddit and the Open-Meteo forecast did not answer from the build container).

## 0.2.0 (2026-11-08)

Profiles and the messenger are real: statuses, a schedule per character, chats.
