import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { numericSetting } from "../../config/settings.js";
import type {
  BatteryPeriod,
  IngestResult,
  MeasurementPayload,
  MonitoringRepository,
  StoredMeasurement,
} from "../../domain/types.js";

type MeasurementRow = {
  id: number;
  device_id: string;
  equipment_id: string | null;
  battery_id: string | null;
  message_id: string;
  acquired_at: Date;
  received_at: Date;
  voltage: number;
  quality: StoredMeasurement["quality"];
};

function toMeasurement(row: MeasurementRow): StoredMeasurement {
  return {
    ...row,
    acquired_at: row.acquired_at.toISOString(),
    received_at: row.received_at.toISOString(),
  };
}

export class PostgresRepository implements MonitoringRepository {
  private readonly db: NodePgDatabase;

  constructor(pool: Pool) {
    this.db = drizzle(pool);
  }

  async ingest(payload: MeasurementPayload, receivedAt: Date): Promise<IngestResult> {
    const voltage = payload.metrics.find((metric) => metric.name === "battery.voltage" && metric.unit === "V");
    if (!voltage || voltage.value < 0 || voltage.value > 100) {
      throw new Error("Battery voltage is outside the supported range (0-100 V)");
    }
    const acquiredAt = new Date(payload.timestamp);
    return this.db.transaction(async (transaction) => {
      const device = await transaction.execute(sql`SELECT 1 FROM devices WHERE id = ${payload.device_id} LIMIT 1`);
      if (device.rows.length === 0) throw new Error(`Unregistered device: ${payload.device_id}`);
      const inserted = await transaction.execute<MeasurementRow>(sql`
        INSERT INTO measurements (device_id, equipment_id, battery_id, message_id, acquired_at, received_at, voltage, quality)
        SELECT ${payload.device_id},
          da.equipment_id,
          ba.battery_id,
          ${payload.message_id},
          ${acquiredAt},
          ${receivedAt},
          ${voltage.value},
          ${voltage.quality}
        FROM (SELECT 1) source
        LEFT JOIN LATERAL (
          SELECT equipment_id FROM device_assignments
          WHERE device_id = ${payload.device_id}
            AND valid_from <= ${acquiredAt}
            AND (valid_to IS NULL OR valid_to > ${acquiredAt})
          ORDER BY valid_from DESC LIMIT 1
        ) da ON true
        LEFT JOIN LATERAL (
          SELECT battery_id FROM battery_assignments
          WHERE equipment_id = da.equipment_id
            AND valid_from <= ${acquiredAt}
            AND (valid_to IS NULL OR valid_to > ${acquiredAt})
          ORDER BY valid_from DESC LIMIT 1
        ) ba ON true
        ON CONFLICT (device_id, message_id) DO NOTHING
        RETURNING id, device_id, equipment_id, battery_id, message_id, acquired_at, received_at, voltage, quality
      `);
      const created = inserted.rows[0];
      if (created) {
        for (const metric of payload.metrics) {
          await transaction.execute(sql`
            INSERT INTO measurement_metrics (measurement_id, name, value, unit, quality)
            VALUES (${created.id}, ${metric.name}, ${metric.value}, ${metric.unit}, ${metric.quality})
          `);
        }
        const threshold = numericSetting("ALERT_VOLTAGE_THRESHOLD", 23, 0, 100);
        if (created.equipment_id && created.battery_id && voltage.value < threshold) {
          await transaction.execute(sql`
            INSERT INTO alerts (equipment_id, battery_id, measurement_id, type, threshold)
            VALUES (${created.equipment_id}, ${created.battery_id}, ${created.id}, 'low_voltage', ${threshold})
            ON CONFLICT (measurement_id) DO NOTHING
          `);
        }
        return { duplicate: false, measurement: toMeasurement(created) };
      }

      const duplicate = await transaction.execute<MeasurementRow>(sql`
        SELECT id, device_id, equipment_id, battery_id, message_id, acquired_at, received_at, voltage, quality
        FROM measurements WHERE device_id = ${payload.device_id} AND message_id = ${payload.message_id}
        LIMIT 1
      `);
      const existing = duplicate.rows[0];
      if (!existing) throw new Error("Measurement insert conflicted but no existing record was found");
      return { duplicate: true, measurement: toMeasurement(existing) };
    });
  }

