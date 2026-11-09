# The catalog of free sticker packs

What the pack manager's "Free packs" list shows (issue #348). Only the owner of this repository adds packs here; the plugin `stickers`
reads `index.json` and the pictures from this folder on GitHub when someone opens the list.

## Rules for a pack
- A licence of **CC0-1.0**, **CC-BY-4.0** or **MIT**, nothing else. Never a non-commercial (NC) or share-alike (SA) licence, never "free for personal use".
- The author, the licence and the source are in `index.json` and are shown on the card and on the pack after it is added. A pack that lacks one of them is ignored by the plugin.
- The licence text (MIT) or the credit and a list of changes (CC BY) is kept next to the pictures: `LICENSE` or `LICENSE.md`.
- Pictures are PNG, WebP or GIF, at most 512 KB each, drawn at the final size (a sticker up to 512 px, a custom emoji up to 64 px: nothing rescales an animation). Animated WebP is the best format for an animation.
- Ids and file names are letters, digits, `_` and `-` (file: `<id>.webp|png|gif`), at most 40 characters. An item id is what a character writes in `[[sticker: pack/item]]`.
- `<pack>/preview.png`: a small contact sheet (about 300x120 px, under 300 KB).
- Keep the folder small: every update of Social downloads it.

## index.json
`{ "version": 1, "packs": [{ "id", "name", "kind": "sticker" | "emoji", "description", "author", "license", "source": "https://...", "items": [{ "id", "name", "file", "tags": [] }] }] }`

`test/stickers-catalog.test.ts` checks all of it (files exist and are what their extension says, sizes, licences, no item dropped by the plugin).
