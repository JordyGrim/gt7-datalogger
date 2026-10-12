import { describe, expect, it } from "vitest";
import { borderPolylines, chainSegments, simplify } from "./outline";

describe("chainSegments", () => {
  it("joins segments end to start, and starts a new line at a gap", () => {
    const chains = chainSegments([
      [0, 0, 1, 0],
      [1, 0, 2, 0],
      [2, 0, 3, 1],
      [10, 10, 11, 10],
    ]);
    expect(chains).toEqual([
      [[0, 0], [1, 0], [2, 0], [3, 1]],
      [[10, 10], [11, 10]],
    ]);
  });
});

describe("simplify", () => {
  it("drops the points along a straight, keeps the corner", () => {
    const points: [number, number][] = [[0, 0], [1, 0.01], [2, 0], [3, 0], [3, 1], [3, 2]];
    expect(simplify(points, 0.5)).toEqual([[0, 0], [3, 0], [3, 2]]);
  });

  it("keeps a bend wider than the tolerance", () => {
    const points: [number, number][] = [[0, 0], [1, 0.8], [2, 0]];
    expect(simplify(points, 0.5)).toEqual(points);
  });
});

describe("borderPolylines", () => {
  it("returns chained borders as lines and lone ticks as segments", () => {
    const { lines, loose } = borderPolylines([
      [0, 0, 1, 0],
      [1, 0, 2, 0],
      [2, 0, 3, 0],
      [50, 50, 50.5, 50],
    ]);
    expect(lines).toEqual([[[0, 0], [3, 0]]]);
    expect(loose).toEqual([[50, 50, 50.5, 50]]);
  });
});
