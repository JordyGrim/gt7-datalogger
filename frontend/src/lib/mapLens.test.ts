import { describe, expect, it } from "vitest";
import {
  canDraw,
  gainClass,
  GAIN_COLORS,
  INPUT_COLORS,
  lensRuns,
  lensSeries,
  SPEED_COLORS,
  speedBands,
  zoneOf,
} from "./mapLens";

// A 200 m lap sampled every 10 m: full throttle, then braking, then coasting.
function lap() {
  const dist = Array.from({ length: 21 }, (_, i) => i * 10);
  return {
    dist,
    throttle: dist.map((d) => (d < 100 ? 100 : 0)),
    brake: dist.map((d) => (d >= 100 && d < 150 ? 80 : 0)),
    speed: dist.map((d) => 100 + d), // 100 … 300 km/h
  };
}

describe("zoneOf", () => {
  it("brake beats throttle, and neither pedal is coasting", () => {
    expect(zoneOf(100, 0)).toBe(2);
    expect(zoneOf(100, 5)).toBe(0);
    expect(zoneOf(0, 0)).toBe(1);
  });
});

describe("lensSeries · inputs", () => {
  it("classifies every sample and legends the three zones", () => {
    const lens = lensSeries("inputs", lap(), "metric", null)!;
    expect(lens.palette).toBe(INPUT_COLORS);
    expect(lens.keys.slice(0, 3)).toEqual([2, 2, 2]);
    expect(lens.keys[10]).toBe(0);
    expect(lens.keys[20]).toBe(1);
    expect(lens.legend.map((l) => l.label)).toEqual(["throttle", "brake", "coast"]);
  });
});

describe("lensSeries · speed", () => {
  it("splits the lap's own speed range into five bands, rounded to 5", () => {
    expect(speedBands(lap().speed, "metric")).toEqual([140, 180, 220, 260]);
    const lens = lensSeries("speed", lap(), "metric", null)!;
    expect(lens.palette).toBe(SPEED_COLORS);
    expect(lens.keys[0]).toBe(0);
    expect(lens.keys[20]).toBe(4);
    expect(lens.legend[0].label).toBe("< 140");
    expect(lens.legend[4].label).toBe("> 260 km/h");
  });

  it("legends in the user's units", () => {
    const lens = lensSeries("speed", lap(), "imperial", null)!;
    expect(lens.legend[4].label).toMatch(/mph$/);
  });

  it("has nothing to colour by without a speed channel", () => {
    const { dist, throttle, brake } = lap();
    expect(lensSeries("speed", { dist, throttle, brake }, "metric", null)).toBeNull();
  });
});

describe("lensSeries · gain / loss", () => {
  // The comparison lap loses 2 ms a metre over the first half, then holds.
  const gain = {
    label: "L9 · 1:02.000",
    dist: Array.from({ length: 21 }, (_, i) => i * 10),
    delta_ms: Array.from({ length: 21 }, (_, i) => Math.min(i * 10, 100) * 2),
  };

  it("reads the slope of the delta: losing, even, gaining", () => {
    expect(gainClass(gain, 50)).toBe(0);
    expect(gainClass(gain, 180)).toBe(1);
    const gaining = { ...gain, delta_ms: gain.delta_ms.map((v) => -v) };
    expect(gainClass(gaining, 50)).toBe(2);
  });

  it("names the compared lap in the legend", () => {
    const lens = lensSeries("gain", lap(), "metric", gain)!;
    expect(lens.palette).toBe(GAIN_COLORS);
    expect(lens.legend.map((l) => l.label)).toEqual(["L9 gains", "L9 loses", "even"]);
  });

  it("needs a comparison lap", () => {
    expect(lensSeries("gain", lap(), "metric", null)).toBeNull();
  });

  it("answers availability exactly as the renderer does", () => {
    const degenerate = { label: "L9", dist: [0], delta_ms: [0] };
    expect(canDraw("gain", lap(), "metric", degenerate)).toBe(false);
    expect(lensSeries("gain", lap(), "metric", degenerate)).toBeNull();
    expect(canDraw("gain", lap(), "metric", gain)).toBe(true);
    const { dist, throttle, brake } = lap();
    expect(canDraw("speed", { dist, throttle, brake }, "metric", null)).toBe(false);
    expect(canDraw("inputs", { dist, throttle, brake }, "metric", null)).toBe(true);
  });
});

describe("lensRuns", () => {
  it("merges consecutive samples of one class into one run", () => {
    const lens = lensSeries("inputs", lap(), "metric", null)!;
    const runs = lensRuns(lens, lap().dist);
    expect(runs).toEqual([
      { start: 0, end: 100, color: INPUT_COLORS[2] },
      { start: 100, end: 150, color: INPUT_COLORS[0] },
      { start: 150, end: 200, color: INPUT_COLORS[1] },
    ]);
  });
});
