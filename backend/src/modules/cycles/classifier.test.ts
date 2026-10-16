import { describe, expect, it } from "vitest";
import type { StoredMeasurement } from "../../domain/types.js";
import { inferPeriods } from "./classifier.js";

function reading(timestamp: string, voltage: number): StoredMeasurement {
  return {
    id: 1,
    device_id: "esp32-001",
    equipment_id: "eq-001",
    battery_id: "battery-001",
    message_id: timestamp,
    acquired_at: timestamp,
    received_at: timestamp,
    voltage,
    quality: "simulated",
  };
}

describe("inferPeriods", () => {
  it("classifies sustained voltage rise and fall as inferred periods", () => {
    const periods = inferPeriods([
      reading("2026-10-15T10:00:00Z", 24),
      reading("2026-10-15T10:10:00Z", 24.5),
      reading("2026-10-15T10:20:00Z", 24),
    ]);
    expect(periods.map(({ state }) => state)).toEqual(["charging", "discharging"]);
  });

  it("keeps a flat trend indeterminate", () => {
    expect(inferPeriods([
      reading("2026-10-15T10:00:00Z", 24),
      reading("2026-10-15T10:10:00Z", 24.01),
    ])[0].state).toBe("unknown");
  });
});
