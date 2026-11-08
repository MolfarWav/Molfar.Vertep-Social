// Example ideas for the interview's "Stuck? Try one of these" chips: 60 per
// language, each one short sentence in the style of Roleplay's examples. Mixed
// genres (folklore, fantasy, sci-fi, modern, slice-of-life, comedy, horror-lite,
// historical). No real people, no brand names. The dialog shows four at a time.

export type IdeaLang = "uk" | "en";

const UK: string[] = [
  "Відьма, яка боїться власного кота",
  "Пасічник, який радиться з бджолами перед кожним рішенням",
  "Русалка, що переїхала до міста і шукає роботу",
  "Старий чумак, який пише листи до місяця",
  "Ковалиха, яка кує підкови для вітрів",
  "Домовик, який переїхав у нову квартиру і сумує за піччю",
  "Козак-картограф, що малює карти тих місць, яких не існує",
  "Листоноша, яка розносить листи мертвим у старому селі",
  "Гончар, у глині якого щоночі з’являються чужі обличчя",
  "Мольфар, що втомився від того, що всі просять передбачити погоду",
  "Ворожка, яка ніколи не бачить власного майбутнього",
  "Лісничий, який розмовляє з вовками і не довіряє людям",
  "Цілитель зі звичайним ледарством і надзвичайним чуттям на пироги",
  "Вартовий маяка, що боїться темряви на суші",
  "Пілот дирижабля, який мріє знову ходити пішки",
  "Бібліотекарка, яка знає, що книжки в її залі живі",
  "Механік старого поїзда, що ремонтує час",
  "Капітан корабля з паперу, який тоне від кожної брехні",
  "Студент академії магії, який випадково зачарував свою кішку",
  "Друкар, що видає газету з новинами з майбутнього",
  "Охоронець кордону між світом живих і мертвих, якому набридло стояти на варті",
  "Сільський фельдшер, що лікує книжками",
  "Шахтар, який знаходить у породі дивні срібні ключі",
  "Ткаля, яка вплітає в полотно чужі спогади",
  "Лелека, що злетів із даху і не може повернутися додому",
  "Колишній найманець, який тепер шиє дитячі сорочки",
  "Чаклунка-кухарка, від чиїх борщів починають розмовляти стіни",
  "Річковий перевізник, що знає таємниці всіх берегів",
  "Скрипаль, чия музика відганяє грозу",
  "Сторож старого цвинтаря, який веде облік усіх забутих імен",
  "Таксист, що возить пасажирів між станціями, яких немає на мапі",
  "Учителька, яка навчає дітей розмовляти з птахами",
  "Пекар, чий хліб сам розказує, що станеться завтра",
  "Бурлака, що шукає в річці втрачений голос",
  "Опікун маленького дракона, який боїться власного вогню",
  "Торговець снами, який продає тільки хороші сни і ніколи не спить",
  "Комп’ютерний хакер, що зламав систему міського автобуса",
  "Ветеринарка для фантастичних звірів, яка не любить драконів",
  "Нічний таксист з вічним сном, який чує розмови пасажирів",
  "Курортний лікар у горах, що бачить привидів на лижах",
  "Астроном-пенсіонер, який відкрив комету і нікому не розповів",
  "Модельєрка, яка шиє сукні з туману",
  "Дідусь-винахідник, чий годинник іде назад",
  "Солдат, що повернувся з війни і тепер доглядає сад",
  "Секретарка імператора, яка пише всі його промови сама",
  "Пиріжкарка з глухого села, що готує для привидів",
  "Сищик, який розслідує крадіжку тіней у місті",
  "Мисливець за зниклими котами, який сам полюбив котів",
  "Поетка, чиї вірші збуваються з запізненням на тиждень",
  "Кухар космічного корабля, який готує лише з картоплі",
  "Перекладач мови дерев, що розуміє тільки осінь",
  "Суддя на весіллі, якому дуже хочеться танцювати",
  "Торговець зіллям, який сам отруївся власним товаром",
  "Студентка-археолог, що знайшла в могилі свій паспорт",
  "Вуличний музикант, чия гітара грає тільки правду",
  "Кравчиня для привидів, яка не може підігнати розмір",
  "Охоронниця старої бібліотеки з гострим язиком",
  "Сусід, який щоранку розмовляє з котом про політику",
  "Колишній дракон-вчитель, що тепер продає морозиво",
  "Швачка, що вишиває на сорочках карти доріг додому",
];

