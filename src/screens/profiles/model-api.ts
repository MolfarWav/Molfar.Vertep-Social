// The model calls of the Profiles screen, as the screen sees them. Both
// functions take and return the shapes of the Roleplay profile plugin
// (plugins/profile/plugin.js): POST /profile/persona-ideas ("suggest") and
// POST /profile/fill ("fillEmpty"). Here they are fakes: no network, canned
// Ukrainian text, a fixed delay. Wiring them to the app means replacing the
// bodies only; the screen does not change. Nothing else in the screen fakes a call.
//
// Preview states (mockScript) pick the outcome of the next calls:
//   newfail / fillfail   the first call fails, the next ones succeed
//   newnomodel / fillnomodel   every call says no model is chosen
//   fillnone   the first fill call proposes nothing

export type FieldKey = "about" | "interests" | "habits" | "voiceText" | "rank" | "signature";

/** One of the three drafts. `archetype`, `summary`, `traits` and `detail` are what the card shows; the rest are the profile's fields. */
export interface Draft {
  name: string;
  archetype: string;
  hue: number;
  summary: string;
  traits: string[];
  /** One extra detail line for the card. */
  detail: string;
  about: string;
  voiceText: string;
  interests: string[];
  rank: string;
  signature: string;
}

/** A quick question with its options; the answer is the option's index. */
export interface Question {
  q: string;
  options: string[];
}

export interface SuggestInput {
  idea: string;
  wish?: string;
  /** The answers to `questions`, by question index: the option's index, or null for none. */
  answers?: (number | null)[];
  /** An optional picture of the look. The mock ignores it. */
  image?: { mimeType: string; data: string };
}

export type SuggestResult =
  | { ok: true; drafts: Draft[]; questions: Question[] }
  | { ok: false; error: string; code?: "no-model" };

export interface FillInput {
  profileId: string;
  fields: FieldKey[];
}

/** One value per requested field the model could fill. */
export type FillResult =
  | { ok: true; proposal: Partial<Record<FieldKey, string | string[]>> }
  | { ok: false; error: string; code?: "no-model" };

/** A text file as the screen reads it: the cap and the cut are the Roleplay limits. */
export interface PickedText {
  name: string;
  text: string;
  cut: boolean;
}

type Outcome = "ok" | "fail" | "none" | "no-model";
type Kind = "suggest" | "fill";

const once: Record<Kind, Outcome[]> = { suggest: [], fill: [] };
const sticky: Partial<Record<Kind, Outcome>> = {};

/** Sets the outcomes for the preview state (called once when the screen opens). */
export function mockScript(state: string | null): void {
  once.suggest = [];
  once.fill = [];
  delete sticky.suggest;
  delete sticky.fill;
  if (state === "newfail") once.suggest = ["fail"];
  if (state === "newnomodel") sticky.suggest = "no-model";
  if (state === "fillfail") once.fill = ["fail"];
  if (state === "fillnone") once.fill = ["none"];
  if (state === "fillnomodel") sticky.fill = "no-model";
}

const next = (kind: Kind): Outcome => sticky[kind] ?? once[kind].shift() ?? "ok";

