// (#453) A stored place name in the page's language. Stories and journal posts keep the name of the place as it was when they were
// written; a stock place's name is the English one, so it is matched back to its id here and shown translated. Any other name (a place
// the user made or renamed) stays as it was written.
import { useT } from "@/i18n/index";
import { strings } from "./strings";

const PREFIX = "city.place.";
/** Keys under city.place. that are words of the page, not places. */
const NOT_PLACES = new Set(["add", "edit", "remove", "removeAsk"]);
const STOCK: Map<string, string> = new Map(
  Object.entries(strings.en ?? {})
    .filter(([k]) => k.startsWith(PREFIX) && !k.slice(PREFIX.length).includes(".") && !NOT_PLACES.has(k.slice(PREFIX.length)))
    .map(([k, v]) => [String(v), k]),
);

/** The key of a stock place whose English name is `name`, or "" for any other name. */
export const stockPlaceKey = (name: string): string => STOCK.get(name.trim()) ?? "";

export function usePlaceName(): (name: string) => string {
  const t = useT();
  return (name: string) => {
    const key = stockPlaceKey(name);
    return key ? t(key as never) : name;
  };
}
