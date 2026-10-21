import { speedUnit, type Units } from "@/lib/format";
import { channelValues, type ChannelDef } from "@/lib/channels";
import type { Samples } from "@/lib/types";

/**
 * Format a telemetry value using the same conventions
 * throughout the Analysis workspace.
 *
 * Values must already have undergone any channel-specific
 * unit transformations before reaching this function.
 */
export function formatValueFor(units: Units) {
  return (key: string, v: number): string => {
    if (key.startsWith("slip_") || key === "tire_slip") {
      return `${v.toFixed(2)}×`;
    }

    if (key.startsWith("tt_")) {
      const sign = key === "tt_balance" && v > 0 ? "+" : "";
      return `${sign}${v.toFixed(1)} °C`;
    }

    if (key.startsWith("sus_") || key === "body_height") {
      return `${v.toFixed(1)} mm`;
    }

    switch (key) {
      case "delta":
        return `${v >= 0 ? "+" : ""}${v.toFixed(3)} s`;

      case "speed":
        return `${Math.round(v)} ${speedUnit(units)}`;

      case "throttle":
      case "brake":
        return `${Math.round(v)}%`;

      case "coast":
        return v >= 0.5 ? "coasting" : "—";

      case "gear":
      case "suggested_gear":
        return `${Math.round(v)}`;

      case "rpm":
        return `${Math.round(v).toLocaleString()} rpm`;

      case "boost":
        return `${v.toFixed(2)} bar`;

      case "yaw_rate":
        return `${v.toFixed(2)} rad/s`;

      default:
        return v.toFixed(2);
    }
  };
}

/**
 * Read a telemetry channel at a particular lap distance.
 *
 * Continuous channels are interpolated between samples.
 * Step channels retain their last recorded value.
 */
export function telemetryAtDistance(
  channel: ChannelDef,
  series: Samples & { dist: number[] },
  distance: number,
  units: Units,
): number | null {
  const values = channelValues(channel, series);
  const distances = series.dist;

  if (!values || !distances?.length) return null;

  const n = Math.min(values.length, distances.length);
  if (n === 0) return null;

  if (distance < distances[0] || distance > distances[n - 1]) {
    return null;
  }

  // Binary search for the first sample at or beyond the target distance.
  let lo = 0;
  let hi = n - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);

    if (distances[mid] < distance) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const i = lo;

  let value: number;

  if (i === 0 || distances[i] === distance) {
    value = values[i];
  } else {
    const previous = i - 1;

    if (channel.step) {
      value = values[previous];
    } else {
      const span = distances[i] - distances[previous];

      if (span <= 0) return null;

      const fraction = (distance - distances[previous]) / span;

      value =
        values[previous] +
        (values[i] - values[previous]) * fraction;
    }
  }

  if (!Number.isFinite(value)) return null;

  const transformed = channel.transform
    ? channel.transform(value, units)
    : value;

  return Number.isFinite(transformed) ? transformed : null;
}

/**
 * Read the time difference at a particular lap distance.
 * Returns seconds, matching the telemetry charts.
 */
export function deltaAtDistance(
  delta: { dist: number[]; delta_ms: number[] } | null | undefined,
  distance: number,
): number | null {
  if (!delta) return null;

  const distances = delta.dist;
  const values = delta.delta_ms;

  const n = Math.min(distances.length, values.length);
  if (n === 0) return null;

  if (distance < distances[0] || distance > distances[n - 1]) {
    return null;
  }

  let lo = 0;
  let hi = n - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);

    if (distances[mid] < distance) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const i = lo;

  if (i === 0 || distances[i] === distance) {
    return Number.isFinite(values[i])
      ? values[i] / 1000
      : null;
  }

  const previous = i - 1;
  const span = distances[i] - distances[previous];

  if (span <= 0) return null;

  const fraction = (distance - distances[previous]) / span;

  const milliseconds =
    values[previous] +
    (values[i] - values[previous]) * fraction;

  return Number.isFinite(milliseconds)
    ? milliseconds / 1000
    : null;
}