const QUESTIONS: Question[] = [
  { q: "Наскільки говіркий?", options: ["Коротко", "Середньо", "Довго"] },
  { q: "Наскільки офіційний?", options: ["На «ти»", "Нейтрально", "Ввічливо"] },
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The drafts and questions the interview shows without a call (preview state interview2). */
export function previewInterview(): { drafts: Draft[]; questions: Question[] } {
  return { drafts: DRAFTS, questions: QUESTIONS };
}

/** A text file the preview state newfile shows: longer than the cap, so the cut note shows. */
export function previewFile(): PickedText {
  const full = "Ярина тримає хутір на краю лісу. Вона рано встає, любить порядок і не терпить брехні. ".repeat(160);
  return { name: "Ярина.notes.md", text: full.slice(0, 12000), cut: true };
}

/** Three drafts and up to two quick questions from a few words. */
export async function suggest(_input: SuggestInput): Promise<SuggestResult> {
  await wait(2000);
  const outcome = next("suggest");
  if (outcome === "no-model") return { ok: false, error: "no model is chosen", code: "no-model" };
  if (outcome === "fail") return { ok: false, error: "model did not answer" };
  return { ok: true, drafts: DRAFTS, questions: QUESTIONS };
}

/** The proposal the preview state fill shows at once (no call). */
export function previewProposal(fields: FieldKey[]): Partial<Record<FieldKey, string | string[]>> {
  const proposal: Partial<Record<FieldKey, string | string[]>> = {};
  for (const k of fields) proposal[k] = CANNED_FILL[k];
  return proposal;
}

/** Proposals for the requested empty fields only. The mock ignores the profile's text. */
export async function fillEmpty(input: FillInput): Promise<FillResult> {
  await wait(1500);
  const outcome = next("fill");
  if (outcome === "no-model") return { ok: false, error: "no model is chosen", code: "no-model" };
  if (outcome === "fail") return { ok: false, error: "model did not answer" };
  if (outcome === "none") return { ok: true, proposal: {} };
  return { ok: true, proposal: previewProposal(input.fields) };
}

const CANNED_FILL: Record<FieldKey, string | string[]> = {
  about: "Господиня хутора. Тримає все в голові, говорить коротко, любить порядок.",
  interests: ["хутір", "ярмарок", "кужіль"],
  habits: ["Встає до півнів і перша в хаті"],
  voiceText: "Розмовляє рішуче і коротко, з легким жартом.",
  rank: "Господиня хутора",
  signature: "хутір, ярмарок, кужіль",
};

const DRAFTS: Draft[] = [
  {
    name: "Кікімора",
    archetype: "Хатня болотянка",
    hue: 280,
    summary: "Господиня болота, що плутає стежки і любить нагадувати про чужі борги. Чужі справи знає краще за власні.",
    traits: ["Цікава", "Мстива", "Ласкава до дітей"],
    detail: "Завжди має при собі клубок ниток, яким заплутує сліди.",
    about: "Живе в очереті за околицею. Зла на людей, які смітять у болоті, але до дітей ласкава.",
    voiceText: "Шепоче, любить повторювати чужі слова і питати «а чому?».",
    interests: ["болото", "нитки", "борги"],
    rank: "Сусідка з очерету",
    signature: "болото, нитки, туман",
  },
  {
    name: "Полудниця",
    archetype: "Польова сторожка",
    hue: 35,
    summary: "Дух полудня, що виходить із поля і не любить, коли її турбують у спеку. Після полудня мовчить до вечора.",
    traits: ["Різка", "Чесна", "Терпляча лише вранці"],
    detail: "Ходить босоніж, і трава під нею не гнеться.",
    about: "Показується в полі опівдні. Говорить мало, різко, а після полудня мовчить до вечора.",
    voiceText: "Коротко і різко, з паузами, ніби ховається від сонця.",
    interests: ["поле", "спека", "жнива"],
    rank: "Дух полудня",
    signature: "жнива, пекло, тінь",
  },
  {
    name: "Вовкулака",
    archetype: "Нічний коваль",
    hue: 15,
    summary: "Людина, що по місяцю обертається на вовка, і тепер тримає це в таємниці. Коваль на краю села.",
    traits: ["Стримана", "Вірна", "Недовірлива"],
    detail: "Гартує клинки лише тоді, коли місяць ще тонкий.",
    about: "Працює ковалем на краю села. Сторожко ставиться до місяця і не любить, коли його питають про ніч.",
    voiceText: "Говорить стримано, з довгими мовчанками, на «ви» з усіма, крім дітей.",
    interests: ["ковальство", "місяць", "ліс"],
    rank: "Коваль з околиці",
    signature: "ліс, місяць, вогонь",
  },
];
