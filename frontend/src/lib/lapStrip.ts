// The lap strip's gestures (#102): one bar for the whole lap under the map,
// and a compact copy over the charts, on which a drag picks a stretch,
// drags near the window's edges resize it, a drag inside slides it, and a
// click with no drag goes to the corner under the pointer. Pure maths over
// pixels and metres, so the component is only wiring.

export const EDGE_GRAB_PX = 9;
export const MIN_SPAN_M = 40;
// A pointer that moved less than this between down and up clicked.
export const CLICK_TOLERANCE_M = 12;

export type Range = [number, number];

export type GrabMode = "new" | "left" | "right" | "move";

export interface Grab {
  mode: GrabMode;
  /** Metres under the pointer when it went down. */
  start: number;
  /** For a move: how far into the window the pointer went down. */
  offset: number;
}

export function clampRange(range: Range, length: number): Range {
  const lo = Math.max(0, Math.min(range[0], range[1]));
  const hi = Math.min(length, Math.max(range[0], range[1]));
  return [lo, hi];
}

/** Metres along the lap under a pointer `x` pixels into a strip `width`
 *  pixels wide. */
export function metresAt(x: number, width: number, length: number): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(length, (x / width) * length));
}

/** What a pointer going down at `x` takes hold of: an edge of the window,
 *  the window itself, or empty bar for a new stretch. */
export function grabAt(x: number, width: number, length: number, range: Range | null): Grab {
  const at = metresAt(x, width, length);
  if (!range || width <= 0) return { mode: "new", start: at, offset: 0 };
  const px = (m: number) => (m / length) * width;
  if (Math.abs(x - px(range[0])) < EDGE_GRAB_PX) return { mode: "left", start: at, offset: 0 };
  if (Math.abs(x - px(range[1])) < EDGE_GRAB_PX) return { mode: "right", start: at, offset: 0 };
  if (x > px(range[0]) && x < px(range[1])) {
    return { mode: "move", start: at, offset: at - range[0] };
  }
  return { mode: "new", start: at, offset: 0 };
}

/** The window after the pointer has moved to `at` metres under a grab. A
 *  new stretch follows the pointer from where it went down; an edge moves
 *  but never within MIN_SPAN_M of the other; a move keeps the window's
 *  width and stays on the lap. */
export function dragRange(grab: Grab, at: number, range: Range | null, length: number): Range {
  if (grab.mode === "new" || !range) {
    return clampRange([Math.min(grab.start, at), Math.max(grab.start, at)], length);
  }
  if (grab.mode === "left") return [Math.max(0, Math.min(at, range[1] - MIN_SPAN_M)), range[1]];
  if (grab.mode === "right") {
    return [range[0], Math.min(length, Math.max(at, range[0] + MIN_SPAN_M))];
  }
  const span = range[1] - range[0];
  const lo = Math.max(0, Math.min(length - span, at - grab.offset));
  return [lo, lo + span];
}

/** Whether a pointer that went down at `grab.start` and is now at `at` has
 *  dragged, as opposed to clicked. */
export function hasDragged(grab: Grab, at: number): boolean {
  return Math.abs(at - grab.start) > CLICK_TOLERANCE_M;
}

/** The map's ⌘/Ctrl + wheel: the window scaled ×1.25 (wheel down) or ×0.8
 *  (wheel up) about `about` metres — the pointer, or the middle without
 *  one — never narrower than MIN_WHEEL_SPAN_M, and the whole lap again
 *  once it would cover nearly all of it. */
export const MIN_WHEEL_SPAN_M = 80;

export function wheelRange(
  range: Range | null,
  length: number,
  about: number | null,
  zoomOut: boolean,
): Range | null {
  const [lo, hi] = range ?? [0, length];
  const span = hi - lo;
  const centre = about ?? (lo + hi) / 2;
  let next = span * (zoomOut ? 1.25 : 0.8);
  if (next >= length * 0.95) return null;
  next = Math.max(MIN_WHEEL_SPAN_M, next);
  // Keep the point under the pointer where it is on screen.
  const fraction = span > 0 ? Math.min(1, Math.max(0, (centre - lo) / span)) : 0.5;
  const start = Math.max(0, Math.min(length - next, centre - next * fraction));
  return [start, start + next];
}

/** A drag on the line itself: the picked samples padded a little either
 *  side, or nothing for a drag too short to mean a stretch. */
export const LINE_DRAG_PAD_M = 15;

export function lineDragRange(brush: Range, length: number): Range | null {
  if (brush[1] - brush[0] < MIN_SPAN_M) return null;
  return [Math.max(0, brush[0] - LINE_DRAG_PAD_M), Math.min(length, brush[1] + LINE_DRAG_PAD_M)];
}

/** Whether a window is really the whole lap. */
export function isFullLap(range: Range | null, length: number): boolean {
  return !range || range[1] - range[0] >= length * 0.97;
}
