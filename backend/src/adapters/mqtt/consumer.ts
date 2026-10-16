import mqtt, { type MqttClient } from "mqtt";
import type { MonitoringRepository } from "../../domain/types.js";
import { validateMeasurement } from "../../modules/telemetry/validation.js";

export async function startMqttConsumer(url: string, repository: MonitoringRepository): Promise<MqttClient> {
  const client = mqtt.connect(url, { reconnectPeriod: 2_000, connectTimeout: 10_000 });
  let initialized = false;
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    client.on("connect", () => {
      console.info(`MQTT connected; subscribing to telemetry/v1/+/measurements`);
      client.subscribe("telemetry/v1/+/measurements", { qos: 1 }, (error) => {
        if (error) {
          console.error("MQTT subscription failed", error);
          if (!initialized) rejectReady(error);
        } else if (!initialized) {
          initialized = true;
          resolveReady();
        }
      });
    });
    client.on("error", (error) => {
      console.error("MQTT connection error", error);
      if (!initialized) rejectReady(error);
    });
  });
  client.on("message", (topic, bytes) => {
    void processMessage(topic, bytes.toString(), repository);
  });
  try {
    await ready;
    return client;
  } catch (error) {
    await client.endAsync();
    throw error;
  }
}

async function processMessage(topic: string, raw: string, repository: MonitoringRepository): Promise<void> {
  const topicDevice = /^telemetry\/v1\/([^/]+)\/measurements$/.exec(topic)?.[1];
  if (!topicDevice) {
    console.error("Rejected MQTT message with unexpected topic", { topic });
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    console.error("Rejected MQTT message with invalid JSON", { topic, error });
    return;
  }
  const validation = validateMeasurement(body);
  if (!validation.valid) {
    console.error("Rejected MQTT message failing the telemetry contract", { topic, detail: validation.message });
    return;
  }
  if (validation.payload.device_id !== topicDevice) {
    console.error("Rejected MQTT message whose topic device does not match its payload", { topic });
    return;
  }
  try {
    const result = await repository.ingest(validation.payload, new Date());
    console.info("MQTT measurement processed", {
      topic,
      message_id: validation.payload.message_id,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error("MQTT measurement ingestion failed", { topic, error });
  }
}
