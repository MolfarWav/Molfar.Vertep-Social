// C5 (#453): the geometry of the City's drawn layer, an isometric plate with one building per place. Pure: no DOM, so it is tested
// on its own (test/city-iso.test.ts). The plate spans u, v in [-1, 1]; each place gets a lot of a square grid, in the order given.

/** The most places a district's drawing holds; a district with more shows the drawing for the first ones and every place in the list. */
export const ISO_MAX = 25;

export interface IsoFrame {
  /** The drawing's size in SVG units (the viewBox). */
  W: number;
  H: number;
  /** Half the width of the plate along one axis, in units. */
  K: number;
  cx: number;
  cy: number;
}

/** The frame: 16:9 on a wide screen, 4:3 on a phone. The plate (2K wide each side of the centre) stays inside the width, so no pin is cut. */
export function isoFrame(phone: boolean): IsoFrame {
  const W = 800;
  const H = phone ? 600 : 450;
  // the plate sits low in the frame, so tall buildings at the back and their pins have room above it
  const K = W * (phone ? 0.235 : 0.2);
  return { W, H, K, cx: W / 2, cy: H - K - 22 };
}

/** A point of the plate (u, v) at height z, in SVG units. */
export function isoPoint(f: IsoFrame, u: number, v: number, z = 0): [number, number] {
  return [f.cx + (u - v) * f.K, f.cy + ((u + v) * f.K) / 2 - z];
}

/** How many lots a side for `n` places: 1 for one, 2 for up to 4, 3 for up to 9, 4 for up to 16, else 5. */
export const isoGrid = (n: number): number => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5);

export interface IsoLot {
  /** The centre of the lot on the plate. */
  u: number;
  v: number;
  /** The side of the lot (in plate units). */
  size: number;
}

/**
 * The lots of `n` places, back to front so the first place sits at the back corner: row by row along u + v, which is also the order to
 * draw them in. At most ISO_MAX.
 */
export function isoLots(n: number): IsoLot[] {
  return isoAllLots(n).slice(0, Math.min(n, ISO_MAX));
}

/** Every lot of the grid for `n` places, the empty ones after the used ones (they are drawn as green). */
export function isoAllLots(n: number): IsoLot[] {
  const g = isoGrid(Math.min(n, ISO_MAX));
  const size = 2 / g;
  const all: IsoLot[] = [];
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) all.push({ u: -1 + size * (i + 0.5), v: -1 + size * (j + 0.5), size });
  all.sort((a, b) => a.u + a.v - (b.u + b.v) || a.u - b.u);
  return all;
}

/** Where a pin sits on the drawing, as a share of its width and height (0 to 1): the top of the building of the lot. */
export function isoPin(f: IsoFrame, lot: IsoLot, height: number): { x: number; y: number } {
  const [x, y] = isoPoint(f, lot.u, lot.v, height);
  // the pin hangs above the roof: keep it inside the frame
  return { x: Math.min(0.94, Math.max(0.06, x / f.W)), y: Math.max(0.16, y / f.H) };
}

/** The look of a building by the kind of place: height (units, before scaling) and its colour (theme tokens only). */
export const KIND_LOOK: Record<string, { h: number; fill: string }> = {
  cafe: { h: 62, fill: "color-mix(in srgb, var(--accent) 42%, var(--raised))" },
  library: { h: 88, fill: "color-mix(in srgb, var(--cta) 30%, var(--raised))" },
  shop: { h: 52, fill: "color-mix(in srgb, var(--ok) 30%, var(--raised))" },
  club: { h: 70, fill: "color-mix(in srgb, var(--ink) 22%, var(--raised))" },
  workplace: { h: 96, fill: "color-mix(in srgb, var(--cta) 22%, var(--raised))" },
  park: { h: 16, fill: "color-mix(in srgb, var(--ok) 28%, var(--raised))" },
  custom: { h: 58, fill: "color-mix(in srgb, var(--warn) 26%, var(--raised))" },
  home: { h: 84, fill: "color-mix(in srgb, var(--ink) 16%, var(--raised))" },
};

/** The height of a building on a grid of side `g` (smaller lots, lower buildings), scaled to the frame. */
export const isoHeight = (f: IsoFrame, kind: string, g: number): number => (KIND_LOOK[kind] ?? KIND_LOOK.custom).h * (f.K / 192) * (2 / Math.max(g, 2)) ** 0.6;
