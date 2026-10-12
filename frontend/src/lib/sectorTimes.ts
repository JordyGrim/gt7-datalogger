// The sector times panel's arithmetic (#22): which split is the best of each
// sector, and which lap time is the best, counting only laps that count —
// a pit out-lap's short "time" is no sector record.

export interface SectorLap {
  id: number;
  number: number;
  time_ms: number;
  counts_for_best: boolean;
  splits_ms: number[] | null;
}

export interface SectorBests {
  /** The best split per sector, or null where no counting lap has one. */
  splits: (number | null)[];
  /** The best lap time among the counting laps, or null. */
  lap: number | null;
}

export function sectorBests(laps: SectorLap[], sectorCount: number): SectorBests {
  const splits: (number | null)[] = Array.from({ length: sectorCount }, () => null);
  let lap: number | null = null;
  for (const row of laps) {
    if (!row.counts_for_best || row.time_ms <= 0) continue;
    if (lap == null || row.time_ms < lap) lap = row.time_ms;
    if (!row.splits_ms) continue;
    for (let k = 0; k < sectorCount; k++) {
      const v = row.splits_ms[k];
      if (v == null) continue;
      const best = splits[k];
      if (best == null || v < best) splits[k] = v;
    }
  }
  return { splits, lap };
}

/** A split as seconds to the millisecond: "23.456", or "1:03.456" past a
 *  minute, which a sector of the Nordschleife is. */
export function formatSplit(ms: number): string {
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = ((total % 60000) / 1000).toFixed(3);
  return minutes > 0 ? `${minutes}:${seconds.padStart(6, "0")}` : seconds;
}
