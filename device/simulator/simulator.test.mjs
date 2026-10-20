import assert from "node:assert/strict";
import test from "node:test";
import {
  createMeasurement,
  calculateBatteryVoltage,
  getBatteryConfig,
  measurementTopic,
} from "./index.mjs";

test("creates a measurement matching the v1 telemetry envelope with recharged battery level > 26 V", () => {
  const timestamp = new Date("2026-10-16T13:00:00.000Z");
  const measurement = createMeasurement("esp32-001", 0, timestamp, () => 0.5);

  assert.equal(measurement.schema_version, "1.0");
  assert.match(measurement.message_id, /^esp32-001-1792155600000-/);
  assert.equal(measurement.device_id, "esp32-001");
  assert.equal(measurement.timestamp, timestamp.toISOString());
  assert.equal(measurement.metrics[0].name, "battery.voltage");
  assert.equal(measurement.metrics[0].unit, "V");
  assert.equal(measurement.metrics[0].quality, "simulated");
  assert.ok(measurement.metrics[0].value > 26.0, `Initial voltage ${measurement.metrics[0].value} should be > 26 V`);
});

test("simulates continuous consumption (level strictly decreases) and swaps battery after 30min below 22 V", () => {
  const config = getBatteryConfig({
    SAMPLE_INTERVAL_MS: "15000",
    BATTERY_LOW_DURATION_MINUTES: "30",
    BATTERY_DRAIN_NORMAL: "0.02",
    BATTERY_DRAIN_ACCELERATED: "0.05",
  });

  const n1 = Math.ceil((config.fullVoltage - config.alertVoltage) / config.normalDrain);
  const effectiveAccelerated = Math.max(config.acceleratedDrain, config.normalDrain * 2);
  const n2 = Math.ceil((config.alertVoltage - config.lowVoltage) / effectiveAccelerated);
  const n3 = Math.round((config.lowDurationMinutes * 60 * 1000) / config.sampleIntervalMs);
  const nTotal = n1 + n2 + n3;

  // 1. Within a cycle, every step must strictly decrease
  for (let s = 1; s < nTotal; s += 1) {
    const prev = calculateBatteryVoltage(s - 1, config);
    const curr = calculateBatteryVoltage(s, config);
    assert.ok(curr < prev, `Step ${s} (${curr} V) should be strictly less than step ${s - 1} (${prev} V)`);
  }

  // 2. Consumption below 23 V is at least 2x greater than above 23 V
  const normalRate = (calculateBatteryVoltage(0, config) - calculateBatteryVoltage(n1 - 1, config)) / (n1 - 1);
  const acceleratedRate = (calculateBatteryVoltage(n1 - 1, config) - calculateBatteryVoltage(n1 + n2 - 1, config)) / n2;
  assert.ok(
    acceleratedRate >= 2 * normalRate,
    `Accelerated rate (${acceleratedRate.toFixed(4)}) should be >= 2x normal rate (${normalRate.toFixed(4)})`,
  );

  // 3. Below 22 V for exactly 30 minutes (n3 samples)
  assert.ok(calculateBatteryVoltage(n1 + n2, config) < 22.0, "Enters < 22 V");
  assert.ok(calculateBatteryVoltage(nTotal - 1, config) < 22.0, "Last sample before swap is still < 22 V");

  // 4. At nTotal, battery swap occurs and level resets to > 26 V
  const swapped = calculateBatteryVoltage(nTotal, config);
  assert.ok(swapped > 26.0, `Swapped battery voltage ${swapped} should be > 26 V`);
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
