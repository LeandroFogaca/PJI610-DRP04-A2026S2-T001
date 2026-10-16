import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import mqtt from "mqtt";

const defaultDeviceId = "esp32-001";
const defaultMqttUrl = "mqtt://127.0.0.1:1883";
const defaultSampleIntervalMs = 15_000;
const maximumVoltage = 48;
const validDeviceId = /^[A-Za-z0-9._-]{1,64}$/;

export function createMeasurement(deviceId, sequence, timestamp = new Date(), random = Math.random) {
  if (!validDeviceId.test(deviceId)) {
    throw new Error("DEVICE_ID must contain 1 to 64 ASCII letters, digits, '.', '_' or '-'.");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("sequence must be a non-negative safe integer.");
  }
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new Error("timestamp must be a valid Date.");
  }

  const baseVoltage = 24 + 2 * Math.sin(sequence / 8);
  const noise = (random() - 0.5) * 0.2;
  const voltage = Math.min(maximumVoltage, Math.max(0, baseVoltage + noise));

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
  const { deviceId, mqttUrl, sampleIntervalMs } = readConfiguration(environment);
  const topic = measurementTopic(deviceId);
  const client = mqtt.connect(mqttUrl, { reconnectPeriod: 2_000, connectTimeout: 10_000 });
  let sequence = 0;
  let sampleTimer;

  client.on("connect", () => {
    console.info(`Device simulator connected to ${mqttUrl}; publishing to ${topic}`);
    if (sampleTimer) clearInterval(sampleTimer);
    const publishSample = () => {
      const measurement = createMeasurement(deviceId, sequence++);
      client.publish(topic, JSON.stringify(measurement), { qos: 1 }, (error) => {
        if (error) {
          console.error("Failed to publish simulated measurement:", error.message);
          return;
        }
        console.info(
          `Published ${measurement.message_id}: ${measurement.metrics[0].value.toFixed(3)} V`,
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
