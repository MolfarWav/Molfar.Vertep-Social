// City C5 (#453): the geometry of the drawn district (isometric). The drawing itself is checked in the design preview; here the lots,
// the pins and the SVG string are pinned.
import { expect, test } from "bun:test";
import { ISO_MAX, KIND_LOOK, isoAllLots, isoFrame, isoGrid, isoHeight, isoLots, isoPin, isoPoint } from "../src/screens/city/iso";
import { isoSvg } from "../src/screens/city/iso-map";

test("the grid grows with the places: one fills the plate, then 2, 3, 4 and 5 lots a side; never more than ISO_MAX lots", () => {
  expect([1, 2, 4, 5, 9, 10, 16, 17, 25, 60].map(isoGrid)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
  expect(isoLots(3).length).toBe(3);
  expect(isoAllLots(3).length).toBe(4);
  expect(isoLots(60).length).toBe(ISO_MAX);
});

test("lots go back to front, inside the plate, and do not overlap", () => {
  for (const n of [1, 3, 7, 12, 25]) {
    const lots = isoLots(n);
    for (let i = 1; i < lots.length; i++) expect(lots[i].u + lots[i].v).toBeGreaterThanOrEqual(lots[i - 1].u + lots[i - 1].v);
    for (const l of lots) {
      expect(Math.abs(l.u) + l.size / 2).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(l.v) + l.size / 2).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(new Set(lots.map((l) => `${l.u.toFixed(3)},${l.v.toFixed(3)}`)).size).toBe(lots.length);
  }
});

test("every pin is inside the frame, on a phone and a wide screen, for the tallest building", () => {
  for (const phone of [false, true]) {
    const f = isoFrame(phone);
    for (const n of [1, 4, 9, 25]) {
      const g = isoGrid(n);
      for (const lot of isoLots(n)) {
        const p = isoPin(f, lot, isoHeight(f, "home", g));
        expect(p.x).toBeGreaterThan(0.05);
        expect(p.x).toBeLessThan(0.95);
        expect(p.y).toBeGreaterThanOrEqual(0.16);
        expect(p.y).toBeLessThan(1);
      }
    }
  }
});

test("the SVG uses theme tokens only and carries no text", () => {
  const svg = isoSvg(isoFrame(false), [
    { id: "a", name: "<b>Evil</b>", kind: "cafe", icon: "x", open: true, count: 2 },
    { id: "b", name: "Park", kind: "park", icon: "x", open: false, count: 0 },
    { id: "c", name: "Flat", kind: "home", icon: "x", open: true, count: 3, doors: ["lit", "dark", "out"] },
  ], "centre");
  expect(svg).not.toContain("Evil");
  expect(svg).not.toContain("<text");
  expect(svg).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  expect(svg).toContain("var(--");
  // a closed place is dimmed
  expect(svg).toContain("opacity:.55");
});

test("the tallest building on the back lot leaves room for its pin above it, without the clamp (the owner saw Building 1 cut off)", () => {
  for (const phone of [false, true]) {
    const f = isoFrame(phone);
    for (const n of [1, 2, 5, 7, 10, 17, 25]) {
      const g = isoGrid(n);
      for (const kind of Object.keys(KIND_LOOK)) {
        for (const lot of isoLots(n)) {
          const [, y] = isoPoint(f, lot.u, lot.v, isoHeight(f, kind, g));
          // a pin is about 44 px tall over a drawing at least 340 px wide: 0.13 of the frame's height is enough room
          expect(y / f.H).toBeGreaterThan(0.13);
        }
      }
      // the plate's front edge and its thickness stay inside the frame
      expect(isoPoint(f, 1, 1)[1] + 14).toBeLessThan(f.H);
    }
  }
});
