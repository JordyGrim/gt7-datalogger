import { describe, expect, it } from "vitest";
import { cornerAt, cornerRange, selectedCorner, stepCorner } from "./cornerZoom";
import type { Corner } from "./types";

function corner(n: number, entry: number, exit: number, brakeOn?: number | null): Corner {
  return {
    n,
    apex_dist: (entry + exit) / 2,
    apex_x: 0,
    apex_z: 0,
    entry_dist: entry,
    exit_dist: exit,
    direction: "R",
    min_speed: 90,
    angle_deg: 60,
    ...(brakeOn !== undefined ? { brake_on: brakeOn } : {}),
  };
}

const T1 = corner(1, 200, 300, 150);
const T2 = corner(2, 600, 700, null);
const T3 = corner(3, 20, 60);

describe("cornerRange", () => {
  it("starts 30 m before the reference's brake point and ends 40 m past the exit", () => {
    expect(cornerRange(T1)).toEqual([120, 340]);
  });

  it("starts at the turn-in when the reference did not brake, and never before the line", () => {
    expect(cornerRange(T2)).toEqual([570, 740]);
    expect(cornerRange(T3)).toEqual([0, 100]);
  });
});

describe("selectedCorner", () => {
  it("recognises its own window and nothing else", () => {
    expect(selectedCorner([T1, T2], [120, 340])).toBe(T1);
    expect(selectedCorner([T1, T2], [120, 350])).toBeNull();
    expect(selectedCorner([T1, T2], null)).toBeNull();
  });
});

describe("cornerAt", () => {
  it("finds the corner whose window holds a distance", () => {
    expect(cornerAt([T1, T2], 130)).toBe(T1);
    expect(cornerAt([T1, T2], 700)).toBe(T2);
    expect(cornerAt([T1, T2], 450)).toBeNull();
  });
});

describe("stepCorner", () => {
  it("steps and wraps, and starts from either end", () => {
    expect(stepCorner([T1, T2], T1, 1)).toBe(T2);
    expect(stepCorner([T1, T2], T2, 1)).toBe(T1);
    expect(stepCorner([T1, T2], null, 1)).toBe(T1);
    expect(stepCorner([T1, T2], null, -1)).toBe(T2);
    expect(stepCorner([], null, 1)).toBeNull();
  });
});
