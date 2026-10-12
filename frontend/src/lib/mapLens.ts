// How the race line is coloured (#102): by what the driver was doing
// (throttle / brake / coast — the classic view), by speed, or by where the
// compared lap gains or loses time against the reference. One colouring at a
// time; the same classes colour the lap strip under the map, so the strip is
// the line unrolled.
//
// Pure functions over the compare endpoint's series, kept out of the map so
// they can be tested without a chart. Colours are literals because a canvas
// cannot read CSS custom properties; they match the tokens in index.css.

import { speedUnit, speedValue, type Units } from "@/lib/format";
import type { Samples } from "@/lib/types";

export type MapLens = "inputs" | "speed" | "gain";

export const LENS_OPTIONS: { value: MapLens; label: string }[] = [
  { value: "inputs", label: "Inputs" },
  { value: "speed", label: "Speed" },
  { value: "gain", label: "Gain / loss" },
];

const THROTTLE = "#4ade80";
const BRAKE = "#f47272";
const COAST = "#5b93f5";
const WARN = "#f5b14e";
const EVEN = "#6b7482"; // --color-ink-faint

// Input zones, indexed as zoneOf returns them: brake, coast, throttle.
export const INPUT_COLORS = [BRAKE, COAST, THROTTLE];
// Five speed bands, slowest first: brake red through amber to throttle
// green, the two in-between mixed half and half.
export const SPEED_COLORS = [BRAKE, "#f49160", WARN, "#9fc767", THROTTLE];
// Gain / loss, indexed as gainClass returns them: loses, even, gains.
export const GAIN_COLORS = [BRAKE, EVEN, THROTTLE];

export const SPEED_BANDS = 5;

// Time lost or gained per metre of track before a stretch counts as one or
// the other: 0.3 ms per metre is 9 ms across the 30 m window it is measured
// over, about the smallest difference the delta chart shows as a slope.
export const GAIN_THRESHOLD_S_PER_M = 0.0003;
// Half the window the slope is measured over, in metres.
export const GAIN_HALF_WINDOW_M = 15;

export function zoneOf(throttle: number, brake: number): number {
  if (brake >= 1) return 0;
  if (throttle >= 1) return 2;
  return 1;
}

export interface LensLegendEntry {
  label: string;
  color: string;
}

export interface LensSeries {
  /** One class per sample of the reference series, indexing `palette`. */
  keys: number[];
  palette: string[];
  legend: LensLegendEntry[];
}

/** A comparison lap's time-delta series against the reference, as the
 *  compare endpoint returns it, plus the name the legend calls the lap. */
export interface GainSource {
  label: string;
  dist: number[];
  delta_ms: number[];
}

function interpolate(xs: number[], ys: number[], x: number): number {
  if (xs.length === 0) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  if (span <= 0) return ys[lo];
  return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / span;
}

/** Gain / loss class at a distance: 0 loses, 1 even, 2 gains — read off the
 *  slope of the delta over a short window either side. */
export function gainClass(source: GainSource, dist: number): number {
  const before = interpolate(source.dist, source.delta_ms, dist - GAIN_HALF_WINDOW_M);
  const after = interpolate(source.dist, source.delta_ms, dist + GAIN_HALF_WINDOW_M);
  const slope = (after - before) / 1000 / (2 * GAIN_HALF_WINDOW_M);
  if (slope > GAIN_THRESHOLD_S_PER_M) return 0; // the gap grows: losing
  if (slope < -GAIN_THRESHOLD_S_PER_M) return 2;
  return 1;
}

/** Speed band edges for a lap: five equal bands across its speed range, in
 *  the user's units and rounded to the nearest 5, so the legend reads as
 *  round figures. Null on a lap without a speed channel. */
export function speedBands(speed: number[] | undefined, units: Units): number[] | null {
  if (!speed || speed.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of speed) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1) return null;
  const edges: number[] = [];
  for (let k = 1; k < SPEED_BANDS; k++) {
    const kmh = lo + ((hi - lo) * k) / SPEED_BANDS;
    edges.push(Math.round(speedValue(kmh, units) / 5) * 5);
  }
  return edges;
}

function speedBand(shown: number, edges: number[]): number {
  let band = 0;
  while (band < edges.length && shown >= edges[band]) band++;
  return band;
}

/**
 * The reference series classified under one lens. Null when the lens has
 * nothing to colour by — speed on a lap without the channel, gain / loss
 * with no comparison lap — so the caller falls back to inputs.
 */
export function lensSeries(
  lens: MapLens,
  series: Samples & { dist: number[] },
  units: Units,
  gain: GainSource | null,
): LensSeries | null {
  const n = series.dist.length;
  if (lens === "speed") {
    const edges = speedBands(series.speed, units);
    if (!edges) return null;
    const unit = speedUnit(units);
    const keys = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      keys[i] = speedBand(speedValue(series.speed[i], units), edges);
    }
    return {
      keys,
      palette: SPEED_COLORS,
      legend: [
        { label: `< ${edges[0]}`, color: SPEED_COLORS[0] },
        ...edges.slice(1).map((edge, i) => ({ label: String(edge), color: SPEED_COLORS[i + 1] })),
        { label: `> ${edges[edges.length - 1]} ${unit}`, color: SPEED_COLORS[SPEED_BANDS - 1] },
      ],
    };
  }
  if (lens === "gain") {
    if (!gain || gain.dist.length < 2) return null;
    const keys = new Array<number>(n);
    for (let i = 0; i < n; i++) keys[i] = gainClass(gain, series.dist[i]);
    const name = gain.label.split(" ")[0];
    return {
      keys,
      palette: GAIN_COLORS,
      legend: [
        { label: `${name} gains`, color: GAIN_COLORS[2] },
        { label: `${name} loses`, color: GAIN_COLORS[0] },
        { label: "even", color: GAIN_COLORS[1] },
      ],
    };
  }
  const throttle = series.throttle ?? [];
  const brake = series.brake ?? [];
  const keys = new Array<number>(n);
  for (let i = 0; i < n; i++) keys[i] = zoneOf(throttle[i] ?? 0, brake[i] ?? 0);
  return {
    keys,
    palette: INPUT_COLORS,
    legend: [
      { label: "throttle", color: THROTTLE },
      { label: "brake", color: BRAKE },
      { label: "coast", color: COAST },
    ],
  };
}

export interface LensRun {
  /** Metres along the lap where the run starts and ends. */
  start: number;
  end: number;
  color: string;
}

/** Contiguous stretches of one class, for drawing the lap strip as a few
 *  rectangles rather than one per sample. Each run ends where the next
 *  begins; the last ends on the lap's length. */
export function lensRuns(lens: LensSeries, dist: number[]): LensRun[] {
  const out: LensRun[] = [];
  const n = Math.min(lens.keys.length, dist.length);
  if (n === 0) return out;
  let start = dist[0];
  let key = lens.keys[0];
  for (let i = 1; i < n; i++) {
    if (lens.keys[i] === key) continue;
    out.push({ start, end: dist[i], color: lens.palette[key] });
    start = dist[i];
    key = lens.keys[i];
  }
  out.push({ start, end: dist[n - 1], color: lens.palette[key] });
  return out;
}
