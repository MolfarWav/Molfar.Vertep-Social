import { expect, test } from "bun:test";
import { routeFromState, writeRoute } from "../src/lib/route-history";

type R = { view: "home" } | { view: "topic"; id: string };
const valid = (r: unknown): r is R => !!r && typeof r === "object" && ((r as R).view === "home" || ((r as R).view === "topic" && typeof (r as { id: unknown }).id === "string"));

function fakeWin(fail = false) {
  const log: { op: string; state: unknown }[] = [];
  const history = {
    state: null as unknown,
    pushState(s: unknown) {
      if (fail) throw new Error("SecurityError");
      log.push({ op: "push", state: s });
    },
    replaceState(s: unknown) {
      if (fail) throw new Error("SecurityError");
      log.push({ op: "replace", state: s });
    },
  };
  return { win: { history }, log };
}

test("a route is written as a new entry or over the current one", () => {
  const { win, log } = fakeWin();
  expect(writeRoute(win, { view: "topic", id: "t1" } as R, false)).toBe(true);
  expect(writeRoute(win, { view: "home" } as R, true)).toBe(true);
  expect(log.map((l) => l.op)).toEqual(["push", "replace"]);
  expect(routeFromState(log[0].state, valid)).toEqual({ view: "topic", id: "t1" });
});

test("a browser that refuses to write history is not an error", () => {
  expect(writeRoute(fakeWin(true).win, { view: "home" } as R, false)).toBe(false);
});

test("a state that is not ours, or holds a broken route, gives no route", () => {
  expect(routeFromState(null, valid)).toBeNull();
  expect(routeFromState("x", valid)).toBeNull();
  expect(routeFromState({}, valid)).toBeNull();
  expect(routeFromState({ socialForumRoute: { view: "topic", id: 5 } }, valid)).toBeNull();
  expect(routeFromState({ socialForumRoute: { view: "other" } }, valid)).toBeNull();
  expect(routeFromState({ other: { view: "home" } }, valid)).toBeNull();
});
