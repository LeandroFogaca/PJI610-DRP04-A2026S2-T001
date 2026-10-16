import type { BatteryPeriod, StoredMeasurement } from "../../domain/types.js";
import { numericSetting } from "../../config/settings.js";

const minimumChangePerMinute = numericSetting("CYCLE_MIN_CHANGE_PER_MINUTE", 0.005, 0, 100);

export function inferPeriods(measurements: StoredMeasurement[]): BatteryPeriod[] {
  const sorted = [...measurements].sort((a, b) => Date.parse(a.acquired_at) - Date.parse(b.acquired_at));
  if (sorted.length < 2) {
    return sorted.length === 1
      ? [{ started_at: sorted[0].acquired_at, ended_at: sorted[0].acquired_at, state: "unknown" }]
      : [];
  }

  const states = sorted.slice(1).map((current, index) => {
    const previous = sorted[index];
    const elapsedMinutes = (Date.parse(current.acquired_at) - Date.parse(previous.acquired_at)) / 60_000;
    if (elapsedMinutes <= 0) return "unknown" as const;
    const rate = (current.voltage - previous.voltage) / elapsedMinutes;
    if (rate >= minimumChangePerMinute) return "charging" as const;
    if (rate <= -minimumChangePerMinute) return "discharging" as const;
    return "unknown" as const;
  });

  const periods: BatteryPeriod[] = [];
  let start = 0;
  for (let i = 1; i <= states.length; i += 1) {
    if (i < states.length && states[i] === states[start]) continue;
    periods.push({
      started_at: sorted[start].acquired_at,
      ended_at: sorted[i]?.acquired_at ?? sorted[sorted.length - 1].acquired_at,
      state: states[start],
    });
    start = i;
  }
  return periods;
}
