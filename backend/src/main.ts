import "./config/env.js";
import { Pool } from "pg";
import { createApp } from "./adapters/http/app.js";
import { startMqttBroker } from "./adapters/mqtt/broker.js";
import { PostgresRepository } from "./adapters/database/postgres-repository.js";
import { MemoryRepository } from "./modules/telemetry/memory-repository.js";

const memoryDemo = process.env.DEMO_IN_MEMORY === "true";
const databaseUrl = process.env.DATABASE_URL;
if (!memoryDemo && !databaseUrl) throw new Error("DATABASE_URL must be configured unless DEMO_IN_MEMORY=true");

const pool = memoryDemo || !databaseUrl ? undefined : new Pool({ connectionString: databaseUrl });
const repository = pool ? new PostgresRepository(pool) : await MemoryRepository.createDemo();
if (memoryDemo) console.warn("Running ephemeral in-memory demonstration; records will not survive restart.");
const app = createApp(repository);
const mqttHost = process.env.MQTT_BIND_HOST ?? "127.0.0.1";
const mqttPort = Number(process.env.MQTT_PORT ?? 1883);
const port = Number(process.env.API_PORT ?? 3000);
let mqttBroker: Awaited<ReturnType<typeof startMqttBroker>> | undefined;

try {
  await repository.health();
  mqttBroker = await startMqttBroker(mqttHost, mqttPort, repository);
  app.log.info({ host: mqttHost, port: mqttBroker.port }, "MQTT broker listening");
  await app.listen({ host: process.env.API_HOST ?? "127.0.0.1", port });
} catch (error) {
  app.log.error({ err: error }, "Backend startup failed");
  await mqttBroker?.close();
  await pool?.end();
  process.exitCode = 1;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close()
      .then(() => mqttBroker?.close())
      .then(() => pool?.end())
      .catch((error: unknown) => {
        app.log.error({ err: error }, "Backend shutdown failed");
        process.exitCode = 1;
      });
  });
}
