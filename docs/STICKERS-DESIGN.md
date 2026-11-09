# Stickers and custom emoji packs: design (#329)

Status: proposal for the owner. Nothing is built. Read "Decisions" first; the rest is the reasoning behind the recommendations.

## What exists that this builds on (checked in the code, 2026-11-09)
- Messages and posts are `{id, who/by, at, text, image?}`. `image` is `{state: "ready", url: "/v1/assets/<id>", alt?, gen?}` (`cleanImage` in both plugins). It already travels through the plugin round trip, the history sent to a model (as `[a picture: ...]`, never the bytes), search, and the `MsgPicture` component draws it.
- A page uploads a file with `PUT /v1/assets?name=` (`uploadPicture`); the asset belongs to Social, lives in the engine's `assets-store/`, travels with the sync/backup media, and is protected from the Storage cleanup as long as any file of the user's folder mentions its id (the scan counts any 64-hex string in any text file). A pack manifest that lists the URLs is such a file.
- The picker (`src/emoji/`) is a popover/tray with groups, search, recents. The plugins strip `<...>` tags from model text and cut by code points; a token like `:pack/name:` has neither.

## Decisions (owner picks; recommendation first)

1. **Sticker, custom emoji, or both.** Recommended: **both, one format, a flag per pack** (`kind: "sticker" | "emoji"`). A sticker is a whole message (large, alone, no text); a custom emoji is a small image inside a text line. Same files, same manifest, two ways to draw. Cheaper than two systems, and Telegram and Discord users expect both.
2. **How a pack gets in.** Recommended: **select several image files in one dialog** (a pack = the files chosen, named by the folder or by what the user types). A zip comes second (needs a small unzip library in the page bundle: to check, not assumed). Not a link: nothing is fetched from the internet at run time. Limits: PNG, WebP, GIF, JPEG; **no SVG** (it can carry script and needs sanitising we do not want to own); 512 KB per file, 200 items per pack; stickers scaled to 512 px, custom emoji to 64 px on the long side, in the browser, like pictures are today (GIF left alone).
3. **Where the files live.** Recommended: **engine assets** (`PUT /v1/assets`) plus a manifest in the app's data folder, `stickers/packs.json`: `{packs: [{id, name, kind, items: [{id, name, url, tags?}]}]}`. The manifest is app data, so sync, backup and the cleanup protection come for free. Rejected: files under the app's `data/` (a page cannot write binary files there; only plugins write there, and they have text only).
4. **How a message stores one.**
   - **Sticker:** the existing `image` field with a flag: `{state: "ready", url, alt, sticker: "pack/item"}` and empty `text`. Old code shows it as a picture; `cleanImage` keeps only the fields it knows, so it gets one new field in both plugins (the block between `images-shared` markers, which a test pins as identical).
   - **Custom emoji inside text:** the token `:pack/item:` (letters, digits, `_`, `-`, at most 40 characters each). The page replaces a token that exists in the manifest by `<img>`; an unknown token stays plain text. Tokens survive `cut()` (only a half token at the very end could be cut: the cut drops it) and survive tag stripping. The model sees the token as text.
   - Both stay readable if the pack is deleted later: a sticker shows its `alt` text, a token shows as text.
5. **The picker.** Recommended: **a tab per pack next to the Unicode groups**, search by item name and tags (shared search box), recents shared with Unicode (store `:pack/item:` in the same list). A sticker tap **sends at once** (like Telegram); a custom emoji inserts the token at the caret like a Unicode one. Phone: same tray; the pack tabs scroll sideways.
6. **Characters.** Recommended: **a character may send a sticker or use custom emoji only from packs the user switched on for it** (per-profile list in the Writing manner tab; default off, same spirit as pictures). The prompt lists at most 12 items of each allowed pack as `id: name` and says: use a sticker as a whole message with `[[sticker: pack/item]]`, custom emoji as `:pack/item:`, never invent an id. An unknown id is dropped (the marker is cut out of the text, like the `[[image: ...]]` marker today). A per-day cap like pictures (default 3 stickers per character per day) so a chatty character does not flood a chat.
7. **Source of packs.** Recommended: **the user's own files only for the first version.** A shipped starter pack needs a licence we can state (own drawings, or CC0); that is a content task, not a code task, and can follow. Nothing from the internet.

## Cost and size (estimate, not measured)
- Page: pack dialog + manager (add, rename, delete, reorder), picker tabs, sticker/emoji rendering, `MsgPicture` variant, profile list: the larger half. About one session of work with a browser check, plus one for the character side.
- Plugins: a field in the shared image block, a token parser, the prompt part, marker handling, caps; tests for each. Small.
- Strings in `en` and `uk` for every new label (`test/skeleton.test.ts` pins both), one new guide page `stickers.md` plus lines in messenger/forum/profiles, translations refreshed at release.

## Risks
- **Prompt size on free small models:** 12 items per allowed pack with short names costs a few hundred tokens; measure with `estimateTextTokens` before shipping, and keep the list off by default.
- **Storage growth:** 200 items at 512 KB is up to 100 MB per pack worst case; show the pack's size in the manager and warn above 50 MB.
- **Two devices:** a manifest edited on both is last-writer-wins at the file level (same as profiles today); assets are content-addressed, so nothing is lost, only an item list may need re-adding.
- **Animated stickers:** GIF only; Lottie/TGS and WebP animation are out of scope.

## Suggested order
1. Packs, the manager, sticker and custom emoji rendering, the picker tabs (the user's own use).
2. Characters: per-profile switch, prompt, markers, caps.
3. A starter pack, once a licence is settled.
