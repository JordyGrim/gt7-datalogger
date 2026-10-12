// The surveyed road's borders as polylines (#102). The outline endpoint
// flattens each compiled border to one short segment per metre — thousands
// of them on a long circuit, each a separate thing for the map to project on
// every frame of a zoom animation. Chained back into the polylines they came
// from and thinned to the corners that matter at map scale, the same
// borders are a few hundred points.

export type Point = [number, number];

// Two segment ends this close are the same point: the server rounds to a
// centimetre, so a joint is exact or it is not a joint.
const JOINT_M = 0.011;

/** The segments `[x1, z1, x2, z2]` joined end to start into polylines. A
 *  segment whose start is not the previous one's end begins a new line, so
 *  the legacy per-metre ticks (which never join) come back one point each
 *  and are left for the segment drawing. */
export function chainSegments(segments: number[][]): Point[][] {
  const chains: Point[][] = [];
  let current: Point[] | null = null;
  for (const seg of segments) {
    if (seg.length < 4) continue;
    const start: Point = [seg[0], seg[1]];
    const end: Point = [seg[2], seg[3]];
    const last = current?.[current.length - 1];
    if (
      last &&
      Math.abs(last[0] - start[0]) < JOINT_M &&
      Math.abs(last[1] - start[1]) < JOINT_M
    ) {
      current!.push(end);
    } else {
      current = [start, end];
      chains.push(current);
    }
  }
  return chains;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Ramer–Douglas–Peucker: the polyline with every point dropped that lies
 *  within `tolerance` metres of the line through its neighbours. Iterative,
 *  so a 5,000-point border never recurses 5,000 deep. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    let worst = -1;
    let worstAt = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distanceToSegment(points[i], points[lo], points[hi]);
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push([lo, worstAt], [worstAt, hi]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export const BORDER_TOLERANCE_M = 0.5;

/** The border segments as simplified polylines, with the segments that
 *  chained into nothing (the legacy ticks) returned separately for the
 *  per-segment drawing. */
export function borderPolylines(segments: number[][]): { lines: Point[][]; loose: number[][] } {
  const lines: Point[][] = [];
  const loose: number[][] = [];
  for (const chain of chainSegments(segments)) {
    if (chain.length <= 2) {
      loose.push([chain[0][0], chain[0][1], chain[1][0], chain[1][1]]);
    } else {
      lines.push(simplify(chain, BORDER_TOLERANCE_M));
    }
  }
  return { lines, loose };
}
