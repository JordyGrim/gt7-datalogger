// The distance window a corner is shown in, shared by everything that zooms
// to one: the map's corner numbers, the lap strip, the report card and the
// engineer's notes. Shared so that they all agree — the current corner is
// DERIVED from the zoom (the charts can change it too), so the window has to
// be deterministic and the same everywhere.

import type { Corner } from "@/lib/types";

// Before the corner: from where the reference lap began braking for it, so
// the braking zone is in the frame; a corner it did not brake for starts at
// the turn-in instead. After: enough of the exit to see the car straighten.
export const CORNER_LEAD_M = 30;
export const CORNER_TAIL_M = 40;

/** The distance window a corner is shown in. Also the identity used to tell
 *  whether the current zoom IS this corner, so it must be deterministic. */
export function cornerRange(c: Corner): [number, number] {
  const from = c.brake_on ?? c.entry_dist;
  return [
    Math.max(0, from - CORNER_LEAD_M),
    Math.max(c.exit_dist, c.entry_dist, from) + CORNER_TAIL_M,
  ];
}

/** Which corner the current zoom is showing, if it is showing one. Derived
 *  rather than remembered: the charts can change the zoom too (drag, sector
 *  buttons, reset), and a remembered selection would go stale behind them. */
export function selectedCorner(
  corners: Corner[],
  zoom: [number, number] | null | undefined,
): Corner | null {
  if (!zoom) return null;
  return (
    corners.find((c) => {
      const [lo, hi] = cornerRange(c);
      return Math.abs(lo - zoom[0]) < 1 && Math.abs(hi - zoom[1]) < 1;
    }) ?? null
  );
}

/** The corner whose window contains a distance, for a click on the strip or
 *  a tap on the line — the first in track order when windows overlap. */
export function cornerAt(corners: Corner[], dist: number): Corner | null {
  return (
    corners.find((c) => {
      const [lo, hi] = cornerRange(c);
      return dist >= lo && dist <= hi;
    }) ?? null
  );
}

/** The corner `by` steps on from the current one, wrapping: the last
 *  corner's exit is the first one's approach. From no corner, forwards goes
 *  to the first and backwards to the last. */
export function stepCorner(corners: Corner[], current: Corner | null, by: number): Corner | null {
  if (corners.length === 0) return null;
  const index = current ? corners.indexOf(current) : -1;
  const next =
    index < 0 ? (by > 0 ? 0 : corners.length - 1) : (index + by + corners.length) % corners.length;
  return corners[next];
}
