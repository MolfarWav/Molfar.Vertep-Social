// Mock cast used by every screen until the real profiles exist. Names come from
// each character's Soul in the real app; the hue is the avatar colour.
import type { Status } from "@/mock/status";

export interface MockProfile {
  id: string;
  name: string;
  hue: number;
  status: Status;
  /** An engine asset URL of the profile's picture (real mode); absent = the letter avatar. */
  picture?: string;
}

export const PROFILES: MockProfile[] = [
  { id: "mavka", name: "Мавка", hue: 150, status: "online" },
  { id: "yaryna", name: "Ярина", hue: 330, status: "online" },
  { id: "lisovyk", name: "Лісовик", hue: 100, status: "online" },
  { id: "pereles", name: "Перелесник", hue: 20, status: "away" },
  { id: "berehynia", name: "Берегиня", hue: 190, status: "away" },
  { id: "domovyk", name: "Домовик", hue: 40, status: "dnd" },
  { id: "chuhaister", name: "Чугайстер", hue: 260, status: "off" },
  { id: "horpyna", name: "Горпина", hue: 290, status: "off" },
  { id: "vodianyk", name: "Водяник", hue: 210, status: "off" },
];
export const ME = { name: "Ти", hue: 210 };
