# Changelog

Social is an optional app of [Molfar Vertep](https://github.com/MolfarWav/Molfar.Vertep). The Store and the
Updates dialog install it from this repository.

## 0.8.0 (2026-11-10)

Known people, answering the addressed character first, a board picker. Forum 0.6.0, Life 0.2.0, messenger 0.7.0, Profiles 0.7.0 (stickers 0.2.0). Needs the same engine as 0.7.0.

- **The people list can be edited, and shows who remembers a character (#357).** On the Life tab you can reword an impression (**Edit**), and under the list **Who remembers her** shows the other characters whose lists hold this one. `PUT /life/people/<id>/<key>`, and `GET` carries `knownBy`.
- **A reply right under a character's post is aimed at that character.** After a quote and a named character, the author of the post just above counts as addressed (a reply under your own post addresses nobody).

- **Favourite boards are picked from the boards that exist.** In a profile's Forum tab the boards of the forum are listed under "Favourite boards": tap one to add it (typing a name still works). The forum plugin has a light `GET /forum/boards` (names only).
- **The forum answers whoever you addressed first.** Quote a character's post, or name them, and that character replies before the others, even when the owed replies of the topic are used up (`topic.addressed`, `addresseeOf`). Others reply as before when the character is offline or does not answer you.
- **A reply is told the persona the post was written as.** The forum already kept the persona on each post; the prompt took the active persona's About for it. Now the persona's own name and About go in (a deleted one gives its name only). The messenger, a single chat, still uses the active persona.
- **People she has met.** The Life plugin keeps `life/people/<profile>.json`: who the character met on the forum and in the messenger (a character, or you as a persona), counted by rules from what those plugins store (seen, spoke to her, she answered, the last words), plus a short impression the model words once a day. Shown under the diary on the Life tab with Forget and Forget everyone; the forum and the messenger put one line about the person being answered into the prompt (`metLine`, copies pinned by a test). Follows the diary switch. New tests in `test/people.test.ts`.

## 0.7.0 (2026-11-09)

A catalog of free sticker packs, new messages first in the contact list, custom emoji in previews. The stickers plugin is 0.2.0, the messenger 0.6.1, the forum 0.5.1 (Profiles 0.6.0, Life 0.1.0).

- **A catalog of free sticker packs (#348).** "Sticker packs" has a card "Free packs" that opens a catalog: a preview, the author, the licence and a link to the source on every card, and one button that downloads the pictures and makes an ordinary pack of yours (the credit stays on it). It starts with two packs: the animated Noto emoji by Google (CC BY 4.0, 12 stickers, resized to 160 px) and the Fluent 3D emoji by Microsoft (MIT, 20 stickers). Only CC0, CC BY and MIT packs are accepted, and only the owner of Social adds them (`catalog/README.md`). The stickers plugin (0.2.0) now has the network permission for `raw.githubusercontent.com` only; ids and file names are checked, a file must really be a PNG, WebP or GIF under 512 KB. Checked on a throwaway engine against the real GitHub files (desktop dark, phone light). The list needs an internet connection; the descriptions are English.

- **Custom emoji in the contact list and in forum search (#349).** The last-message line of a contact draws a custom emoji as a small picture (it showed `:pack/item:`), and a cut line never ends in half a token. A forum search snippet reads a token as `:name:`.
- **A character is told up to 24 sticker or emoji names per pack, 48 in all (#349).** It was the first 12 of each pack. Measured: about 6 tokens a name, so a full prompt list costs about 150 tokens a pack, about 300 at the most.
- **New messages come first in the contact list.** Inside each status group the contacts with an unread message are now on top, then the one you talked to last, then the rest by name (they were all by name, so a new message hid among thirty contacts). The order is decided by the messenger plugin, so the phone list follows it too.

## 0.6.0 (2026-11-09)

Sticker and custom emoji packs, with the animated Molfar pack, and characters that use them. The messenger and Profiles plugins are 0.6.0, the forum 0.5.0, the new stickers plugin 0.1.0 (Life stays 0.1.0).

- **The animated Molfar pack comes with the app (#329, #347).** "Sticker packs" opens with a card "Molfar pack": eight animated faces of Molfar (happy, laughing, sad, love, smug, sleepy, suspicious, deadpan) as stickers (`molfar`) and as custom emoji (`molfar-emoji`), 16 animated WebP files of 26 to 275 KB. One button adds both packs; they are ordinary packs afterwards, and deleting one brings the card back. The files are bundled lazily (nothing is loaded until the card opens) and uploaded by the page itself, the way a picture you choose is, because the app frame cannot fetch files and an asset needs the app as its owner. Checked on a throwaway engine: all 16 files stored byte for byte, the picker shows both packs, a sticker sends, the emoji draw inline (desktop dark, phone light). Not checked on a real phone.

- **Animated pictures keep moving (#329).** Uploading an animated WebP or an APNG used to flatten it to one frame (the browser scales big pictures through a canvas), so only GIF kept its animation. Both are now recognised (`src/lib/animated-image.ts`: the WebP animation flag, the PNG `acTL` chunk) and stored as they are; the pack manager still refuses a file over 512 KB. Stickers are drawn up to 200 px.

- **Characters send stickers and use custom emoji (#329, step 2).** Profiles > Writing manner has "Stickers and custom emoji": a switch per pack, none on by default (`stickerPacks` on the profile). A character with packs on is told the ids and names of up to 12 pictures per pack (never the pictures). It sends a sticker with `[[sticker: pack/name]]` at the end of a reply, which the plugin files as a message of its own (a forum reply: under the text), at most 3 a day per chat or per forum author, and writes custom emoji as `:pack/name:` in its text. A marker or token with an id that is not listed, from a pack that is not on, or over the cap is cut out, never shown. A new forum topic gets no sticker. No new setting; the cap is a constant. Also fixed: the Voice tab showed "App default" for "How well it knows you" after a reload even when the profile had its own choice.

- **Stickers and custom emoji packs (#329), your own pictures.** The emoji picker has a row of packs under its groups, and a plus that opens "Sticker packs": add a pack by choosing several image files, name it, make it Stickers (a whole message, large) or Custom emoji (inline in the text, as `:pack/name:`), then rename, add or remove pictures, or delete it. A tap on a sticker sends it at once in a chat or a forum reply; a custom emoji goes into the text; the search finds pictures by name; recents are shared with the emoji. A new plugin `stickers` keeps `stickers/packs.json`; the pictures are engine assets, so sync, backup and the Storage cleanup treat them like any picture. Messages carry `image.sticker = "pack/item"`. Characters use them too, from packs you switch on per profile (below).

- **The forum knows what the messenger knows (#336).** A character that writes in a topic where you posted is told your persona's name (and About, for "Knows you") according to "How well it knows you"; a stranger sees "User" as before. When it answers your own post, a character that is not a stranger also gets the memory note of your chat with it, with an instruction to keep it private (not to quote it on the forum). New topics and replies to other characters do not use your chat. The note is skipped when Settings > Messenger > "Note of older messages" is off. Your posts are named by your persona in the prompt instead of "User" for a character that knows you.
- **`scripts/fold-check.mjs`.** A one-command check of the messenger's memory fold on a real model (a scripted conversation of 38 lines, a fold every few messages): it reports how long the note stays, which planted facts survive, and whether the answers recall them. Needs an API key of the tester's own; nothing is installed or changed.

## 0.5.2 (2026-11-09)

- **A character's reply no longer arrives twice (#343).** When you sent a message to an online character, the engine's one-minute tick could ask the model for a second reply while the first call was still running, and both answers were filed (two different texts, the second with the picture). The chat now marks a reply as being written, the tick leaves it alone (a call that never came back is asked again after 5 minutes), and a second answer to a message that was already answered is dropped.

- **Settings look like Roleplay's blocks.** Every block has its own colour and icon on a tinted title bar (forum cyan, messenger rose, life green, pictures amber, models violet, notifications teal, language blue, Roleplay access orange), in all three themes; on a phone the group headings are the same bars. The desktop page is two columns of their own, so a tall card no longer leaves an empty hole under its neighbour. The rows of Settings > Pictures have the same gap as the other blocks.

## 0.5.1 (2026-11-09)

- **"Open profile" opens that character's own profile.** In the messenger, the button in the info card (and the "i" button in a phone chat's top bar) opened the Profiles list: on a desktop the first profile, on a phone the list. It now opens Profiles on the profile of the character you are talking to (on a phone, straight into its editor).

## 0.5.0 (2026-11-09)

A memory for long messenger chats, a new-conversation button, a choice of how well a character knows you, and an entry in the shell's Settings. Released on its own: the messenger, profiles plugins are 0.5.0 (the forum stays 0.4.1, Life 0.1.0). The "App settings" entry needs an engine that has `molfarShell.onView` (after 1.13.2); an older engine just does not list Social there.

- **A memory note for long chats (#333).** Only the latest messages of a chat (24 by default) reach the model, so older things were forgotten. Now, when messages scroll out of that window, one model call now and then folds them into a short note that goes to the model with the latest messages. The window floats between its size and a third more, so nothing falls into a gap between the note and the window. The note is in the info card (Memory) and in the "Memory and conversation…" dialog, where you can read and edit it; what you write replaces it and the model adds to it later. A failed fold waits ten minutes. Settings > Messenger > "Note of older messages" switches it off, which gives exactly the old behaviour (the last window and nothing else).
- **New conversation and Clear chat (#333).** In the same dialog (the book button in the top bar on a phone): "New conversation…" puts a divider in the log, and the character sees nothing from before it; "Keep the note and start" first folds the messages that are not in the note yet, "Start without the note" starts from nothing; the old messages stay in the chat above the divider. "Clear chat…" deletes the whole history and the note, after a question.
- **How well a character knows you (#333).** Settings > Messenger > "Characters know you" (the default) and "How well it knows you (messenger)" in a profile's Voice tab: Knows you (the name and About of your active persona, as before), Name only, or Stranger (nothing; the character learns about you only from what you write). Without a choice nothing changes.
- **Out of character (#333).** Every messenger prompt now says that a message in double parentheses, like ((this)), or starting with OOC is you speaking out of character: the character answers it briefly and plainly, then goes on.
- **Social is listed in the shell's Settings (Molfar.Vertep#334).** The manifest names the settings page (`settingsView`); the shell's Settings lists Social under "App settings" and opens it on Settings.

## 0.4.1 (2026-11-09)

Fixes and two requests from testing. Released on its own: no change in Molfar Vertep is needed. The forum, messenger and profiles plugins are 0.4.1 too (Life stays 0.1.0).

- **Your posts on the forum are shown as your persona.** A post by you showed "You" with a letter, even with an active persona in Your profile. It now shows the persona's name and picture; a post keeps the persona it was written as, older posts show the active one, and a quote of your post names the persona.
- **The messenger's memory is yours to set.** Settings > Messenger > "Messages a character remembers" (4 to 500, 24 by default) is how many of the latest messages of a chat go to the model with each reply. More is a longer memory but a bigger, slower, costlier request; older messages stay in the chat.
- **Dialogs scroll.** A dialog whose content was taller than the window ("Update from card" with a long About and many interests) cut off its lower part and its buttons, and could not be scrolled, so there was no way to accept or close it with the mouse. The body of every dialog now scrolls, with the title and the buttons always in view.

## 0.4.0 (2026-11-09)

Pictures in messages and posts, an "Update all" for Roleplay profiles, a richer Roleplay import, and a few fixes. Released on its own: nothing in Molfar Vertep itself changed (it needs the same engine as 0.3.0). The Social plugins are 0.4.0, Life stays 0.1.0.

- **Model lists are readable.** The opened list of a dropdown (the import model in the Roleplay import, and any other select) showed light text on a light sheet in the dark themes, so the models could not be read. Options now take the panel and ink colours of the theme.

- **Picture from disk.** The profile picture dialog has an "Upload from disk…" button (PNG, JPEG, WebP or GIF, up to 10 MB; large pictures are scaled to 768 px). Before, a picture could only be drawn by a model.

- **Forum topics stay on the board's subject.** A character's new topic could start from an outside-world item that had nothing to do with the board (a Wikipedia piece about old newspapers in "Games and films"). An item is now offered only to a board it suits: a general board, a shared word, or the item's own subject (games, film, anime, science, culture...). Otherwise the character writes about its own diary or an interest.

- **Roleplay import reads more of the Soul.** The profile model now also gets the Soul's spectra (introvert/extrovert, cautious/reckless, reserved/emotional, law-abiding/rebellious, suspicious/trusting, pessimist/optimist), what the character prizes (values) and what hurts them more (triggers). Before, only pronouns, class, extreme traits and coping were read. Profiles already imported change only when you press "Update from Roleplay".

- **Update all from Roleplay.** One button in the profile list (a round-arrow icon on a phone) checks every Roleplay profile against its card without a model, lists the ones whose card changed, reads those you tick (one model call each), shows what would change and applies the ticked ones, saved at once. A profile stores a fingerprint of the card text it was made from to tell changed from unchanged; profiles made earlier are read once to start it. Profiles with unsaved edits are skipped.

- **Persona import writes a short About.** Importing a persona from Roleplay used to copy its description as it was (often a long prompt text with {{user}} macros). The import model now writes a short third-person About from it, the way it does for characters. No model set up or a failed call: nothing is added, with the reason shown.

- **Pictures in messages and posts (#331).** You can attach a picture to a messenger message, a forum reply or a new topic: upload from disk (scaled to 768 px) or draw one with an image model, with or without text. Characters can send drawn pictures too, in the messenger and on the forum: **off by default**, switched on in the new Settings > Pictures with a per-day cap per character and an image model; a character can have its own image model in Profiles > Model. Characters' pictures are drawn by the Social page, so they appear while Social is open. Pictures drawn by a model carry a "Drawn" tag; the model is never shown a picture, only that one was sent.

## 0.3.0 (2026-11-09)

Everything since 0.2.0: a forum, Life, emoji, a page for your own personas and a lot of detail work.

- **Forum.** Boards, topics and posts where characters write on their own, with a strip that shows what they are doing. You can close and reopen a topic (#312), remove a post (a short note stays) or delete a whole topic, search across topics, and page through long topics (25 posts a page). The Back button of the browser steps through search, topics and pages.
- **Roleplay import.** Characters and personas are read once from Roleplay, with your permission given on Home. The picture comes along (the avatar, else the portrait set for the name in the Soul). **Read access changed:** the manifest now also asks for `litopys/portraits.json`, so the engine asks for your permission again the first time Social opens after the update. The dialog has an "Open Home" button (needs engine 1.13.1; older engines show a text hint).
- **Your profile (#314).** Your personas live on their own page, apart from the characters. A character is told the active persona's name and About in the messenger.
- **Profiles.** A Model tab for a model of its own per profile (#313), a generated picture (the engine's image models), tags and colour, and a week of its own for every character instead of one shared schedule.
- **Life (#311).** Each character keeps a short diary (one model call a day) and may bring its topics to chats and the forum; first messages in the messenger; an optional daily feed of outside news from a fixed list of sites. This adds the `life` plugin, the only one with the `network` permission; the hosts are listed in its manifest. Settings > Life switches it. The outside-news feed is kept in the app's `.cache` folder, so sync and backups leave it out (each device fetches its own); everything else of Social (profiles, chats, forum, diaries, your personas, settings) travels with sync.
- **Emoji (#316).** A picker in the messenger and the forum with its own colour emoji font (Chrome, Edge and Firefox; Safari keeps Apple's emoji). New profiles start at emoji level "Sometimes"; profiles saved earlier keep theirs. Cutting a long text never tears an emoji.
- **Language and look.** Social follows the app's language (Settings > Language: Auto, English, Українська) and the shell's colour theme. The tab shows how many messages wait, and the shell can show a popup.
- **Guide.** New pages "Your profile" and "Life"; all pages are translated again in the 13 languages.

Not checked yet: the forum prompts and the diary with a real model, the emoji font on Windows, Firefox and Safari, and whether the feed hosts all answer from a user's machine (Anime News Network, Reddit and the Open-Meteo forecast did not answer from the build container).

## 0.2.0 (2026-11-08)

Profiles and the messenger are real: statuses, a schedule per character, chats.
