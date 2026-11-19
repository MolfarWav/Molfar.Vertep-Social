// C5 (#453): the drawn layer of a district, in the isometric style the owner picked (2026-11-18). One plate per district, one building
// per place on its own lot, a pin on each roof (the place's icon and how many people are there). The pins are the buttons; the drawing
// itself is decoration (aria-hidden), and the tiles under it stay the list for phones and screen readers. A district with its own
// picture (#452) shows the picture under the same pins instead of the drawing.
//
// The SVG is built as a string from numbers and theme tokens only (no text from the user goes into it), so it follows the three themes.
import { useMemo, useState, type CSSProperties } from "react";
import { useT } from "@/i18n/index";
import { ISO_MAX, KIND_LOOK, isoAllLots, isoFrame, isoGrid, isoHeight, isoPin, isoPoint, isoSlots, type IsoFrame, type IsoLot } from "./iso";
import type { DistrictLots } from "./api";

export interface IsoSpot {
  id: string;
  name: string;
  kind: string;
  icon: string;
  open: boolean;
  /** People there now (for Homes: doors in the building). */
  count: number;
  /** Homes only: the state of each door, for the windows. */
  doors?: ("lit" | "dark" | "out")[];
}

const f1 = (n: number) => Math.round(n * 10) / 10;
const pts = (p: [number, number][]) => p.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");
const poly = (p: [number, number][], fill: string, stroke = EDGE) => `<polygon points="${pts(p)}" style="fill:${fill};stroke:${stroke};stroke-width:1"/>`;
const shade = (c: string, pct: number) => `color-mix(in srgb, ${c}, black ${pct}%)`;
const EDGE = "color-mix(in srgb, var(--ink) 22%, transparent)";
const GROUND = "color-mix(in srgb, var(--ink) 7%, var(--panel))";
const GRASS = "color-mix(in srgb, var(--ok) 20%, var(--panel))";
const ROAD = "color-mix(in srgb, var(--ink) 15%, var(--base))";
const TREE = "color-mix(in srgb, var(--ok) 55%, var(--raised))";
const WOOD = "color-mix(in srgb, var(--warn) 35%, var(--raised))";
const GLASS = "color-mix(in srgb, var(--ink) 10%, var(--base))";
const LIT = "color-mix(in srgb, var(--warn) 80%, var(--raised))";

/** A quad of the plate between (u0, v0) and (u1, v1) at height 0. */
const quad = (f: IsoFrame, u0: number, v0: number, u1: number, v1: number, fill: string, stroke = "none") => poly([isoPoint(f, u0, v0), isoPoint(f, u1, v0), isoPoint(f, u1, v1), isoPoint(f, u0, v1)], fill, stroke);

function tree(f: IsoFrame, u: number, v: number, r: number): string {
  const [x, y] = isoPoint(f, u, v);
  return `<ellipse cx="${f1(x)}" cy="${f1(y + 2)}" rx="${f1(r * 0.9)}" ry="${f1(r * 0.4)}" style="fill:rgb(0 0 0 / .16)"/><rect x="${f1(x - 2)}" y="${f1(y - r)}" width="4" height="${f1(r)}" style="fill:${WOOD}"/><circle cx="${f1(x)}" cy="${f1(y - r - r * 0.55)}" r="${f1(r)}" style="fill:${TREE};stroke:${EDGE};stroke-width:1"/>`;
}

