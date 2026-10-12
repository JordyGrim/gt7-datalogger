import { describe, expect, it } from "vitest";
import { boundariesFromSplits, formatClock, parseClock } from "./sectorSplits";

// A 60 s lap along +x at 10 m/s, sampled every second.
const lap = {
  t: Array.from({ length: 61 }, (_, i) => i),
  pos_x: Array.from({ length: 61 }, (_, i) => i * 10),
  pos_z: Array.from({ length: 61 }, () => 0),
  time_ms: 60_000,
};

describe("parseClock", () => {
  it("reads the ways a split gets typed", () => {
    expect(parseClock("25.123")).toBe(25_123);
    expect(parseClock("0:25.123")).toBe(25_123);
    expect(parseClock("1:02.5")).toBe(62_500);
    expect(parseClock("25")).toBe(25_000);
    expect(parseClock("25,1")).toBe(25_100);
  });

  it("refuses what is not a time", () => {
    expect(parseClock("")).toBeNull();
    expect(parseClock("fast")).toBeNull();
    expect(parseClock("1:2:3")).toBeNull();
  });
});

describe("formatClock", () => {
  it("prints m:ss.mmm", () => {
    expect(formatClock(25_123)).toBe("0:25.123");
    expect(formatClock(62_500)).toBe("1:02.500");
  });
});

describe("boundariesFromSplits", () => {
  it("places each boundary where the lap was that far into its clock", () => {
    const result = boundariesFromSplits(lap, [25_000, 20_000]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boundaries.map((b) => [b.x, b.z, b.at_ms])).toEqual([
      [250, 0, 25_000],
      [450, 0, 45_000],
    ]);
    expect(result.remainder_ms).toBe(15_000);
  });

  it("interpolates between samples", () => {
    const result = boundariesFromSplits(lap, [25_500]);
    expect(result.ok && result.boundaries[0].x).toBe(255);
  });

  it("refuses sectors that run past the lap, or an empty one", () => {
    const past = boundariesFromSplits(lap, [40_000, 25_000]);
    expect(past.ok).toBe(false);
    expect(!past.ok && past.error).toMatch(/past the lap time/);
    expect(boundariesFromSplits(lap, [25_000, 0]).ok).toBe(false);
    expect(boundariesFromSplits(lap, []).ok).toBe(false);
  });

  it("needs a path and a lap time", () => {
    expect(boundariesFromSplits({ ...lap, pos_x: [] }, [25_000]).ok).toBe(false);
    expect(boundariesFromSplits({ ...lap, time_ms: 0 }, [25_000]).ok).toBe(false);
  });
});
