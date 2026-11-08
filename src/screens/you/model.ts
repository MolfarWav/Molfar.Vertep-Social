// Your profile: who you are in Social. A persona is a name, a picture and a short About that the messenger tells a
// character about the person writing. Not a character: no chat, no schedule, never on the forum list.
// Pure helpers and the preview data; the engine calls are in api.ts.

export interface Persona {
  id: string;
  name: string;
  hue: number;
  about: string;
  /** An engine asset URL (a generated picture), "" = none. */
  picture: string;
  /** Set when it was brought in from Roleplay: the persona's id there. */
  from?: { kind: "persona"; id: string };
}

export interface YouState {
  /** The persona the messenger uses; "" when there is none. */
  active: string;
  personas: Persona[];
}

/** What the screen edits. */
export interface Draft {
  name: string;
  about: string;
  picture: string;
}

export const ABOUT_MAX = 1500;
export const NAME_MAX = 80;
export const EMPTY_YOU: YouState = { active: "", personas: [] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A hue (0-359) from a name, the same way the engine picks it. */
export function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function readPersona(raw: unknown): Persona | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id || typeof raw.name !== "string" || !raw.name.trim()) return null;
  const from = isObj(raw.from) && typeof raw.from.id === "string" && raw.from.id ? ({ kind: "persona", id: raw.from.id } as const) : undefined;
  return {
    id: raw.id,
    name: raw.name,
    hue: typeof raw.hue === "number" ? raw.hue : hueOf(raw.name),
    about: typeof raw.about === "string" ? raw.about : "",
    picture: typeof raw.picture === "string" ? raw.picture : "",
    ...(from ? { from } : {}),
  };
}

/** The plugin's `you` object as the screen keeps it; anything unusable gives the empty state. */
export function readYou(raw: unknown): YouState {
  if (!isObj(raw) || !Array.isArray(raw.personas)) return EMPTY_YOU;
  const personas = raw.personas.map(readPersona).filter((p): p is Persona => !!p);
  const want = typeof raw.active === "string" ? raw.active : "";
  return { active: personas.some((p) => p.id === want) ? want : (personas[0]?.id ?? ""), personas };
}

export const draftOf = (p: Persona): Draft => ({ name: p.name, about: p.about, picture: p.picture });
export const blankDraft = (): Draft => ({ name: "", about: "", picture: "" });
export const sameDraft = (a: Draft, b: Draft): boolean => a.name === b.name && a.about === b.about && a.picture === b.picture;

/** A draft can be saved when it has a name. */
export const canSave = (d: Draft): boolean => d.name.trim().length > 0;

/** The persona the draft makes (the id and the origin stay as they were). */
export function personaFrom(id: string, d: Draft, prev?: Persona): Persona {
  const name = d.name.trim().slice(0, NAME_MAX);
  return { id, name, hue: prev ? prev.hue : hueOf(name), about: d.about.trim().slice(0, ABOUT_MAX), picture: d.picture, ...(prev?.from ? { from: prev.from } : {}) };
}

/** A new id the engine accepts (letters, digits, - and _, up to 60), unlike any in `taken`. */
export function newPersonaId(taken: string[], now: number = Date.now(), rand: () => number = Math.random): string {
  for (;;) {
    const id = "u-" + now.toString(36) + "-" + Math.floor(rand() * 36 ** 4).toString(36);
    if (!taken.includes(id)) return id;
  }
}

// The same moves the engine makes, for the preview (which never calls it).
export function withSaved(y: YouState, p: Persona): YouState {
  const at = y.personas.findIndex((x) => x.id === p.id);
  const personas = at >= 0 ? y.personas.map((x) => (x.id === p.id ? p : x)) : [...y.personas, p];
  return { active: y.active || p.id, personas };
}
export function withoutPersona(y: YouState, id: string): YouState {
  const personas = y.personas.filter((x) => x.id !== id);
  return { active: y.active === id ? (personas[0]?.id ?? "") : y.active, personas };
}
export const withActive = (y: YouState, id: string): YouState => (y.personas.some((p) => p.id === id) ? { ...y, active: id } : y);

/** One persona of Roleplay, to pick from. */
export interface RoleplayPersona {
  id: string;
  name: string;
  hue: number;
}
export type PersonaScan = { state: "closed" } | { state: "ready"; personas: RoleplayPersona[]; truncated: boolean };

export function readScan(json: unknown): PersonaScan {
  if (!isObj(json) || json.state !== "ready") return { state: "closed" };
  const personas: RoleplayPersona[] = [];
  for (const r of Array.isArray(json.personas) ? json.personas : []) {
    if (isObj(r) && typeof r.id === "string" && r.id && typeof r.name === "string" && r.name) personas.push({ id: r.id, name: r.name, hue: typeof r.hue === "number" ? r.hue : hueOf(r.name) });
  }
  return { state: "ready", personas, truncated: json.truncated === true };
}

/** A Roleplay persona is already here when a persona remembers it as its source. */
export const haveFrom = (y: YouState, rpId: string): boolean => y.personas.some((p) => p.from?.id === rpId);

// ---------- preview data ----------

export const MOCK_YOU: YouState = {
  active: "u-yaroslav",
  personas: [
    { id: "u-yaroslav", name: "Ярослав", hue: 210, about: "Пишу вночі, п’ю забагато кави. Люблю, коли відповідають коротко й по ділу, але не проти жартів.", picture: "" },
    { id: "pe-wanderer", name: "Мандрівник", hue: 30, about: "Іде зі сходу, без дому й без імені. Мовчазний, але уважний.", picture: "", from: { kind: "persona", id: "wanderer" } },
  ],
};

export const MOCK_ROLEPLAY: RoleplayPersona[] = [
  { id: "wanderer", name: "Мандрівник", hue: 30 },
  { id: "merchant", name: "Купець Гнат", hue: 95 },
  { id: "student", name: "Студентка Орися", hue: 320 },
];
