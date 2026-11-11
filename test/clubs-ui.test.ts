// The pure parts of the Clubs screen (#368): the member picker's rules, the line under a club, the limits, the Settings defaults.
import { expect, test } from "bun:test";
import { COMMUNITY_DEFAULTS, LIMITS } from "@/mock/settings";
import { canSave, clubLine, filterPeople, memberNames, newClubBlock, pickState, toggleMember } from "@/screens/messenger/clubs-model";

test("the picker ticks and unticks, and never takes a fifth member", () => {
  let v: string[] = [];
  for (const id of ["a", "b", "c", "d"]) v = toggleMember(v, id);
  expect(v).toEqual(["a", "b", "c", "d"]);
  expect(toggleMember(v, "e")).toEqual(v); // past the limit nothing happens
  expect(toggleMember(v, "b")).toEqual(["a", "c", "d"]);
  expect(toggleMember(["a"], "a")).toEqual([]);
});

test("the search finds a name in any case, in Cyrillic too, and an empty search keeps everyone", () => {
  const people = [{ name: "Мавка" }, { name: "Лісовик" }, { name: "Anna" }, { name: "Banana" }];
  expect(filterPeople(people, "").length).toBe(4);
  expect(filterPeople(people, "  ").length).toBe(4);
  expect(filterPeople(people, "ліс")).toEqual([{ name: "Лісовик" }]);
  expect(filterPeople(people, "МАВ")).toEqual([{ name: "Мавка" }]);
  expect(filterPeople(people, "AN").map((p) => p.name)).toEqual(["Anna", "Banana"]);
  expect(filterPeople(people, "zzz")).toEqual([]);
});

test("a club may be saved with a name and three or four members only", () => {
  expect(pickState(2)).toBe("few");
  expect(pickState(3)).toBe("ok");
  expect(pickState(4)).toBe("full");
  expect(canSave("Weavers", ["a", "b"])).toBe(false);
  expect(canSave("Weavers", ["a", "b", "c"])).toBe(true);
  expect(canSave("  ", ["a", "b", "c"])).toBe(false);
  expect(canSave("Weavers", ["a", "b", "c", "d", "e"])).toBe(false);
});

test("a new club is blocked at the limit and with fewer than three characters", () => {
  expect(newClubBlock(0, 3, 9)).toBe("");
  expect(newClubBlock(3, 3, 9)).toBe("limit");
  expect(newClubBlock(1, 3, 2)).toBe("few");
  expect(newClubBlock(3, 3, 2)).toBe("limit");
});

test("the line under a club names the speaker, the user as You", () => {
  const club = (by: string, name: string) => ({ last: { by, name, at: 1, text: "Hello." } });
  expect(clubLine(club("anna", "Anna"), "You")).toBe("Anna: Hello.");
  expect(clubLine(club("me", ""), "You")).toBe("You: Hello.");
  expect(clubLine({ last: null }, "You")).toBe("");
  expect(memberNames({ members: [{ id: "a", name: "Anna", hue: 1, picture: "" }, { id: "b", name: "Boris", hue: 2, picture: "" }] })).toBe("Anna, Boris");
});

test("the Settings defaults carry the club switches, off by default, with their limits", () => {
  expect(COMMUNITY_DEFAULTS).toMatchObject({ clubs: false, clubsPerDay: 12, clubsMod: true });
  expect(LIMITS.clubsPerDay).toEqual({ min: 1, max: 40 });
});
