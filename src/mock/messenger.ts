// Mock data for the messenger screen: the contacts (the cast from characters.ts
// plus what the boards show about each one) and a short chat log per contact.
// Character texts (status lines, schedules, messages) stay Ukrainian in both
// languages: they are the character's voice, not interface copy.
import { PROFILES, type MockProfile } from "@/mock/characters";
import type { MsgImage } from "@/pictures/MsgPicture";

export interface Contact extends MockProfile {
  /** One line under the name in the contact list. */
  line: string;
  /** The text after the status word in the chat header. */
  note: string;
  /** Ukrainian dative ("Написати {to}…") and genitive ("Повідомлення для {of}"). */
  to: string;
  of: string;
  unread: boolean;
  /** Shows "{name} друкує…" at the end of the log. */
  typing: boolean;
  schedule: string;
  reply: string;
  first: string;
}

/** A log line: a message, or a dashed system line that names the contact. */
export type LogItem =
  | { kind: "msg"; who: string; time: string; text: string; image?: MsgImage }
  | { kind: "sys"; key: string }
  /** A "new conversation" divider (real mode only): the time it was made, ms. */
  | { kind: "break"; at: number };

type Extra = Omit<Contact, keyof MockProfile>;

const EXTRA: Record<string, Extra> = {
  mavka: {
    line: "слухає шелест очерету", note: "слухає шелест очерету", to: "Мавці", of: "Мавки",
    unread: false, typing: true,
    schedule: "Вечори, 18:00–24:00. Зараз за розкладом вона онлайн.",
    reply: "Приходить за кілька секунд: вона онлайн.",
    first: "Іноді, поки онлайн.",
  },
  yaryna: {
    line: "шиє рушник", note: "шиє рушник", to: "Ярині", of: "Ярини",
    unread: true, typing: false,
    schedule: "Ранки й вечори, між роботою над рушниками.",
    reply: "Відповідає, коли дошиє шов.",
    first: "Часто, сама першою.",
  },
  lisovyk: {
    line: "переставляє стежки", note: "переставляє стежки", to: "Лісовику", of: "Лісовика",
    unread: false, typing: false,
    schedule: "Вдень спить, вночі ходить стежками.",
    reply: "Швидко, якщо не заблукав.",
    first: "Рідко.",
  },
  pereles: {
    line: "повернусь за годину", note: "відповідає за кілька хвилин", to: "Перелеснику", of: "Перелесника",
    unread: false, typing: true,
    schedule: "Ночами, у полі.",
    reply: "За кілька хвилин, якщо не в дорозі.",
    first: "Майже ніколи.",
  },
  berehynia: {
    line: "збирає хмиз", note: "збирає хмиз", to: "Берегині", of: "Берегині",
    unread: false, typing: false,
    schedule: "Вдень, біля води.",
    reply: "Після того, як складе хмиз.",
    first: "Іноді.",
  },
  domovyk: {
    line: "сплю, не будіть", note: "спить, не будіть", to: "Домовику", of: "Домовика",
    unread: false, typing: false,
    schedule: "Лише вночі, коли в хаті тихо.",
    reply: "Тоді, коли прокинеться.",
    first: "Не першим, поки спить.",
  },
  chuhaister: {
    line: "був 3 години тому", note: "був 3 години тому", to: "Чугайстеру", of: "Чугайстера",
    unread: false, typing: false,
    schedule: "Лісові маршрути, без розкладу.",
    reply: "Коли повернеться з гір.",
    first: "Рідко.",
  },
  horpyna: {
    line: "була вчора", note: "була вчора", to: "Горпині", of: "Горпини",
    unread: false, typing: false,
    schedule: "Вечори, після вечері.",
    reply: "Наступного дня.",
    first: "Іноді, пише вранці.",
  },
  vodianyk: {
    line: "був 2 дні тому", note: "був 2 дні тому", to: "Водянику", of: "Водяника",
    unread: false, typing: false,
    schedule: "Без розкладу, поки тече вода.",
    reply: "Коли спаде спека.",
    first: "Ніколи.",
  },
};

export const CONTACTS: Contact[] = PROFILES.map((p) => ({ ...p, ...EXTRA[p.id] }));

export const LOGS: Record<string, LogItem[]> = {
  mavka: [
    { kind: "msg", who: "mavka", time: "21:02", text: "Ти довго мовчав. Я вже думала, ти заблукав у чужому лісі." },
    { kind: "msg", who: "me", time: "21:03", text: "Було багато справ. Що нового біля озера?" },
    { kind: "msg", who: "mavka", time: "21:03", text: "Вода тиха. Лісовик знову переставляє стежки, а Ярина лишила на форумі ціле оповідання про рушники. Зазирни." },
    { kind: "msg", who: "me", time: "21:04", text: "Зазирну. А ти там що писала?" },
  ],
  pereles: [
    { kind: "msg", who: "me", time: "20:41", text: "Тин біля криниці лежить. Це твоя робота?" },
    { kind: "sys", key: "messenger.log.away" },
    { kind: "msg", who: "pereles", time: "20:55", text: "Я до світанку був у полі. Спитай у Лісовика." },
    { kind: "msg", who: "me", time: "20:56", text: "Спитаю." },
  ],
  horpyna: [
    { kind: "msg", who: "me", time: "19:10", text: "Ти вчора казала, що допишеш пісню про рушники. Допишеш?" },
  ],
};