/** Windows on the two visible walls: rows of small panes, the doors' states for Homes, lit when the place is open. */
function windows(f: IsoFrame, lot: IsoLot, w: number, h: number, spot: IsoSpot): string {
  const rows = Math.max(1, Math.min(6, Math.floor(h / 22)));
  const cols = 3;
  let s = "";
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // the left wall runs from (u - w/2, v + w/2) to (u + w/2, v + w/2)
      const a = (c + 0.2) / cols;
      const b = (c + 0.8) / cols;
      const z0 = h - (r + 0.25) * (h / rows);
      const z1 = h - (r + 0.75) * (h / rows);
      const u0 = lot.u - w / 2 + a * w;
      const u1 = lot.u - w / 2 + b * w;
      const v = lot.v + w / 2;
      const door = spot.doors ? spot.doors[i % Math.max(1, spot.doors.length)] : undefined;
      i++;
      const fill = door ? (door === "lit" ? LIT : GLASS) : spot.open && (r + c) % 3 !== 1 ? LIT : GLASS;
      const dash = door === "out" ? ";stroke-dasharray:3 2" : "";
      s += `<polygon points="${pts([isoPoint(f, u0, v, z0), isoPoint(f, u1, v, z0), isoPoint(f, u1, v, z1), isoPoint(f, u0, v, z1)])}" style="fill:${fill};stroke:${EDGE};stroke-width:1${dash}"/>`;
    }
  }
  return s;
}

/** One lot: a building (or, for a park, grass, trees and a low pavilion), dimmed when the place is closed. */
function building(f: IsoFrame, lot: IsoLot, spot: IsoSpot, h: number): string {
  const look = KIND_LOOK[spot.kind] ?? KIND_LOOK.custom;
  // a lone place on a whole plate stays a building, not a slab
  const w = Math.min(lot.size, 1) * (spot.kind === "park" ? 0.3 : 0.62);
  let s = "";
  if (spot.kind === "park") {
    const g = lot.size * 0.42;
    s += quad(f, lot.u - g, lot.v - g, lot.u + g, lot.v + g, GRASS, EDGE);
    const r = 9 * (f.K / 192) * (2 / isoGrid(4)) * lot.size * 1.6;
    s += tree(f, lot.u - g * 0.6, lot.v - g * 0.6, r) + tree(f, lot.u + g * 0.55, lot.v - g * 0.5, r * 0.9);
  }
  const A = isoPoint(f, lot.u - w / 2, lot.v - w / 2, h);
  const B = isoPoint(f, lot.u + w / 2, lot.v - w / 2, h);
  const C = isoPoint(f, lot.u + w / 2, lot.v + w / 2, h);
  const D = isoPoint(f, lot.u - w / 2, lot.v + w / 2, h);
  const C0 = isoPoint(f, lot.u + w / 2, lot.v + w / 2);
  const D0 = isoPoint(f, lot.u - w / 2, lot.v + w / 2);
  const B0 = isoPoint(f, lot.u + w / 2, lot.v - w / 2);
  s += poly([D, C, C0, D0], shade(look.fill, 18)) + poly([C, B, B0, C0], shade(look.fill, 34));
  if (spot.kind !== "park") s += windows(f, lot, w, h, spot);
  s += poly([A, B, C, D], look.fill);
  if (spot.kind === "park") {
    const g = lot.size * 0.42;
    s += tree(f, lot.u + g * 0.6, lot.v + g * 0.55, 9 * (f.K / 192) * lot.size * 1.6);
  }
  return spot.open ? s : `<g style="opacity:.55">${s}</g>`;
}

