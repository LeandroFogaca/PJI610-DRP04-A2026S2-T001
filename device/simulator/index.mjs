import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import mqtt from "mqtt";

const defaultDeviceId = "esp32-001";
const defaultMqttUrl = "mqtt://127.0.0.1:1883";
const defaultSampleIntervalMs = 15_000;
const maximumVoltage = 48;
const validDeviceId = /^[A-Za-z0-9._-]{1,64}$/;

export function getBatteryConfig(environment = process.env) {
  const fullVoltage = Number(environment.BATTERY_FULL_VOLTAGE ?? 26.8);
  const alertVoltage = Number(environment.BATTERY_ALERT_VOLTAGE ?? 23.0);
  const lowVoltage = Number(environment.BATTERY_LOW_VOLTAGE ?? 22.0);
  const lowDurationMinutes = Number(environment.BATTERY_LOW_DURATION_MINUTES ?? 30);
  const sampleIntervalMs = Number(environment.SAMPLE_INTERVAL_MS ?? defaultSampleIntervalMs);

  const hasExplicitNormalMinMax =
    environment.BATTERY_DRAIN_NORMAL_MIN !== undefined ||
    environment.BATTERY_DRAIN_NORMAL_MAX !== undefined;
  const normalDrainMin = Number(
    environment.BATTERY_DRAIN_NORMAL_MIN ??
      (hasExplicitNormalMinMax ? 0 : (environment.BATTERY_DRAIN_NORMAL ?? 0)),
  );
  const normalDrainMax = Number(
    environment.BATTERY_DRAIN_NORMAL_MAX ??
      (hasExplicitNormalMinMax ? 0.05 : (environment.BATTERY_DRAIN_NORMAL ?? 0.05)),
  );
  const normalDrain = Number(
    environment.BATTERY_DRAIN_NORMAL ?? (normalDrainMin + normalDrainMax) / 2,
  );

  const hasExplicitAccelMinMax =
    environment.BATTERY_DRAIN_ACCELERATED_MIN !== undefined ||
    environment.BATTERY_DRAIN_ACCELERATED_MAX !== undefined;
  const acceleratedDrainMin = Number(
    environment.BATTERY_DRAIN_ACCELERATED_MIN ??
      (hasExplicitAccelMinMax ? 0.05 : (environment.BATTERY_DRAIN_ACCELERATED ?? 0.05)),
  );
  const acceleratedDrainMax = Number(
    environment.BATTERY_DRAIN_ACCELERATED_MAX ??
      (hasExplicitAccelMinMax ? 0.10 : (environment.BATTERY_DRAIN_ACCELERATED ?? 0.10)),
  );
  const acceleratedDrain = Number(
    environment.BATTERY_DRAIN_ACCELERATED ?? (acceleratedDrainMin + acceleratedDrainMax) / 2,
  );

  return {
    fullVoltage,
    alertVoltage,
    lowVoltage,
    lowDurationMinutes,
    sampleIntervalMs,
    normalDrain,
    acceleratedDrain,
    normalDrainMin,
    normalDrainMax,
    acceleratedDrainMin,
    acceleratedDrainMax,
  };
}

export class BatterySimulator {
  constructor(config = getBatteryConfig(), random = Math.random) {
    this.config = config;
    this.random = random;
    this.sequence = 0;
    this.cycleIndex = 0;
    this.lowPhaseSamples = 0;
    this.voltage = this.config.fullVoltage;
    this.n3 = Math.max(
      1,
      Math.round((this.config.lowDurationMinutes * 60 * 1000) / this.config.sampleIntervalMs),
    );
  }

  nextSample() {
    const seq = this.sequence++;
    if (seq === 0) {
      this.voltage = this.config.fullVoltage;
      return { sequence: seq, voltage: this.voltage, isSwap: false };
    }

    let isSwap = false;
    if (this.voltage >= this.config.alertVoltage) {
      // Phase 1: Normal discharge (>= 23 V), random between normalDrainMin and normalDrainMax
      const drainRange = this.config.normalDrainMax - this.config.normalDrainMin;
      const drain = this.config.normalDrainMin + this.random() * drainRange;
      this.voltage = Math.max(this.config.alertVoltage - 0.05, this.voltage - drain);
    } else if (this.voltage >= this.config.lowVoltage) {
      // Phase 2: Accelerated discharge (< 23 V down to 22 V), random between acceleratedDrainMin and acceleratedDrainMax
      const drainRange = this.config.acceleratedDrainMax - this.config.acceleratedDrainMin;
      const drain = this.config.acceleratedDrainMin + this.random() * drainRange;
      this.voltage = Math.max(this.config.lowVoltage - 0.05, this.voltage - drain);
    } else {
      // Phase 3: Below 22 V for lowDurationMinutes
      this.lowPhaseSamples++;
      if (this.lowPhaseSamples >= this.n3) {
        this.cycleIndex++;
        this.lowPhaseSamples = 0;
        this.voltage = this.config.fullVoltage + ((this.cycleIndex % 3) * 0.2);
        isSwap = true;
      } else {
        const lowPhaseDrop = 0.01 + this.lowPhaseSamples * (2.0 / this.n3);
        this.voltage = Math.max(18.0, this.config.lowVoltage - lowPhaseDrop);
      }
    }

    return { sequence: seq, voltage: this.voltage, isSwap };
  }
}

