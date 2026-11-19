// The city's call (plugin `city`, issue #445). In the design preview (`?screen=city`) it answers from a fake.
import { PREVIEW, call } from "@/lib/api";

export interface CityPerson {
  id: string;
  name: string;
  hue: number;
  picture: string;
  status: string;
}

/** Opening hours: bands of three hours (0 to 8) and the weekdays from Monday (0). */
export interface Hours {
  from: number;
  to: number;
  days: number[];
}

export interface CityPlace {
  id: string;
  name: string;
  kind: string;
  icon: string;
  text: string;
  /** A small picture from before #452: shown on the tile only while the place has no background. */
  picture?: string;
  /** (#452) The wide picture of the place: behind the opened place, the room and a character's chat; the tile shows it cut square. */
  background?: string;
  district: string;
  tags: string[];
  /** Null for a grid the form cannot show. */
  hours: Hours | null;
  /** "stock" places have translated names; the others show the stored name. */
  by: "stock" | "you" | "pack";
  open: boolean;
  seats: number;
  people: CityPerson[];
}

/** (#458) Where the user put the buildings of a district's drawing: the lots of a grid `g` a side, numbered back to front. */
export interface DistrictLots {
  g: number;
  at: Record<string, number>;
}

export interface CityDistrict {
  id: string;
  name: string;
  kind: string;
  by: "stock" | "you";
  /** (#458) The hand-made order of the drawing; ignored while the grid has another size. */
  lots?: DistrictLots;
  /** (#452) The district's picture: behind its tiles. */
  background?: string;
  places: CityPlace[];
}

export interface CityDoor {
  id: string;
  name: string;
  hue: number;
  picture: string;
  flat: number;
  state: "lit" | "dark" | "out";
  /** The place id, only when the user knows the character well enough. */
  where?: string;
}

export interface CityView {
  band: number;
  from: number;
  to: number;
  districts: CityDistrict[];
  homes: { buildings: { id: string; n: number; doors: CityDoor[] }[] };
  homesDistrict: string;
  homesName: string;
  homesBy: "stock" | "you";
  homesBackground?: string;
  empty: boolean;
}

