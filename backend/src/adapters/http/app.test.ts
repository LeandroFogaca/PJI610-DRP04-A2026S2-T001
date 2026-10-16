import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { MemoryRepository } from "../../modules/telemetry/memory-repository.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const payload = {
  schema_version: "1.0",
  message_id: "esp32-001-test-1",
  device_id: "esp32-001",
  timestamp: "2026-10-15T12:00:00Z",
  metrics: [{ name: "battery.voltage", value: 24.5, unit: "V", quality: "simulated" }],
};

beforeEach(() => {
  app = createApp(new MemoryRepository());
});

afterEach(async () => {
  await app.close();
});

describe("HTTP API", () => {
  it("accepts telemetry and safely deduplicates retransmissions", async () => {
    const first = await app.inject({ method: "POST", url: "/api/v1/measurements", payload });
    const replay = await app.inject({ method: "POST", url: "/api/v1/measurements", payload });
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().duplicate).toBe(true);
  });

  it("rejects invalid payloads and reversed query ranges", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/measurements",
      payload: { ...payload, metrics: [] },
    });
    const range = await app.inject({
      method: "GET",
      url: "/api/v1/equipment/eq-001/measurements?from=2026-10-16T00:00:00Z&to=2026-10-15T00:00:00Z",
    });
    expect(invalid.statusCode).toBe(400);
    expect(range.statusCode).toBe(400);
  });

  it("returns and persists inferred battery periods", async () => {
    await app.inject({ method: "POST", url: "/api/v1/measurements", payload });
    await app.inject({
      method: "POST",
      url: "/api/v1/measurements",
      payload: {
        ...payload,
        message_id: "esp32-001-test-2",
        timestamp: "2026-10-15T12:15:00Z",
        metrics: [{ name: "battery.voltage", value: 25, unit: "V", quality: "simulated" }],
      },
    });
    const result = await app.inject({
      method: "GET",
      url: "/api/v1/batteries/battery-001/periods?from=2026-10-15T11:00:00Z&to=2026-10-15T13:00:00Z",
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject([{ state: "charging" }]);
  });

  it("filters low-voltage alerts by equipment and acquisition period", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/measurements",
      payload: {
        ...payload,
        message_id: "esp32-001-low-voltage",
        metrics: [{ name: "battery.voltage", value: 22.5, unit: "V", quality: "simulated" }],
      },
    });
    const result = await app.inject({
      method: "GET",
      url: "/api/v1/alerts?equipment_id=eq-001&from=2026-10-15T11:00:00Z&to=2026-10-15T13:00:00Z",
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject([{ equipment_id: "eq-001", voltage: 22.5, threshold: 23 }]);
  });
});
