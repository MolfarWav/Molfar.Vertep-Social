// Drawing a custom emoji token inside a text, and a sticker as a whole message. A token whose pack or item is gone stays
// as plain text; a sticker whose pack is gone still shows its picture (the asset is kept) with its `alt` text.
import { Fragment } from "react";
import { findItem, splitTokens } from "./model";
import { usePacks } from "./packs";
import "./stickers.css";

/** The text with `:pack/item:` tokens drawn as small pictures. A text with no token comes back unchanged. */
export function RichText({ text }: { text: string }) {
  const packs = usePacks();
  if (!text.includes(":")) return <>{text}</>;
  const parts = splitTokens(text);
  if (parts.every((p) => "text" in p)) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => {
        if ("text" in p) return <Fragment key={i}>{p.text}</Fragment>;
        const hit = findItem(packs, p.pack, p.item);
        return hit ? <img key={i} className="stk-em" src={hit.item.url} alt={hit.item.name} title={hit.item.name} loading="lazy" draggable={false} /> : <Fragment key={i}>{p.raw}</Fragment>;
      })}
    </>
  );
}