const EN: string[] = [
  "A retired detective who now runs a quiet bookshop",
  "A beekeeper who asks his bees for advice before every decision",
  "A mermaid who moved to the city and is looking for work",
  "An old wagon driver who writes letters to the moon",
  "A blacksmith who shoes the winds so they stop tearing roofs",
  "A house spirit who moved into a flat and misses the stove",
  "A cartographer who draws maps of places that do not exist",
  "A postwoman who delivers letters to a village of the dead",
  "A potter who finds unfamiliar faces in the clay every night",
  "A weather-witch who is tired of everyone asking about the rain",
  "A fortune-teller who can never see her own future",
  "A forester who talks to wolves and trusts no people",
  "A village healer who is lazy but has a gift for baking pies",
  "A lighthouse keeper who is afraid of the dark on land",
  "A balloon pilot who dreams of walking on solid ground again",
  "A librarian who knows her books are alive",
  "A train mechanic who repairs time instead of engines",
  "A paper ship captain who sinks with every lie he tells",
  "An academy student who accidentally enchanted her cat",
  "A printer whose newspaper carries tomorrow's headlines",
  "A border guard between the living and the dead, tired of the watch",
  "A rural doctor who prescribes old books as medicine",
  "A miner who finds strange silver keys in the rock",
  "A weaver who sews other people's memories into her cloth",
  "A stork who fell off a roof and cannot fly back home",
  "A former mercenary who now sews children's shirts",
  "A witch-cook whose soups make the kitchen walls gossip",
  "A river ferryman who knows the secrets of every bank",
  "A fiddler whose music drives away thunderstorms",
  "A caretaker of an old cemetery who keeps a list of forgotten names",
  "A taxi driver who drives between stations that are not on any map",
  "A schoolteacher who teaches children to speak with birds",
  "A baker whose bread tells what will happen tomorrow",
  "A boatman searching the river for a lost voice",
  "A guardian of a small dragon who is afraid of its own fire",
  "A dream merchant who sells only good dreams and never sleeps",
  "A hacker who broke into the city bus system for a joke",
  "A veterinarian for magical beasts who dislikes dragons",
  "A night cab driver who overhears his passengers' secrets",
  "A mountain doctor who sees ghosts on the ski slopes",
  "A retired astronomer who discovered a comet and told no one",
  "A dressmaker who sews gowns out of fog",
  "An old inventor whose clock runs backwards",
  "A soldier back from the war who now tends a garden",
  "An emperor's secretary who writes all his speeches herself",
  "A pie maker from a remote village who cooks for ghosts",
  "A detective investigating the theft of shadows in the city",
  "A cat hunter who fell in love with the cats he hunts",
  "A poet whose verses come true a week late",
  "A space ship cook who only cooks with potatoes",
  "A translator of tree language who understands only autumn",
  "A judge at a wedding who wants desperately to dance",
  "A herb seller who poisoned himself with his own stock",
  "An archaeology student who found her own passport in a grave",
  "A street musician whose guitar plays only the truth",
  "A tailor for ghosts who cannot get the sizes right",
  "A museum guard with a sharp tongue and a soft spot for moths",
  "A neighbour who argues politics with his cat every morning",
  "A retired dragon teacher who now sells ice cream on a beach",
  "A seamstress who embroiders roads home onto shirts",
];

/** The examples in one language. */
export function ideaExamples(lang: string): string[] {
  return lang.startsWith("en") ? EN : UK;
}

/** A small seeded random number generator (mulberry32): the same seed gives the same sequence. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Takes `count` ideas from `pool` that are not in `used`; when fewer remain, the
 * used set starts again. Returns the picks and the new used set (so a shuffle
 * never repeats until the whole list has been shown).
 */
export function takeIdeas(pool: string[], used: string[], count: number, rand: () => number): { picks: string[]; used: string[] } {
  let left = pool.filter((x) => !used.includes(x));
  let nextUsed = used;
  if (left.length < count) {
    nextUsed = [];
    left = pool.slice();
  }
  const picks: string[] = [];
  while (picks.length < count && left.length > 0) {
    const i = Math.floor(rand() * left.length);
    picks.push(left[i]);
    left = left.filter((_, j) => j !== i);
  }
  return { picks, used: [...nextUsed, ...picks] };
}
