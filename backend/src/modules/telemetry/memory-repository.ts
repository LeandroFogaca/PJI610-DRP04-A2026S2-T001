import type {
  BatteryPeriod,
  IngestResult,
  MeasurementPayload,
  MonitoringRepository,
  StoredMeasurement,
} from "../../domain/types.js";
import { numericSetting } from "../../config/settings.js";

export class MemoryRepository implements MonitoringRepository {
  private readonly records: StoredMeasurement[] = [];
  private readonly inferredPeriods = new Map<string, BatteryPeriod[]>();
  private readonly registeredDevices = new Set(["esp32-001", "esp32-002"]);

  static async createDemo(): Promise<MemoryRepository> {
    const repository = new MemoryRepository();
    const now = Date.now();
    for (let deviceIndex = 0; deviceIndex < 2; deviceIndex += 1) {
      for (let index = 0; index < 24; index += 1) {
        const voltage = deviceIndex === 0
          ? index <= 15 ? 25.8 - index * 0.19 : 22.95 + (index - 15) * 0.16
          : 23.8 + index * 0.1;
        const payload: MeasurementPayload = {
          schema_version: "1.0",
          device_id: deviceIndex === 0 ? "esp32-001" : "esp32-002",
          message_id: `memory-demo-${deviceIndex + 1}-${index + 1}`,
          timestamp: new Date(now - (23 - index) * 15 * 60_000).toISOString(),
          metrics: [{ name: "battery.voltage", value: voltage, unit: "V", quality: "simulated" }],
        };
        await repository.ingest(payload, new Date());
      }
    }
    return repository;
  }

  async ingest(payload: MeasurementPayload, receivedAt: Date): Promise<IngestResult> {
    if (!this.registeredDevices.has(payload.device_id)) {
      throw new Error(`Unregistered device: ${payload.device_id}`);
    }
    const duplicate = this.records.find(
      (row) => row.device_id === payload.device_id && row.message_id === payload.message_id,
    );
    if (duplicate) return { duplicate: true, measurement: duplicate };

    const voltageMetric = payload.metrics.find((metric) => metric.name === "battery.voltage" && metric.unit === "V");
    if (!voltageMetric || voltageMetric.value < 0 || voltageMetric.value > 100) {
      throw new Error("Battery voltage is outside the supported range (0-100 V)");
    }
    const measurement: StoredMeasurement = {
      id: this.records.length + 1,
      device_id: payload.device_id,
      equipment_id: payload.device_id === "esp32-002" ? "eq-002" : "eq-001",
      battery_id: payload.device_id === "esp32-002" ? "battery-002" : "battery-001",
      message_id: payload.message_id,
      acquired_at: payload.timestamp,
      received_at: receivedAt.toISOString(),
      voltage: voltageMetric.value,
      quality: voltageMetric.quality,
    };
    this.records.push(measurement);
    return { duplicate: false, measurement };
  }

  async listDevices(): Promise<unknown[]> {
    return [...this.registeredDevices].map((id) => ({ id, status: "active" }));
  }

  async listEquipment(): Promise<unknown[]> {
    return [
      { id: "eq-001", name: "Equipamento demonstrativo 1" },
      { id: "eq-002", name: "Equipamento demonstrativo 2" },
    ];
  }

  async listBatteries(): Promise<unknown[]> {
    return [
      { id: "battery-001", equipment_id: "eq-001", nominal_voltage: null },
      { id: "battery-002", equipment_id: "eq-002", nominal_voltage: null },
    ];
  }

  async measurementsForEquipment(id: string, from?: Date, to?: Date): Promise<StoredMeasurement[]> {
    return this.records.filter((row) => row.equipment_id === id && this.inRange(row, from, to));
  }

  async measurementsForBattery(id: string, from?: Date, to?: Date): Promise<StoredMeasurement[]> {
    return this.records.filter((row) => row.battery_id === id && this.inRange(row, from, to));
  }

  async saveInferredPeriods(
    batteryId: string,
    periods: BatteryPeriod[],
    from?: Date,
    to?: Date,
  ): Promise<BatteryPeriod[]> {
    const existing = this.inferredPeriods.get(batteryId) ?? [];
    const retained = existing.filter((period) => {
      const overlaps = (!to || Date.parse(period.started_at) <= to.getTime())
        && (!from || Date.parse(period.ended_at) >= from.getTime());
      return !overlaps;
    });
    const updated = [...retained, ...periods].sort(
      (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at),
    );
    this.inferredPeriods.set(batteryId, updated);
    return periods;
  }

  async listAlerts(equipmentId?: string, from?: Date, to?: Date): Promise<unknown[]> {
    const threshold = numericSetting("ALERT_VOLTAGE_THRESHOLD", 23, 0, 100);
    return this.records
      .filter((row) => row.voltage < threshold
        && (!equipmentId || row.equipment_id === equipmentId)
        && this.inRange(row, from, to))
      .map((row) => ({
        id: `voltage-${row.id}`,
        equipment_id: row.equipment_id,
        battery_id: row.battery_id,
        measured_at: row.acquired_at,
        voltage: row.voltage,
        threshold,
        severity: "warning",
      }));
  }

  async health(): Promise<void> {}

  private inRange(row: StoredMeasurement, from?: Date, to?: Date): boolean {
    const instant = Date.parse(row.acquired_at);
    return (!from || instant >= from.getTime()) && (!to || instant <= to.getTime());
  }
}
