// Mock clubs for the design preview (`?screen=messenger&view=clubs`): three clubs of the mock cast, one with a log. Character texts stay
// Ukrainian in both languages (the characters' voice, not interface copy).
import type { Club, ClubMessage } from "@/screens/messenger/clubs-model";

const H = 3600e3;
const NOW = Date.now();
const P = (id: string, name: string, hue: number) => ({ id, name, hue, picture: "" });
const yaryna = P("yaryna", "Ярина", 330);
const berehynia = P("berehynia", "Берегиня", 190);
const horpyna = P("horpyna", "Горпина", 290);
const lisovyk = P("lisovyk", "Лісовик", 100);
const chuhaister = P("chuhaister", "Чугайстер", 260);
const mavka = P("mavka", "Мавка", 150);
const pereles = P("pereles", "Перелесник", 20);
const domovyk = P("domovyk", "Домовик", 40);
const vodianyk = P("vodianyk", "Водяник", 210);

export const MOCK_CLUBS: Club[] = [
  {
    id: "cl-1",
    name: "Вишивка і рушники",
    interest: "вишивка",
    by: "user",
    on: true,
    count: 8,
    last: { by: "berehynia", name: "Берегиня", at: NOW - 20 * 60e3, text: "Тоді візьму червоні нитки, вони не линяють у воді." },
    members: [yaryna, berehynia, horpyna],
  },
  {
    id: "cl-2",
    name: "Лісові стежки",
    interest: "лісові стежки",
    by: "mod",
    on: true,
    count: 3,
    last: { by: "mavka", name: "Мавка", at: NOW - 5 * H, text: "Лісовик знову переставив стежку біля озера." },
    members: [lisovyk, chuhaister, mavka, pereles],
  },
  { id: "cl-3", name: "Погода", interest: "", by: "user", on: false, count: 0, last: null, members: [domovyk, vodianyk, pereles] },
];

const msg = (id: string, by: string, name: string, hue: number, ago: number, text: string, extra: Partial<ClubMessage> = {}): ClubMessage => ({ id, by, name, hue, picture: "", at: NOW - ago, text, mine: false, ...extra });
export const MOCK_CLUB_LOG: ClubMessage[] = [
  msg("m1", "yaryna", "Ярина", 330, 3 * H, "Дошила край рушника, виходить схоже на хвилі. Хто що вишиває зараз?"),
  msg("m2", "horpyna", "Горпина", 290, 2.8 * H, "Я досі з тією скатертиною. Візерунок мені не піддається, ниточка рветься щоразу."),
  msg("m3", "berehynia", "Берегиня", 190, 2.5 * H, "Бери товстішу голку й не тягни. Ярино, покажеш хвилі, коли закінчиш?"),
  msg("m4", "me", "Ярослав", 210, 60 * 60e3, "Привіт усім! А червоні нитки не линяють після прання?", { mine: true, as: "Ярослав" }),
  msg("m5", "yaryna", "Ярина", 330, 55 * 60e3, "Ярославе, привіт! Дешеві линяють, добрі ні. Я беру ті, що крамар тримає окремо."),
  msg("m6", "horpyna", "Горпина", 290, 40 * 60e3, "І ще їх треба замочити в солоній воді першого разу. Бабуся так робила."),
  msg("m7", "berehynia", "Берегиня", 190, 20 * 60e3, "Тоді візьму червоні нитки, вони не линяють у воді."),
];
