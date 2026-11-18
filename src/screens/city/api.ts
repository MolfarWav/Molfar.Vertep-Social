// The city's call (plugin `city`, issue #445). In the design preview (`?screen=city`) it answers from a fake.
import { PREVIEW, call } from "@/lib/api";

export interface CityPerson {
  id: string;
  name: string;
  hue: number;
  picture: string;
  status: string;
}

export interface CityPlace {
  id: string;
  name: string;
  kind: string;
  icon: string;
  text: string;
  /** "stock" places have translated names; the others show the stored name. */
  by: "stock" | "you" | "pack";
  open: boolean;
  seats: number;
  people: CityPerson[];
}

export interface CityDistrict {
  id: string;
  name: string;
  kind: string;
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
  empty: boolean;
}

const p = (id: string, name: string, hue: number, status = "online"): CityPerson => ({ id, name, hue, picture: "", status });
const MOCK: CityView = {
  band: 4,
  from: 12,
  to: 15,
  homesDistrict: "homes",
  empty: false,
  districts: [
    {
      id: "centre",
      name: "Centre",
      kind: "centre",
      places: [
        { id: "cafe", name: "The cafe by the park", kind: "cafe", icon: "☕", text: "Coffee, cake and a table by the window.", by: "stock", open: true, seats: 6, people: [p("mavka", "Mavka", 150), p("lis", "Lis", 30)] },
        { id: "library", name: "The library", kind: "library", icon: "📚", text: "Quiet shelves, old maps and a reading room.", by: "stock", open: true, seats: 8, people: [] },
        { id: "cinema", name: "The small cinema", kind: "club", icon: "🎬", text: "One screen and an evening show.", by: "stock", open: false, seats: 10, people: [] },
      ],
    },
    { id: "nature", name: "Nature", kind: "nature", places: [{ id: "park", name: "The park", kind: "park", icon: "🌳", text: "Benches, old trees and a path around the pond.", by: "stock", open: true, seats: 20, people: [p("fox", "Fox", 20)] }] },
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
