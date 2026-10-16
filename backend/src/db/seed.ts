import "../config/env.js";
import { Pool } from "pg";
import { PostgresRepository } from "../adapters/database/postgres-repository.js";
import type { MeasurementPayload } from "../domain/types.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be configured before seeding demo data");
const pool = new Pool({ connectionString: databaseUrl });
const repository = new PostgresRepository(pool);

try {
  await pool.query(`
    INSERT INTO devices (id, firmware_version) VALUES
      ('esp32-001', 'simulator-1.0'),
      ('esp32-002', 'simulator-1.0')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO equipment (id, name, location) VALUES
      ('eq-001', 'Empilhadeira demonstrativa 1', 'Área simulada A'),
      ('eq-002', 'Empilhadeira demonstrativa 2', 'Área simulada B')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO batteries (id, technology, nominal_voltage) VALUES
      ('battery-001', 'não caracterizada (demo)', NULL),
      ('battery-002', 'não caracterizada (demo)', NULL)
    ON CONFLICT (id) DO NOTHING;
  `);
  for (const [deviceId, equipmentId, batteryId] of [
    ["esp32-001", "eq-001", "battery-001"],
    ["esp32-002", "eq-002", "battery-002"],
  ]) {
    await pool.query(
      `INSERT INTO device_assignments (device_id, equipment_id, valid_from)
       VALUES ($1, $2, now() - interval '30 days')
       ON CONFLICT DO NOTHING`,
      [deviceId, equipmentId],
    );
    await pool.query(
      `INSERT INTO battery_assignments (equipment_id, battery_id, valid_from)
       VALUES ($1, $2, now() - interval '30 days')
       ON CONFLICT DO NOTHING`,
      [equipmentId, batteryId],
    );
  }

  const now = Date.now();
  for (let deviceIndex = 0; deviceIndex < 2; deviceIndex += 1) {
    for (let index = 0; index < 24; index += 1) {
      const rising = deviceIndex === 1 || (index >= 12 && index <= 15);
      const voltage = deviceIndex === 0
        ? (rising ? 23.1 + (index - 12) * 0.13 : 25.7 - index * 0.14)
        : 24.1 + index * 0.06;
      const payload: MeasurementPayload = {
        schema_version: "1.0",
        device_id: deviceIndex === 0 ? "esp32-001" : "esp32-002",
        message_id: `demo-${deviceIndex + 1}-${index + 1}`,
        timestamp: new Date(now - (23 - index) * 15 * 60_000).toISOString(),
        metrics: [{ name: "battery.voltage", value: voltage, unit: "V", quality: "simulated" }],
      };
      await repository.ingest(payload, new Date());
    }
  }
  console.info("Demo assets and 48 simulated measurements are ready");
} catch (error) {
  console.error("Demo data seeding failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