export function calculateBatteryVoltage(
  sequence,
  config = getBatteryConfig(),
  random = Math.random,
) {
  const {
    fullVoltage,
    alertVoltage,
    lowVoltage,
    lowDurationMinutes,
    sampleIntervalMs,
    normalDrain,
    acceleratedDrain,
    normalDrainMin,
    normalDrainMax,
    acceleratedDrainMin,
    acceleratedDrainMax,
  } = config;

  if (normalDrainMin === normalDrainMax && acceleratedDrainMin === acceleratedDrainMax) {
    // Phase 1: From fullVoltage (> 26 V) down to alertVoltage (23.0 V)
    const n1 = Math.max(1, Math.ceil((fullVoltage - alertVoltage) / normalDrain));

    // Phase 2: From alertVoltage (23.0 V) down to lowVoltage (22.0 V)
    // Below 23 V, consumption is at least 2x higher
    const effectiveAcceleratedDrain = Math.max(acceleratedDrain, normalDrain * 2);
    const n2 = Math.max(1, Math.ceil((alertVoltage - lowVoltage) / effectiveAcceleratedDrain));

    // Phase 3: Below 22 V for exactly 30 minutes (lowDurationMinutes)
    const n3 = Math.max(1, Math.round((lowDurationMinutes * 60 * 1000) / sampleIntervalMs));

    // Total samples before battery swap occurs
    const nTotal = n1 + n2 + n3;

    const cycleIndex = Math.floor(sequence / nTotal);
    const step = sequence % nTotal;

    // Recharged battery full voltage (> 26 V)
    const cycleFullVoltage = fullVoltage + ((cycleIndex % 3) * 0.2);

    if (step < n1) {
      // Phase 1: Normal discharge (>= 23 V)
      const drop = step * ((cycleFullVoltage - alertVoltage) / n1);
      return Math.max(alertVoltage, cycleFullVoltage - drop);
    }

    if (step < n1 + n2) {
      // Phase 2: Accelerated discharge (< 23 V down to 22 V, at least 2x consumption)
      const k = step - n1;
      const drop = (k + 1) * ((alertVoltage - lowVoltage) / n2);
      return Math.max(lowVoltage, alertVoltage - drop);
    }

    // Phase 3: Below 22 V for exactly 30 minutes (n3 samples)
    // Continuous decreasing consumption while waiting for battery swap
    const m = step - (n1 + n2);
    const lowPhaseDrop = 0.01 + m * (2.0 / n3);
    return Math.max(18.0, lowVoltage - lowPhaseDrop);
  }

  const sim = new BatterySimulator(config, random);
  let sample;
  for (let s = 0; s <= sequence; s++) {
    sample = sim.nextSample();
  }
  return sample.voltage;
}

export function createMeasurement(
  deviceId,
  sequenceOrSample,
  timestamp = new Date(),
  random = Math.random,
  config = getBatteryConfig(),
) {
  if (!validDeviceId.test(deviceId)) {
    throw new Error("DEVICE_ID must contain 1 to 64 ASCII letters, digits, '.', '_' or '-'.");
  }
  let sequence;
  let voltageValue;

  if (typeof sequenceOrSample === "object" && sequenceOrSample !== null) {
    sequence = sequenceOrSample.sequence ?? 0;
    voltageValue = sequenceOrSample.voltage;
  } else {
    sequence = sequenceOrSample;
  }

  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("sequence must be a non-negative safe integer.");
  }
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new Error("timestamp must be a valid Date.");
  }

  if (voltageValue === undefined) {
    voltageValue = calculateBatteryVoltage(sequence, config, random);
  }
  const voltage = Math.min(maximumVoltage, Math.max(0, voltageValue));

  return {
    schema_version: "1.0",
    message_id: `${deviceId}-${timestamp.getTime()}-${randomUUID()}`,
    device_id: deviceId,
    timestamp: timestamp.toISOString(),
    metrics: [
      {
        name: "battery.voltage",
        value: Number(voltage.toFixed(3)),
        unit: "V",
        quality: "simulated",
      },
    ],
  };
}

