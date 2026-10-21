// The race line map's hover readout (#159) has to agree with the chart
// tooltip it sits above: the same rows in the same order, the same units,
// each lap read at its sample nearest the pointer, and nothing listed that
// no lap carries.

import { describe, expect, it } from "vitest";
import { CHANNEL_BY_KEY } from "./channels";
import { mapReadout } from "./mapReadout";
import type { CompareLapEntry } from "./types";

// Three laps on the reference's 10 m grid, 50 m long. The reference has no
// delta of its own; the others do.
function lap(over: Partial<CompareLapEntry["series"]>, delta?: number[]): CompareLapEntry {
  const dist = [0, 10, 20, 30, 40, 50];
  return {
    series: {
      dist,
      speed: [100, 110, 120, 130, 140, 150],
      gear: [3, 3, 4, 4, 4, 5],
      suggested_gear: [15, 15, 3, 3, 15, 15],
      ...over,
    },
    peaks_valleys: { peaks: [], valleys: [] },
    ...(delta ? { delta: { dist, delta_ms: delta } } : {}),
  } as CompareLapEntry;
}

const ref = lap({});
const other = lap({ speed: [90, 100, 112, 125, 138, 149] }, [0, 50, 250, 300, 310, 320]);
const channels = [CHANNEL_BY_KEY.speed, CHANNEL_BY_KEY.gear];

describe("mapReadout", () => {
  it("leads with the time diff, then the panels, with GT7's suggestion under Gear", () => {
    const rows = mapReadout([ref, other], channels, 20, "metric");
    expect(rows.map((r) => r.label)).toEqual(["Time diff", "Speed", "Gear", "Suggested"]);
  });

  it("reads each lap at its sample nearest the distance", () => {
    // 23 m is nearest the 20 m sample; 26 m the 30 m one.
    const at23 = mapReadout([ref, other], channels, 23, "metric");
    expect(at23.find((r) => r.key === "speed")!.cells).toEqual(["120 km/h", "112 km/h"]);
    const at26 = mapReadout([ref, other], channels, 26, "metric");
    expect(at26.find((r) => r.key === "speed")!.cells).toEqual(["130 km/h", "125 km/h"]);
  });

  it("gives the reference no time diff, and the others theirs in seconds", () => {
    const rows = mapReadout([ref, other], channels, 20, "metric");
    expect(rows.find((r) => r.key === "delta")!.cells).toEqual([null, "+0.250 s"]);
  });

  it("converts units as the charts do", () => {
    const rows = mapReadout([ref], channels, 20, "imperial");
    expect(rows.find((r) => r.key === "speed")!.cells).toEqual(["75 mph"]);
  });

  it("leaves out a suggestion where GT7 made none", () => {
    const at20 = mapReadout([ref], channels, 20, "metric");
    expect(at20.find((r) => r.key === "suggested_gear")!.cells).toEqual(["3"]);
    const at50 = mapReadout([ref], channels, 50, "metric");
    expect(at50.some((r) => r.key === "suggested_gear")).toBe(false);
  });

  it("drops a row no lap has a value for, and keeps the gaps in one that some do", () => {
    // Only the reference was recorded with wheel slip.
    const slipped = lap({ slip_fl: [1, 1, 1.2, 1, 1, 1], slip_fr: [1, 1, 1, 1, 1, 1] });
    const slip = [CHANNEL_BY_KEY.slip_front, CHANNEL_BY_KEY.rpm];
    const rows = mapReadout([slipped, other], slip, 20, "metric");
    expect(rows.map((r) => r.key)).toEqual(["delta", "slip_front"]);
    expect(rows.find((r) => r.key === "slip_front")!.cells).toEqual(["1.10×", null]);
  });

  it("lists the time diff alone without any panels", () => {
    const rows = mapReadout([ref, other], [], 20, "metric");
    expect(rows.map((r) => r.key)).toEqual(["delta"]);
  });
});
