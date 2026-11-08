// Mock data for the Roleplay import and the "update from card" diff. The cards
// and their titles are data: they stay as the approved boards write them.
import { plain, type MockProfile } from "@/mock/profiles";

export type ImportKind = "character" | "persona" | "narrator";

/** One row of the import list. Members of a narrator carry `parent`. */
export interface ImportEntry {
  id: string;
  /** Soul name (or the card title when there is no Soul). */
  name: string;
  /** Card title; empty for members, which take their note from the narrator. */
  card: string;
  /** False: the card has no Soul, so the name comes from the card. */
  soul: boolean;
  hue: number;
  kind: ImportKind;
  parent?: string;
}

export const IMPORT_ENTRIES: ImportEntry[] = [
  { id: "mavka", name: "Мавка", card: "Мавка з озера v3", soul: true, hue: 150, kind: "character" },
  { id: "yaryna", name: "Ярина", card: "Ярина, основна", soul: true, hue: 330, kind: "character" },
  { id: "lisovyk", name: "Лісовик", card: "forest_keeper_final", soul: true, hue: 100, kind: "character" },
  { id: "pereles", name: "Перелесник", card: "Перелесник (нова редакція)", soul: true, hue: 20, kind: "character" },
  { id: "berehynia", name: "Берегиня", card: "Берегиня", soul: false, hue: 190, kind: "character" },
  { id: "verhy", name: "Хроніки Верхи", card: "Хроніки Верхи", soul: true, hue: 270, kind: "narrator" },
  { id: "horpyna", name: "Горпина", card: "", soul: true, hue: 290, kind: "character", parent: "verhy" },
  { id: "chuhaister", name: "Чугайстер", card: "", soul: true, hue: 260, kind: "character", parent: "verhy" },
  { id: "vodianyk", name: "Водяник", card: "", soul: true, hue: 210, kind: "character", parent: "verhy" },
  { id: "mandrivnyk", name: "Мандрівник", card: "", soul: true, hue: 210, kind: "persona" },
];

/** The import list's profiles: everything but the narrator row itself. */
export const IMPORT_PROFILES = IMPORT_ENTRIES.filter((e) => e.kind !== "narrator");

/** Mock: this card fails once with "the model did not answer" and succeeds on retry. */
export const FAILING_IDS = new Set(["chuhaister"]);

/** A profile created from an imported entry (the narrator is not a profile). */
export function profileFromEntry(e: ImportEntry): MockProfile {
  const source = e.kind === "persona" ? "persona" : "roleplay";
  return {
    ...plain(e.id, e.name, e.hue, source, "Імпортовано з картки. Опис ще порожній."),
    card: e.card || undefined,
    cardDate: source === "roleplay" ? "9 листопада" : undefined,
  };
}

/** "Оновити з Roleplay": what the new reading of the card changes. Mock for Мавка. */
export const UPDATE_DIFF = {
  removed: ["Мешканка озера. Говорить повільно."],
  added: ["Мешканка озера, що сердиться на тин. Говорить повільно.", "Інтерес: чутки про Перелесника"],
  about: "Мешканка озера, що сердиться на тин. Говорить повільно.",
  interest: "чутки про Перелесника",
};