/** The whole drawing: the plate, the roads between the lots, a few trees, and the buildings back to front. */
export function isoSvg(f: IsoFrame, spots: IsoSpot[], districtKind: string, slots?: number[]): string {
  const all = isoAllLots(spots.length);
  const at = slots ?? spots.map((_, i) => i);
  const lots = at.map((k) => all[k]);
  const g = isoGrid(Math.min(spots.length, ISO_MAX));
  const T = 14;
  const nature = districtKind === "nature";
  let s = `<defs><radialGradient id="ct-iso-glow" cx="50%" cy="55%" r="65%"><stop offset="0" style="stop-color:color-mix(in srgb, var(--cta) 10%, var(--panel))"/><stop offset="1" style="stop-color:var(--base)"/></radialGradient></defs>`;
  s += `<rect width="${f.W}" height="${f.H}" style="fill:url(#ct-iso-glow)"/>`;
  const P = (u: number, v: number) => isoPoint(f, u, v);
  const down = (p: [number, number]): [number, number] => [p[0], p[1] + T];
  s += poly([P(-1, 1), P(1, 1), down(P(1, 1)), down(P(-1, 1))], shade(nature ? GRASS : GROUND, 28));
  s += poly([P(1, 1), P(1, -1), down(P(1, -1)), down(P(1, 1))], shade(nature ? GRASS : GROUND, 42));
  s += poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], nature ? GRASS : GROUND);
  // roads (or paths, in nature) between the lots
  const rw = 0.05;
  for (let k = 1; k < g; k++) {
    const at = -1 + (2 * k) / g;
    s += quad(f, at - rw, -1, at + rw, 1, nature ? WOOD : ROAD) + quad(f, -1, at - rw, 1, at + rw, nature ? WOOD : ROAD);
  }
  if (nature) s += quad(f, 0.86, -1, 1, 1, "color-mix(in srgb, var(--cta) 32%, var(--base))", EDGE);
  // trees along the far edges, so the plate does not look bare
  const r = 7 * (f.K / 192);
  let deco = "";
  for (let k = 0; k < g; k++) {
    const at = -1 + (2 * (k + 0.5)) / g;
    deco += tree(f, -0.96, at, r) + tree(f, at, -0.96, r);
  }
  s += deco;
  const items = lots.map((lot, i) => {
    const spot = spots[i];
    return { z: lot.u + lot.v, s: building(f, lot, spot, isoHeight(f, spot.kind, g)) };
  });
  // a lot nobody uses is a small green with two trees
  const used = new Set(at);
  for (const lot of all.filter((_, k) => !used.has(k))) {
    const q = lot.size * 0.4;
    const tr = 10 * (f.K / 192) * lot.size;
    items.push({ z: lot.u + lot.v, s: quad(f, lot.u - q, lot.v - q, lot.u + q, lot.v + q, GRASS, EDGE) + tree(f, lot.u - q * 0.4, lot.v - q * 0.2, tr) + tree(f, lot.u + q * 0.35, lot.v + q * 0.3, tr * 0.85) });
  }
  items.sort((a, b) => a.z - b.z);
  return s + items.map((x) => x.s).join("");
}

