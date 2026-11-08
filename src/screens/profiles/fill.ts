// "Fill empty": which profile fields a model may fill, and how proposals are
// applied. A field that already has text (or items) is never touched; the
// check runs again when the user applies, in case the field changed meanwhile.
import type { Habit, ProfileForm } from "@/mock/profiles";
import type { FieldKey } from "./model-api";

export type FillKey = FieldKey;

/** One proposal as the review lists it. */
export interface FillItem {
  key: FillKey;
  value: string | string[];
}

/** The chosen items back as a proposal, for applyProposals. */
export function recordOf(items: FillItem[]): Partial<Record<FillKey, string | string[]>> {
  const out: Partial<Record<FillKey, string | string[]>> = {};
  for (const i of items) out[i.key] = i.value;
  return out;
}

/** The review's list, in the order the proposal has its keys. */
export function itemsOf(proposal: Partial<Record<FillKey, string | string[]>>): FillItem[] {
  return (Object.keys(proposal) as FillKey[]).flatMap((key) => {
    const value = proposal[key];
    return value === undefined ? [] : [{ key, value }];
  });
}

export const FILL_KEYS: FillKey[] = ["about", "interests", "habits", "voiceText", "rank", "signature"];

/** Whether one field of the form is still empty. */
export function isEmptyField(form: ProfileForm, key: FillKey): boolean {
  switch (key) {
    case "about":
      return form.about.trim() === "";
    case "interests":
      return form.interests.length === 0;
    case "habits":
      return form.habits.length === 0;
    case "voiceText":
      return form.voice.text.trim() === "";
    case "rank":
      return form.forum.rank.trim() === "";
    case "signature":
      return form.forum.signature.trim() === "";
  }
}

/** The empty fields of the form, in the order the review shows them. */
export function emptyKeys(form: ProfileForm): FillKey[] {
  return FILL_KEYS.filter((k) => isEmptyField(form, k));
}

/**
 * The patch for the proposals that still fit: only fields that are empty now.
 * Habits from the model are added as the user's own items ("you"), so the
 * profile's self-written list stays as it was.
 */
export function applyProposals(form: ProfileForm, proposal: Partial<Record<FillKey, string | string[]>>, idSeed = Date.now()): Partial<ProfileForm> {
  const patch: Partial<ProfileForm> = {};
  (Object.keys(proposal) as FillKey[]).forEach((key, i) => {
    const value = proposal[key];
    if (value === undefined || !isEmptyField(form, key)) return;
    switch (key) {
      case "about":
        patch.about = String(value);
        break;
      case "interests":
        patch.interests = [...(Array.isArray(value) ? value : [value])];
        break;
      case "habits": {
        const texts = Array.isArray(value) ? value : [value];
        const habits: Habit[] = texts.map((text, j) => ({ id: `fill-${idSeed}-${i}-${j}`, text, by: "you" }));
        patch.habits = [...form.habits, ...habits];
        break;
      }
      case "voiceText":
        patch.voice = { ...form.voice, text: String(value) };
        break;
      case "rank":
        patch.forum = { ...(patch.forum ?? form.forum), rank: String(value) };
        break;
      case "signature":
        patch.forum = { ...(patch.forum ?? form.forum), signature: String(value) };
        break;
    }
  });
  return patch;
}
