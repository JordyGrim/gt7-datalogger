import { describe, expect, it } from "vitest";
import { formatSplit, sectorBests } from "./sectorTimes";

const laps = [
  { id: 1, number: 1, time_ms: 50_000, counts_for_best: false, splits_ms: [10_000, 20_000, 20_000] },
  { id: 2, number: 2, time_ms: 62_000, counts_for_best: true, splits_ms: [20_000, 21_000, 21_000] },
  { id: 3, number: 3, time_ms: 61_500, counts_for_best: true, splits_ms: [21_000, 20_000, 20_500] },
  { id: 4, number: 4, time_ms: 63_000, counts_for_best: true, splits_ms: null },
];

describe("sectorBests", () => {
  it("takes the best of each sector and the best lap from the counting laps only", () => {
    const bests = sectorBests(laps, 3);
    expect(bests.splits).toEqual([20_000, 20_000, 20_500]);
    expect(bests.lap).toBe(61_500);
  });

  it("has no bests without a counting lap that has splits", () => {
    expect(sectorBests([laps[0], laps[3]], 3)).toEqual({ splits: [null, null, null], lap: 63_000 });
  });
});

describe("formatSplit", () => {
  it("reads as seconds, or minutes past one", () => {
    expect(formatSplit(23_456)).toBe("23.456");
    expect(formatSplit(63_456.4)).toBe("1:03.456");
  });
});
