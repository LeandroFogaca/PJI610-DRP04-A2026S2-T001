import mqtt, { type MqttClient } from "mqtt";
import { afterEach, describe, expect, it } from "vitest";
import { startMqttBroker, type MqttBroker } from "./broker.js";
import { MemoryRepository } from "../../modules/telemetry/memory-repository.js";

describe("embedded MQTT broker", () => {
  let broker: MqttBroker | undefined;
  let publisher: MqttClient | undefined;

  afterEach(async () => {
    await publisher?.endAsync();
    await broker?.close();
    publisher = undefined;
    broker = undefined;
  });

  it("starts with the backend and ingests published telemetry", async () => {
    const repository = new MemoryRepository();
    broker = await startMqttBroker("127.0.0.1", 0, repository);
    const client = mqtt.connect(`mqtt://127.0.0.1:${broker.port}`);
    publisher = client;
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });

    const payload = {
      schema_version: "1.0",
      message_id: "mqtt-integration-test-1",
      device_id: "esp32-001",
      timestamp: new Date(Date.now() - 1_000).toISOString(),
      metrics: [{ name: "battery.voltage", value: 24.5, unit: "V", quality: "simulated" }],
    };
    await client.publishAsync(
      `telemetry/v1/${payload.device_id}/measurements`,
      JSON.stringify(payload),
      { qos: 1 },
    );

    await expect.poll(async () => {
      const measurements = await repository.measurementsForEquipment("eq-001");
      return measurements.some((measurement) => measurement.message_id === payload.message_id);
    }, { timeout: 5_000 }).toBe(true);
  });
});
