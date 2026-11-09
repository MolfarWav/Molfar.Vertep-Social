// Pure parts of the Settings screen in real mode: the defaults before the engine answers, the
// shape of a saved patch, adopting the engine's corrections, and the model picker options.
// No React and no network here, so test/settings-state.test.ts can drive them directly.
import type { ModelChoice } from "@/lib/api";
import { LIFE_DEFAULTS, type SettingsMock } from "@/mock/settings";
import type { Opt } from "./controls";

/** A partial settings object: what the screen sets and what the save sends. */
export type Patch = Partial<SettingsMock>;

/** The engine's shape (plugins/profiles, DEFAULT_SETTINGS). Models are references, "" = engine default. */
export const REAL_DEFAULTS: SettingsMock = {
  autonomous: true,
  activity: "moderate",
  postsPerDay: 30,
  postsPerAuthor: 6,
  newTopicShare: 20,
  quietFrom: "01:00",
  quietTo: "08:00",
  writers: "profile",
  messengerFirst: true,
  messengerPerDay: 5,
  messengerQuiet: "same",
  messengerContext: 24,
  messengerSummary: true,
  messengerKnows: "knows",
  models: { messenger: "", forum: "", import: "", image: "" },
  notify: { tab: true, system: true, sound: false },
  roleplayAccess: false,
  life: LIFE_DEFAULTS,
  images: { on: false, perDay: 2 },
  usedToday: 0,
};

/** The engine's settings: the screen shape without usedToday (the engine does not count requests). */
export type EngineSettings = Omit<SettingsMock, "usedToday">;

/** The engine's answer as the screen takes it: the forum is not built yet, so usedToday is 0. */
export function fromEngine(settings: EngineSettings): SettingsMock {
  return { ...settings, usedToday: 0 };
}

/** Two patches made one after the other: nested `models`, `notify` and `life` merge key by key (`life.cats` too). */
export function mergePatch(base: Patch | null, next: Patch | null): Patch {
  const a = base ?? {};
  const b = next ?? {};
  const out: Patch = { ...a, ...b };
  if (a.models || b.models) out.models = { ...a.models, ...b.models } as SettingsMock["models"];
  if (a.notify || b.notify) out.notify = { ...a.notify, ...b.notify } as SettingsMock["notify"];
  if (a.images || b.images) out.images = { ...a.images, ...b.images } as SettingsMock["images"];
  if (a.life || b.life) out.life = { ...a.life, ...b.life, cats: { ...a.life?.cats, ...b.life?.cats } } as SettingsMock["life"];
  return out;
}

/** The settings with a patch applied (the screen's local state, before the engine answers). */
export function applyPatch(s: SettingsMock, patch: Patch): SettingsMock {
  return mergePatch(s, patch) as SettingsMock;
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);
const asPlain = (v: object): Plain => v as Plain;

/**
 * Take the engine's value for every key the save sent, where the screen still holds the value that was
 * sent. A key the user changed again after the save started keeps the local value; the next save carries it.
 * Used to correct bad values (the engine clamps numbers), not to overwrite edits.
 */
export function adoptEngine<T extends object>(local: T, sent: object, engine: object): T {
  const have0 = asPlain(local);
  const want0 = asPlain(sent);
  const eng0 = asPlain(engine);
  let out: Plain = have0;
  for (const key of Object.keys(want0)) {
    const want = want0[key];
    const have = have0[key];
    if (isPlain(want) && isPlain(have)) {
      const next = adoptEngine(have, want, isPlain(eng0[key]) ? eng0[key] : {});
      if (next !== have) out = { ...out, [key]: next };
    } else if (have === want && eng0[key] !== undefined && eng0[key] !== have) {
      out = { ...out, [key]: eng0[key] };
    }
  }
  return out as T;
}

/**
 * The options of one model picker: the engine default first (""), then the models the user switched on.
 * A saved reference that is not in the list still shows, as its own text.
 */
export function modelOptions(choices: ModelChoice[], current: string, engineDefault: string): Opt<string>[] {
  const opts: Opt<string>[] = [
    { value: "", label: engineDefault },
    ...choices.map((c) => ({ value: c.ref, label: c.label, group: c.provider, sub: c.ref.slice(c.ref.indexOf("/") + 1) })),
  ];
  if (current && !choices.some((c) => c.ref === current)) opts.push({ value: current, label: current });
  return opts;
}