  async listDevices(): Promise<unknown[]> {
    return (await this.db.execute(sql`SELECT id, firmware_version, status FROM devices ORDER BY id`)).rows;
  }

  async listEquipment(): Promise<unknown[]> {
    return (await this.db.execute(sql`SELECT id, name, location FROM equipment ORDER BY id`)).rows;
  }

  async listBatteries(): Promise<unknown[]> {
    return (await this.db.execute(sql`
      SELECT b.id, b.technology, b.nominal_voltage, ba.equipment_id
      FROM batteries b
      LEFT JOIN battery_assignments ba ON ba.battery_id = b.id AND ba.valid_to IS NULL
      ORDER BY b.id
    `)).rows;
  }

  async measurementsForEquipment(id: string, from?: Date, to?: Date): Promise<StoredMeasurement[]> {
    const result = await this.db.execute<MeasurementRow>(sql`
      SELECT id, device_id, equipment_id, battery_id, message_id, acquired_at, received_at, voltage, quality
      FROM measurements
      WHERE equipment_id = ${id}
        AND (${from ?? null}::timestamptz IS NULL OR acquired_at >= ${from ?? null})
        AND (${to ?? null}::timestamptz IS NULL OR acquired_at <= ${to ?? null})
      ORDER BY acquired_at
      LIMIT 2000
    `);
    return result.rows.map(toMeasurement);
  }

  async measurementsForBattery(id: string, from?: Date, to?: Date): Promise<StoredMeasurement[]> {
    const result = await this.db.execute<MeasurementRow>(sql`
      SELECT id, device_id, equipment_id, battery_id, message_id, acquired_at, received_at, voltage, quality
      FROM measurements
      WHERE battery_id = ${id}
        AND (${from ?? null}::timestamptz IS NULL OR acquired_at >= ${from ?? null})
        AND (${to ?? null}::timestamptz IS NULL OR acquired_at <= ${to ?? null})
      ORDER BY acquired_at
      LIMIT 2000
    `);
    return result.rows.map(toMeasurement);
  }

  async saveInferredPeriods(
    batteryId: string,
    periods: BatteryPeriod[],
    from?: Date,
    to?: Date,
  ): Promise<BatteryPeriod[]> {
    await this.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        DELETE FROM battery_periods
        WHERE battery_id = ${batteryId}
          AND (${from ?? null}::timestamptz IS NULL OR ended_at >= ${from ?? null})
          AND (${to ?? null}::timestamptz IS NULL OR started_at <= ${to ?? null})
      `);
      for (const period of periods) {
        await transaction.execute(sql`
          INSERT INTO battery_periods (battery_id, started_at, ended_at, state)
          VALUES (${batteryId}, ${new Date(period.started_at)}, ${new Date(period.ended_at)}, ${period.state})
          ON CONFLICT (battery_id, started_at, ended_at, state) DO NOTHING
        `);
      }
    });
    return periods;
  }

  async listAlerts(equipmentId?: string, from?: Date, to?: Date): Promise<unknown[]> {
    return (await this.db.execute(sql`
      SELECT a.id, a.equipment_id, a.battery_id, a.type, a.threshold, a.created_at, m.voltage
      FROM alerts a
      JOIN measurements m ON m.id = a.measurement_id
      WHERE (${equipmentId ?? null}::text IS NULL OR a.equipment_id = ${equipmentId ?? null})
        AND (${from ?? null}::timestamptz IS NULL OR m.acquired_at >= ${from ?? null})
        AND (${to ?? null}::timestamptz IS NULL OR m.acquired_at <= ${to ?? null})
      ORDER BY a.created_at DESC
      LIMIT 500
    `)).rows;
  }

  async health(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }
}
