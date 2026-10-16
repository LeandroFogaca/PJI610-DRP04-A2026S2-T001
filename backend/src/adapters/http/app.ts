import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { MonitoringRepository } from "../../domain/types.js";
import { inferPeriods } from "../../modules/cycles/classifier.js";
import { validateMeasurement } from "../../modules/telemetry/validation.js";

type RangeQuery = { from?: string; to?: string };

function parseRange(query: RangeQuery): { from?: Date; to?: Date; error?: string } {
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) {
    return { error: "from and to must be valid ISO date-time values" };
  }
  if (from && to && from > to) return { error: "from must be earlier than or equal to to" };
  return { from, to };
}

export function createApp(repository: MonitoringRepository): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 16_384 });
  void app.register(cors, { origin: process.env.DASHBOARD_ORIGIN ?? "http://localhost:5173" });

  app.get("/health", async (request, reply) => {
    try {
      await repository.health();
      return { status: "ok" };
    } catch (error) {
      request.log.error({ err: error }, "Database health check failed");
      return reply.code(503).send({ error: "service_unavailable" });
    }
  });

  app.get("/api/v1/devices", async () => repository.listDevices());
  app.get("/api/v1/equipment", async () => repository.listEquipment());
  app.get("/api/v1/batteries", async () => repository.listBatteries());

  app.get<{ Params: { id: string }; Querystring: RangeQuery }>(
    "/api/v1/equipment/:id/measurements",
    async (request, reply) => {
      const range = parseRange(request.query);
      if (range.error) return reply.code(400).send({ error: range.error });
      return repository.measurementsForEquipment(request.params.id, range.from, range.to);
    },
  );

  app.get<{ Params: { id: string }; Querystring: RangeQuery }>(
    "/api/v1/batteries/:id/periods",
    async (request, reply) => {
      const range = parseRange(request.query);
      if (range.error) return reply.code(400).send({ error: range.error });
      const measurements = await repository.measurementsForBattery(request.params.id, range.from, range.to);
      const periods = inferPeriods(measurements);
      return repository.saveInferredPeriods(request.params.id, periods, range.from, range.to);
    },
  );

  app.get<{ Querystring: RangeQuery & { equipment_id?: string } }>("/api/v1/alerts", async (request, reply) => {
    const range = parseRange(request.query);
    if (range.error) return reply.code(400).send({ error: range.error });
    return repository.listAlerts(request.query.equipment_id, range.from, range.to);
  });

  app.post("/api/v1/measurements", async (request, reply) => {
    const validation = validateMeasurement(request.body);
    if (!validation.valid) return reply.code(400).send({ error: "invalid_measurement", detail: validation.message });
    try {
      const result = await repository.ingest(validation.payload, new Date());
      return reply.code(result.duplicate ? 200 : 201).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Measurement ingestion failed";
      request.log.error({ err: error, device_id: validation.payload.device_id }, message);
      if (message.startsWith("Unregistered device:")) {
        return reply.code(400).send({ error: "unregistered_device", detail: message });
      }
      if (message.includes("outside the supported range")) {
        return reply.code(400).send({ error: "measurement_out_of_range", detail: message });
      }
      return reply.code(500).send({ error: "measurement_ingestion_failed" });
    }
  });

  return app;
}