export function IsoMap({ spots, districtKind, name, picture, phone, selected, onPick, saved, onLayout }: { spots: IsoSpot[]; districtKind: string; name: string; picture?: string; phone: boolean; selected: string; onPick: (id: string) => void; saved?: DistrictLots | null; onLayout?: (lots: DistrictLots | null) => void }) {
  const t = useT();
  const f = useMemo(() => isoFrame(phone), [phone]);
  const shown = spots.slice(0, ISO_MAX);
  const ids = shown.map((x) => x.id);
  const idsKey = ids.join(",");
  // where each place stands: the user's own order (#458) while it fits the grid, else the tiles' order
  // biome-ignore lint/correctness/useExhaustiveDependencies: `idsKey` stands for `ids`
  const slots = useMemo(() => isoSlots(ids, saved), [idsKey, saved]);
  const all = useMemo(() => isoAllLots(shown.length), [shown.length]);
  const g = isoGrid(shown.length);
  const [moving, setMoving] = useState(false);
  const [grab, setGrab] = useState("");
  // the drawing changes only with what it shows: kinds, open or not, the doors' windows (not with names or counts)
  const look = JSON.stringify(shown.map((x) => [x.kind, x.open, x.doors ?? null]));
  const slotsKey = slots.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `look` stands for `shown`, `slotsKey` for `slots`
  const svg = useMemo(() => (picture ? "" : isoSvg(f, shown, districtKind, slots)), [f, look, districtKind, picture, slotsKey]);
  if (!shown.length) return null;
  // names stay readable only on a small grid of a wide screen; otherwise the selected place is named under the drawing
  const labels = !phone && g <= 3;
  const sel = shown.find((x) => x.id === selected);
  // Rearrange (#458): pick a place, then a free lot or another place (they swap); every move is saved at once
  const canMove = !!onLayout && shown.length >= 2;
  const edit = canMove && moving;
  const grabbed = shown.find((x) => x.id === grab);
  const put = (i: number, slot: number) => {
    if (!onLayout) return;
    const next = slots.slice();
    const j = next.indexOf(slot);
    if (j >= 0 && j !== i) next[j] = next[i];
    next[i] = slot;
    onLayout({ g, at: Object.fromEntries(ids.map((id, k) => [id, next[k]])) });
    setGrab("");
  };
  const onPin = (i: number) => {
    const x = shown[i];
    if (!edit) return onPick(x.id);
    if (!grab) return setGrab(x.id);
    if (grab === x.id) return setGrab("");
    put(ids.indexOf(grab), slots[i]);
  };
  const free = edit && grab ? all.map((lot, k) => ({ lot, k })).filter(({ k }) => !slots.includes(k)) : [];
  const hasOwn = !!saved && saved.g === g;
  return (
    <div className="ct-iso-wrap">
      <div className={`ct-iso${phone ? " is-phone" : ""}${picture ? " has-pic" : ""}${edit ? " is-moving" : ""}`} style={picture ? ({ "--bd": `url("${picture}")` } as CSSProperties) : undefined} role="group" aria-label={t("city.map.label", { name })}>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the string is built from numbers and theme tokens only (isoSvg), no user text */}
        {!picture && <svg viewBox={`0 0 ${f.W} ${f.H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: svg }} />}
        {free.map(({ lot, k }) => {
          const at = isoPin(f, lot, 0);
          return (
            <button key={`lot-${k}`} type="button" className="ct-lot" style={{ left: `${at.x * 100}%`, top: `${Math.min(0.92, at.y) * 100}%` }} aria-label={t("city.map.moveHere", { name: grabbed?.name ?? "" })} title={t("city.map.moveHere", { name: grabbed?.name ?? "" })} onClick={() => put(ids.indexOf(grab), k)} />
          );
        })}
        {shown.map((x, i) => {
          const pin = isoPin(f, all[slots[i]], isoHeight(f, x.kind, g));
          const label = x.doors ? t("city.map.pin.homes", { name: x.name, n: x.count }) : t(x.open ? "city.map.pin.open" : "city.map.pin.closed", { name: x.name, n: x.count });
          const on = edit ? x.id === grab : x.id === selected;
          return (
            <button key={x.id} type="button" className={`ct-pin${on ? " on" : ""}${x.open ? "" : " is-closed"}`} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }} aria-pressed={on} aria-label={label} title={x.name} onClick={() => onPin(i)}>
              <span className="ct-pin-dot" aria-hidden="true">
                {x.icon}
                <span className={`ct-pin-n${x.count === 0 ? " zero" : ""}`}>{x.count}</span>
              </span>
              {(labels || !x.open) && (
                <span className="ct-pin-lab" aria-hidden="true">
                  {labels && <span>{x.name}</span>}
                  {!x.open && <em>{t("city.closed")}</em>}
                </span>
              )}
            </button>
          );
        })}
        <span className="ct-iso-name" aria-hidden="true">{name}</span>
      </div>
      {canMove && (
        <div className={`ct-iso-tools${phone ? " is-phone" : ""}`}>
          <button type="button" className={`chip${edit ? " on" : ""}`} aria-pressed={edit} onClick={() => { setMoving(!moving); setGrab(""); }}>{edit ? t("city.map.moveDone") : t("city.map.move")}</button>
          {edit && hasOwn && <button type="button" className="chip" onClick={() => { onLayout?.(null); setGrab(""); }}>{t("city.map.moveReset")}</button>}
        </div>
      )}
      {edit && <p className="k ct-iso-cap" role="status">{grabbed ? t("city.map.moveGrabbed", { name: `${grabbed.icon} ${grabbed.name}` }) : t("city.map.moveHint")}</p>}
      {!edit && !labels && sel && <p className="k ct-iso-cap" aria-hidden="true">{sel.icon} {sel.name}{sel.open ? "" : ` · ${t("city.closed")}`}</p>}
      {spots.length > ISO_MAX && <p className="k">{t("city.map.more", { n: spots.length - ISO_MAX })}</p>}
    </div>
  );
}
