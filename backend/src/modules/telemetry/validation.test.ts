import { describe, expect, it } from "vitest";
import { validateMeasurement } from "./validation.js";

const validPayload = {
  schema_version: "1.0",
  message_id: "esp32-001-000001",
  device_id: "esp32-001",
  timestamp: "2026-10-15T10:00:00Z",
  metrics: [{ name: "battery.voltage", value: 24.2, unit: "V", quality: "simulated" }],
};

describe("validateMeasurement", () => {
  it("accepts contract-valid voltage telemetry", () => {
    expect(validateMeasurement(validPayload)).toMatchObject({ valid: true });
    expect(validateMeasurement({
      ...validPayload,
      metrics: [...validPayload.metrics, { name: "temperature", value: 25, unit: "Cel", quality: "simulated" }],
    })).toMatchObject({ valid: true });
  });

  it("rejects missing voltage and malformed envelope fields", () => {
    expect(validateMeasurement({ ...validPayload, metrics: [] })).toMatchObject({ valid: false });
    expect(validateMeasurement({ ...validPayload, timestamp: "not-a-date" })).toMatchObject({ valid: false });
  });

  it("rejects future acquisition times and wrong voltage units", () => {
    expect(validateMeasurement({
      ...validPayload,
      timestamp: new Date(Date.now() + 10 * 60_000).toISOString(),
    })).toMatchObject({ valid: false });
    expect(validateMeasurement({
      ...validPayload,
      metrics: [{ ...validPayload.metrics[0], unit: "mV" }],
    })).toMatchObject({ valid: false });
  });
});