const p = (id: string, name: string, hue: number, status = "online"): CityPerson => ({ id, name, hue, picture: "", status });
/** A canned wide picture for the design preview (#452): sky, hills and a street line, tinted by the hue. */
export const fakeWide = (hue: number): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 72%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360} 45% 45%)"/></linearGradient></defs><rect width="320" height="180" fill="url(#s)"/><circle cx="250" cy="48" r="20" fill="hsl(45 90% 80%)"/><path d="M0 120q60-40 120-10t110-20 90 10v80H0z" fill="hsl(${(hue + 60) % 360} 35% 32%)"/><path d="M0 150h320v30H0z" fill="hsl(${hue} 20% 22%)"/><g fill="hsl(${hue} 25% 28%)"><rect x="30" y="96" width="40" height="54"/><rect x="80" y="80" width="30" height="70"/><rect x="200" y="90" width="50" height="60"/></g></svg>`)}`;
const MOCK: CityView = {
  band: 4,
  from: 12,
  to: 15,
  homesDistrict: "homes",
  homesName: "Homes",
  homesBy: "stock",
  // the preview's district picture (#452): the drawing gives way to it, the pins stay
  homesBackground: fakeWide(210),
  empty: false,
  districts: [
    {
      id: "centre",
      name: "Centre",
      kind: "centre",
      by: "stock",
      places: [
        { id: "cafe", name: "The cafe by the park", kind: "cafe", icon: "☕", text: "Coffee, cake and a table by the window.", background: fakeWide(30), by: "stock", open: true, seats: 6, district: "centre", tags: [], hours: { from: 2, to: 7, days: [0, 1, 2, 3, 4, 5, 6] }, people: [p("mavka", "Mavka", 150), p("lis", "Lis", 30)] },
        { id: "library", name: "The library", kind: "library", icon: "📚", text: "Quiet shelves, old maps and a reading room.", by: "stock", open: true, seats: 8, district: "centre", tags: [], hours: { from: 2, to: 7, days: [0, 1, 2, 3, 4, 5, 6] }, people: [] },
        { id: "cinema", name: "The small cinema", kind: "club", icon: "🎬", text: "One screen and an evening show.", by: "stock", open: false, seats: 10, district: "centre", tags: [], hours: { from: 2, to: 7, days: [0, 1, 2, 3, 4, 5, 6] }, people: [] },
      ],
    },
    { id: "nature", name: "Nature", kind: "nature", by: "stock", places: [{ id: "park", name: "The park", kind: "park", icon: "🌳", text: "Benches, old trees and a path around the pond.", by: "stock", open: true, seats: 20, district: "nature", tags: [], hours: { from: 2, to: 7, days: [0, 1, 2, 3, 4, 5, 6] }, people: [p("fox", "Fox", 20)] }] },
  ],
  homes: {
    buildings: [
      {
        id: "b1",
        n: 1,
        doors: [
          { id: "mavka", name: "Mavka", hue: 150, picture: "", flat: 1, state: "out", where: "cafe" },
          { id: "lis", name: "Lis", hue: 30, picture: "", flat: 2, state: "out" },
          { id: "fox", name: "Fox", hue: 20, picture: "", flat: 3, state: "lit" },
          { id: "kot", name: "Kit", hue: 260, picture: "", flat: 4, state: "dark" },
        ],
      },
    ],
  },
};

export interface ListenLine {
  id: string;
  by: string;
  name: string;
  hue: number;
  picture: string;
  at: number;
  text: string;
  via: "chatter" | "club";
}

export async function loadListen(place: string): Promise<{ present: number; lines: ListenLine[] }> {
  if (PREVIEW) {
    if (place !== "cafe") return { present: 0, lines: [] };
    const now = Date.now();
    return {
      present: 2,
      lines: [
        { id: "l1", by: "mavka", name: "Mavka", hue: 150, picture: "", at: now - 50 * 60000, text: "Did you hear the reeds last night? They sounded like a choir.", via: "chatter" },
        { id: "l2", by: "lis", name: "Lis", hue: 30, picture: "", at: now - 46 * 60000, text: "I heard the fox in the garden. The choir can wait.", via: "chatter" },
      ],
    };
  }
  return call<{ present: number; lines: ListenLine[] }>("GET", "/city/listen?place=" + encodeURIComponent(place));
}

/** Walks into a place: a room of the characters there (the clubs plugin). Resolves to {error: text or "", id of the room}. */
export async function walkIn(place: string, name: string): Promise<{ error: string; id: string }> {
  if (PREVIEW) return { error: "", id: "cl-1" };
  try {
    const r = await call<{ club: { id: string } }>("POST", "/clubs/room", { place, name });
    return { error: "", id: r.club.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), id: "" };
  }
}

export async function loadCity(): Promise<CityView> {
  if (PREVIEW) return MOCK;
  return call<CityView>("GET", "/city");
}

export interface PlaceInput {
  id?: string;
  name: string;
  district: string;
  kind: string;
  icon: string;
  text: string;
  tags: string;
  seats: number;
  picture: string;
  background: string;
  hours?: Hours;
}

const fail = (e: unknown): never => {
  throw e instanceof Error ? e : new Error(String(e));
};

export async function savePlace(v: PlaceInput): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/city/place", v).catch(fail);
}

export async function removePlace(id: string): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/city/place/remove", { id }).catch(fail);
}

export async function saveDistrict(v: { id?: string; name: string; kind: string; background?: string }): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/city/district", v).catch(fail);
}

/** (#458) Save where the buildings of a district stand; `null` puts them back in the tiles' order. */
export async function saveLayout(district: string, lots: DistrictLots | null): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/city/layout", { district, lots }).catch(fail);
}

export async function removeDistrict(id: string): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/city/district/remove", { id }).catch(fail);
}

export async function resetTown(): Promise<void> {
  if (PREVIEW) return;
  await call("POST", "/city/reset", {}).catch(fail);
}
