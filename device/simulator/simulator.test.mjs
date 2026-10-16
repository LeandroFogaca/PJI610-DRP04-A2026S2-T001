import assert from "node:assert/strict";
import test from "node:test";
import { createMeasurement, measurementTopic } from "./index.mjs";

test("creates a measurement matching the v1 telemetry envelope", () => {
  const timestamp = new Date("2026-10-16T13:00:00.000Z");
  const measurement = createMeasurement("esp32-001", 0, timestamp, () => 0.5);

  assert.equal(measurement.schema_version, "1.0");
  assert.match(measurement.message_id, /^esp32-001-1792155600000-/);
  assert.equal(measurement.device_id, "esp32-001");
  assert.equal(measurement.timestamp, timestamp.toISOString());
  assert.deepEqual(measurement.metrics, [
    { name: "battery.voltage", value: 24, unit: "V", quality: "simulated" },
  ]);
});

test("generates bounded voltage values and the matching MQTT topic", () => {
  for (let sequence = 0; sequence < 1000; sequence += 1) {
    const measurement = createMeasurement("device-test", sequence, new Date(), () => 1);
    assert.ok(measurement.metrics[0].value >= 0);
    assert.ok(measurement.metrics[0].value <= 48);
  }
  assert.equal(measurementTopic("esp32-001"), "telemetry/v1/esp32-001/measurements");
});

test("rejects device IDs that cannot safely identify an MQTT topic", () => {
  assert.throws(() => createMeasurement("invalid/device", 0), /ASCII letters/);
  assert.throws(() => createMeasurement("wildcard+#", 0), /ASCII letters/);
  assert.throws(() => createMeasurement("x".repeat(65), 0), /1 to 64 ASCII letters/);
});
