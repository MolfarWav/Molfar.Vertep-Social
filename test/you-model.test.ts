import { expect, test } from "bun:test";
import { MOCK_YOU, blankDraft, canSave, draftOf, haveFrom, newPersonaId, personaFrom, readScan, readYou, sameDraft, withActive, withSaved, withoutPersona } from "../src/screens/you/model";

test("readYou keeps usable personas and falls back to the first as active", () => {
  const y = readYou({ active: "gone", personas: [{ id: "a", name: "A" }, { id: "b" }, { name: "x" }, { id: "c", name: "C", about: "hi", picture: "/v1/assets/x", from: { kind: "persona", id: "rp" } }] });
  expect(y.personas.map((p) => p.id)).toEqual(["a", "c"]);
  expect(y.active).toBe("a");
  expect(y.personas[1]).toMatchObject({ about: "hi", picture: "/v1/assets/x", from: { kind: "persona", id: "rp" } });
  expect(readYou(null)).toEqual({ active: "", personas: [] });
  expect(readYou({ active: "c", personas: y.personas }).active).toBe("c");
});

test("a draft is saveable with a name, and equal to the persona it came from until edited", () => {
  const p = MOCK_YOU.personas[0]!;
  expect(sameDraft(draftOf(p), draftOf(p))).toBe(true);
  expect(sameDraft(draftOf(p), { ...draftOf(p), about: p.about + "!" })).toBe(false);
  expect(canSave(blankDraft())).toBe(false);
  expect(canSave({ ...blankDraft(), name: "  " })).toBe(false);
  expect(canSave({ ...blankDraft(), name: "Я" })).toBe(true);
});

test("personaFrom trims, keeps the origin and the hue of the saved persona", () => {
  const prev = MOCK_YOU.personas[1]!;
  const p = personaFrom(prev.id, { name: "  Мандрівник  ", about: "  text ", picture: "" }, prev);
  expect(p).toMatchObject({ id: prev.id, name: "Мандрівник", about: "text", hue: prev.hue, from: prev.from });
  expect(personaFrom("u-x", { name: "Нова", about: "", picture: "" }).from).toBeUndefined();
});

test("the preview moves match the engine's: first saved becomes active, deleting the active passes it on", () => {
  const first = withSaved({ active: "", personas: [] }, { id: "a", name: "A", hue: 1, about: "", picture: "" });
  expect(first.active).toBe("a");
  const two = withSaved(first, { id: "b", name: "B", hue: 2, about: "", picture: "" });
  expect(two.active).toBe("a");
  expect(withActive(two, "b").active).toBe("b");
  expect(withActive(two, "nope").active).toBe("a");
  expect(withoutPersona(withActive(two, "b"), "b")).toEqual({ active: "a", personas: [first.personas[0]!] });
  expect(withoutPersona(first, "a")).toEqual({ active: "", personas: [] });
});

test("new ids fit the engine's rule and avoid the taken ones", () => {
  const id = newPersonaId([], 1700000000000, () => 0.5);
  expect(id).toMatch(/^[A-Za-z0-9_-]{1,60}$/);
  let n = 0;
  const next = newPersonaId([id], 1700000000000, () => (n++ === 0 ? 0.5 : 0.25));
  expect(next).not.toBe(id);
});

test("the Roleplay scan reads names only and knows which are already here", () => {
  expect(readScan({ state: "closed" })).toEqual({ state: "closed" });
  const s = readScan({ state: "ready", personas: [{ id: "w", name: "W", hue: 5 }, { id: "", name: "x" }, { name: "y" }], truncated: true });
  expect(s).toEqual({ state: "ready", personas: [{ id: "w", name: "W", hue: 5 }], truncated: true });
  expect(haveFrom(MOCK_YOU, "wanderer")).toBe(true);
  expect(haveFrom(MOCK_YOU, "merchant")).toBe(false);
});
