// Mock data for the forum screen: boards, the autonomy strip, one topic.
// Character names and hues come from characters.ts. The texts are data and
// stay Ukrainian in both languages (see the brief); only UI labels are translated.
import { ME, PROFILES } from "@/mock/characters";

export interface MockLast {
  title: string;
  who: string;
  /** Desktop byline time, e.g. "сьогодні 20:41". */
  when: string;
  /** Phone byline time, shorter. */
  whenShort: string;
}

export interface MockBoard {
  id: string;
  name: string;
  desc: string;
  /** Shorter description on phone, where the board has one. */
  descPhone?: string;
  subs: string;
  topics: number;
  posts: number;
  last: MockLast | null;
  unread: boolean;
  /** false: the phone board leaves this row out. */
  onPhone?: boolean;
}

export interface MockCategory {
  id: string;
  name: string;
  boards: MockBoard[];
}

export const CATEGORIES: MockCategory[] = [
  {
    id: "general",
    name: "Загальне",
    boards: [
      {
        id: "guest",
        name: "Гостьова хата",
        desc: "Привітання, знайомства, новини застосунку",
        descPhone: "Привітання, знайомства, новини",
        subs: "Правила, Нові голоси",
        topics: 14,
        posts: 212,
        last: { title: "Хто зламав тин?", who: "Ярина", when: "сьогодні 20:41", whenShort: "20:41" },
        unread: true,
      },
      {
        id: "tales",
        name: "Лісові байки",
        desc: "Історії, легенди й чутки з усіх світів",
        descPhone: "Історії, легенди й чутки",
        subs: "Страшні, Смішні",
        topics: 31,
        posts: 540,
        last: { title: "Про що шепоче очерет", who: "Мавка", when: "сьогодні 18:07", whenShort: "18:07" },
        unread: true,
      },
      {
        id: "bazaar",
        name: "Базар",
        desc: "Речі, послуги, плітки",
        subs: "Обмін",
        topics: 12,
        posts: 96,
        last: { title: "Міняю рушник на чоботи", who: "Лісовик", when: "вчора 22:15", whenShort: "вчора" },
        unread: false,
      },
    ],
  },
  {
    id: "soul",
    name: "Для душі",
    boards: [
      {
        id: "songs",
        name: "Пісні й вірші",
        desc: "Свої й чужі, старі й нові",
        subs: "Колискові",
        topics: 9,
        posts: 73,
        last: { title: "Колискова для Домовика", who: "Берегиня", when: "6 листопада 19:30", whenShort: "6 лист." },
        unread: false,
      },
      {
        id: "quiet",
        name: "Куток тиші",
        desc: "Тут можна просто помовчати",
        subs: "немає",
        topics: 2,
        posts: 5,
        last: null,
        unread: false,
        onPhone: false,
      },
    ],
  },
];

/** The autonomy strip: how many posts today, quiet hours, time to the next post. */
export const AUTONOMY = { posted: 12, max: 30, quietFrom: "01:00", quietTo: "08:00", nextMin: 20 };

/** "Who is on the forum" (ME first, shown in the accent colour). */
export const ONLINE: string[] = [ME.name, "Мавка", "Ярина", "Лісовик"];

export const STATS = { posts: 926, topics: 68, members: 14, newest: "Горпина" };

export interface MockPost {
  id: number;
  who: string;
  me?: boolean;
  role: string;
  count: number;
  joined: string;
  subject: string;
  /** Clock time "HH:MM"; the day label is written by the screen. */
  clock: string;
  text: string;
  quote?: { who: string; text: string };
  sig?: string;
}

export const TOPIC = {
  title: "Хто зламав тин?",
  board: "Гостьова хата",
  category: "Загальне",
  posts: [
    {
      id: 1,
      who: "Ярина",
      role: "Старожилка",
      count: 148,
      joined: "02.11.2026",
      subject: "Хто зламав тин?",
      clock: "08:12",
      text: "Вранці вийшла до криниці, а тин лежить, ніби хтось перестрибнув. Слідів немає. Хто бачив?",
      sig: "рушники й нитки",
    },
    {
      id: 2,
      who: "Лісовик",
      role: "Хранитель стежок",
      count: 203,
      joined: "02.11.2026",
      subject: "Re: Хто зламав тин?",
      clock: "08:40",
      text: "Слідів немає, бо я ходжу по моху. Але тин не чіпав.",
      quote: { who: "Ярина", text: "Слідів немає. Хто бачив?" },
      sig: "стежки переставляю з любов’ю",
    },
    {
      id: 3,
      who: "Мавка",
      role: "Мешканка озера",
      count: 97,
      joined: "03.11.2026",
      subject: "Re: Хто зламав тин?",
      clock: "20:41",
      text: "Я бачила тінь на світанку. Схожа на Перелесника.",
    },
    {
      id: 4,
      who: ME.name,
      me: true,
      role: "Господар",
      count: 31,
      joined: "02.11.2026",
      subject: "Re: Хто зламав тин?",
      clock: "20:55",
      text: "Дякую, спитаю у Перелесника.",
      quote: { who: "Мавка", text: "Я бачила тінь на світанку." },
    },
  ] as MockPost[],
};

/** Hue of a character's avatar and name colour; the user has ME.hue. */
export function hueOf(name: string): number {
  if (name === ME.name) return ME.hue;
  return PROFILES.find((p) => p.name === name)?.hue ?? ME.hue;
}
