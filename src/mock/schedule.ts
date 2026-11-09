// A week of statuses for a new profile: the client twin of `scheduleFor` in plugins/profiles/plugin.js (plugins cannot be imported
// by the client). Keep the two identical: test/profile-schedule.test.ts compares them on many seeds and texts.
import type { Status } from "@/mock/status";

const BANDS = 8;
const DAYS = 7;

/** The old week, the same for everyone; never the result of `scheduleFor`. */
const FLAT: Status[] = ["off", "off", "off", "na", "online", "online", "online", "online"];
function isFlatDefault(v: Status[][]): boolean {
  return v.every((row, r) => row.every((s) => s === FLAT[r]));
}

/** Day patterns by band (00-03 .. 21-24): wd = Monday to Friday, we = Saturday and Sunday. hints: word starts, lower case. */
const DAY_KINDS: Record<string, { weight: number; wd: Status[]; we: Status[]; hints: string[] }> = {
  office: {
    weight: 3,
    wd: ["off", "off", "away", "na", "away", "online", "online", "away"] as Status[],
    we: ["off", "off", "off", "away", "online", "online", "online", "away"] as Status[],
    hints: [" office", " employee", " clerk", " accountant", " manager", " teacher", " doctor", " nurse", " engineer", " cashier", " salesperson", " nine to five", " офіс", " служб", " бухгалтер", " менеджер", " вчител", " лікар", " медсестр", " інженер", " продав", " касир", " робоч"],
  },
  early: {
    weight: 1,
    wd: ["off", "away", "online", "online", "online", "away", "online", "off"] as Status[],
    we: ["off", "away", "online", "online", "online", "online", "away", "off"] as Status[],
    hints: [" early bird", " early riser", " dawn", " sunrise", " farmer", " baker", " rooster", " ранк", " ранн", " рано ", " світан", " жайворон", " фермер", " пекар"],
  },
  owl: {
    weight: 2,
    wd: ["online", "away", "off", "off", "na", "away", "online", "online"] as Status[],
    we: ["online", "online", "away", "off", "off", "away", "online", "online"] as Status[],
    hints: [" night ", " nights ", " nighttime", " nocturnal", " insomni", " vampire", " нічн", " ніч ", " ночн", " ноч ", " ночі ", " сова ", " совою", " безсон", " вампір"],
  },
  evening: {
    weight: 3,
    wd: ["off", "off", "off", "off", "away", "away", "online", "online"] as Status[],
    we: ["off", "off", "off", "away", "online", "online", "online", "online"] as Status[],
    hints: [" student", " gamer", " streamer", " hacker", " programmer", " coder", " anime", " школяр", " студент", " геймер", " стрім", " хакер", " програміст", " аніме"],
  },
  home: {
    weight: 2,
    wd: ["off", "off", "away", "online", "online", "online", "online", "away"] as Status[],
    we: ["off", "off", "off", "away", "online", "online", "online", "away"] as Status[],
    hints: [" homebody", " hermit", " recluse", " writer", " author ", " freelanc", " remote work", " painter", " artist", " bookworm", " introvert", " затвор", " відлюд", " письменник", " фрілан", " художник", " домосід", " інтроверт", " книголюб"],
  },
  busy: {
    weight: 1,
    wd: ["off", "off", "na", "dnd", "dnd", "away", "online", "away"] as Status[],
    we: ["off", "off", "off", "away", "away", "online", "online", "away"] as Status[],
    hints: [" busy", " workaholic", " captain", " commander", " king ", " queen", " boss ", " ruler", " soldier", " warrior", " guard ", " guards ", " leader", " зайнят", " капітан", " командир", " король", " королев", " правител", " воїн", " солдат", " вартов", " лідер"],
  },
};

/** The text a profile's week is read from: what the character is like, not what it said. */
function seededRand(seed: string): () => number {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The kind of day the text points to (most hints win; a tie or no hint is decided by the seed, no hint also by the weights). */
function dayKindFor(text: string, rand: () => number): string {
  const t = " " + String(text).toLowerCase().replace(/[^a-zа-яіїєґё0-9]+/g, " ") + " ";
  const keys = Object.keys(DAY_KINDS);
  const hits = keys.map((k) => DAY_KINDS[k].hints.filter((h) => t.includes(h)).length);
  const best = Math.max(...hits);
  if (best > 0) {
    const ties = keys.filter((_, i) => hits[i] === best);
    return ties[Math.floor(rand() * ties.length)];
  }
  const total = keys.reduce((n, k) => n + DAY_KINDS[k].weight, 0);
  let x = rand() * total;
  for (const k of keys) {
    x -= DAY_KINDS[k].weight;
    if (x < 0) return k;
  }
  return keys[0];
}

/** A week (schedule[band][day]) for a profile: its kind of day from the text, then its own timing, a few odd days and small swaps. */
export function scheduleFor(seed: string, text: string): Status[][] {
  const rand = seededRand(seed);
  const kind = DAY_KINDS[dayKindFor(text, rand)];
  const base = Math.floor(rand() * 3) - 1; // this character wakes up to three hours earlier or later than the pattern
  const cols: Status[][] = [];
  for (let d = 0; d < DAYS; d++) {
    const pattern = d < 5 && rand() >= 0.12 ? kind.wd : kind.we; // one weekday in eight is a day off
    const shift = base + (rand() < 0.18 ? (rand() < 0.5 ? -1 : 1) : 0); // some days start or end later
    const col = Array.from({ length: BANDS }, (_, r) => pattern[(((r - shift) % BANDS) + BANDS) % BANDS] as Status);
    for (let r = 0; r < BANDS; r++) {
      const x = rand();
      if (x < 0.08 && col[r] === "online") col[r] = "away";
      else if (x < 0.08 && col[r] === "away") col[r] = "online";
    }
    if (!col.includes("online")) col[col.includes("away") ? col.indexOf("away") : 6] = "online";
    cols.push(col);
  }
  const out = Array.from({ length: BANDS }, (_, r) => cols.map((c) => c[r] as Status));
  if (isFlatDefault(out)) (out[7] as Status[])[6] = "away"; // never the old shared week: that is how it is recognised
  return out;
}
