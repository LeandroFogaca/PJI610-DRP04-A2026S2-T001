export type MeasurementPayload = {
  schema_version: "1.0";
  message_id: string;
  device_id: string;
  timestamp: string;
  metrics: Array<{
    name: string;
    value: number;
    unit: string;
    quality: "simulated" | "measured" | "estimated";
  }>;
};

export type StoredMeasurement = {
  id: number;
  device_id: string;
  equipment_id: string | null;
  battery_id: string | null;
  message_id: string;
  acquired_at: string;
  received_at: string;
  voltage: number;
  quality: MeasurementPayload["metrics"][number]["quality"];
};

export type IngestResult = { duplicate: boolean; measurement: StoredMeasurement };

export type BatteryPeriod = {
  started_at: string;
  ended_at: string;
  state: "charging" | "discharging" | "unknown";
};

export interface MonitoringRepository {
  ingest(payload: MeasurementPayload, receivedAt: Date): Promise<IngestResult>;
  listDevices(): Promise<unknown[]>;
  listEquipment(): Promise<unknown[]>;
  listBatteries(): Promise<unknown[]>;
  measurementsForEquipment(id: string, from?: Date, to?: Date): Promise<StoredMeasurement[]>;
  measurementsForBattery(id: string, from?: Date, to?: Date): Promise<StoredMeasurement[]>;
  saveInferredPeriods(
    batteryId: string,
    periods: BatteryPeriod[],
    from?: Date,
    to?: Date,
  ): Promise<BatteryPeriod[]>;
  listAlerts(equipmentId?: string, from?: Date, to?: Date): Promise<unknown[]>;
  health(): Promise<void>;
}