export function measurementTopic(deviceId) {
  return `telemetry/v1/${deviceId}/measurements`;
}

function readConfiguration(environment) {
  const deviceId = environment.DEVICE_ID ?? defaultDeviceId;
  if (!validDeviceId.test(deviceId)) {
    throw new Error("DEVICE_ID must contain 1 to 64 ASCII letters, digits, '.', '_' or '-'.");
  }

  const mqttUrl = environment.MQTT_URL ?? defaultMqttUrl;
  let parsedUrl;
  try {
    parsedUrl = new URL(mqttUrl);
  } catch {
    throw new Error("MQTT_URL must be a valid mqtt://, mqtts://, ws://, or wss:// URL.");
  }
  if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(parsedUrl.protocol)) {
    throw new Error("MQTT_URL must use mqtt://, mqtts://, ws://, or wss://.");
  }

  const sampleIntervalMs = Number(environment.SAMPLE_INTERVAL_MS ?? defaultSampleIntervalMs);
  if (!Number.isSafeInteger(sampleIntervalMs) || sampleIntervalMs < 1000) {
    throw new Error("SAMPLE_INTERVAL_MS must be an integer of at least 1000.");
  }

  return { deviceId, mqttUrl, sampleIntervalMs };
}

export function startSimulator(environment = process.env) {
  if (environment === process.env && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(new URL("../.env", import.meta.url));
    } catch {
      try {
        process.loadEnvFile(new URL("../../.env", import.meta.url));
      } catch {
        // Proceed with defaults if .env is missing
      }
    }
  }

  const { deviceId, mqttUrl, sampleIntervalMs } = readConfiguration(environment);
  const batteryConfig = getBatteryConfig(environment);
  const topic = measurementTopic(deviceId);
  const client = mqtt.connect(mqttUrl, { reconnectPeriod: 2_000, connectTimeout: 10_000 });
  const simulator = new BatterySimulator(batteryConfig, Math.random);
  let sampleTimer;
  let previousVoltage = null;

  client.on("connect", () => {
    console.info(`Device simulator connected to ${mqttUrl}; publishing to ${topic}`);
    if (sampleTimer) clearInterval(sampleTimer);
    const publishSample = () => {
      const sample = simulator.nextSample();
      const measurement = createMeasurement(deviceId, sample, new Date(), Math.random, batteryConfig);
      const voltage = measurement.metrics[0].value;
      let statusNote = "";

      if (sample.isSwap || (previousVoltage !== null && voltage > 26.0 && previousVoltage < 22.0)) {
        statusNote = " 🔄 [Bateria trocada por nova bateria recarregada (>26 V)]";
      } else if (voltage < 22.0) {
        statusNote = ` ⚠️ [Bateria crítica (<22 V) - contagem para troca]`;
      } else if (voltage < 23.0) {
        statusNote = ` ⚡ [Subtensão (<23 V) - consumo acelerado (${batteryConfig.acceleratedDrainMin.toFixed(2)}-${batteryConfig.acceleratedDrainMax.toFixed(2)} V)]`;
      } else if (sample.sequence === 0) {
        statusNote = ` 🔋 [Bateria conectada (>26 V) - consumo normal (${batteryConfig.normalDrainMin.toFixed(2)}-${batteryConfig.normalDrainMax.toFixed(2)} V)]`;
      }

      previousVoltage = voltage;
      client.publish(topic, JSON.stringify(measurement), { qos: 1 }, (error) => {
        if (error) {
          console.error("Failed to publish simulated measurement:", error.message);
          return;
        }
        console.info(
          `Published ${measurement.message_id}: ${voltage.toFixed(3)} V${statusNote}`,
        );
      });
    };
    publishSample();
    sampleTimer = setInterval(publishSample, sampleIntervalMs);
  });

  client.on("reconnect", () => console.warn(`Reconnecting to MQTT broker ${mqttUrl}`));
  client.on("error", (error) => console.error("MQTT simulator error:", error.message));
  client.on("close", () => {
    if (sampleTimer) clearInterval(sampleTimer);
  });

  const stop = () => {
    if (sampleTimer) clearInterval(sampleTimer);
    client.end(false, {}, () => {
      console.info("Device simulator stopped.");
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return client;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    startSimulator();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
