export type Equipment = { id: string; name: string; location?: string };
export type Battery = { id: string; equipment_id: string | null; nominal_voltage: number | null };
export type Measurement = {
  id: number;
  device_id: string;
  equipment_id: string | null;
  battery_id: string | null;
  message_id: string;
  acquired_at: string;
  received_at: string;
  voltage: number;
  quality: "simulated" | "measured" | "estimated";
};
export type Alert = {
  id: number | string;
  equipment_id: string | null;
  battery_id?: string | null;
  type?: string;
  voltage?: number;
  threshold: number;
  created_at?: string;
  measured_at?: string;
};
export type Period = {
  started_at: string;
  ended_at: string;
  state: "charging" | "discharging" | "unknown";
};

const baseUrl = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Falha na API (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  equipment: () => get<Equipment[]>("/api/v1/equipment"),
  batteries: () => get<Battery[]>("/api/v1/batteries"),
  measurements: (equipmentId: string, from: string, to?: string) => {
    const query = new URLSearchParams({ from });
    if (to) query.set("to", to);
    return get<Measurement[]>(`/api/v1/equipment/${encodeURIComponent(equipmentId)}/measurements?${query}`);
  },
  periods: (batteryId: string, from: string, to?: string) => {
    const query = new URLSearchParams({ from });
    if (to) query.set("to", to);
    return get<Period[]>(`/api/v1/batteries/${encodeURIComponent(batteryId)}/periods?${query}`);
  },
  alerts: (equipmentId: string, from: string, to?: string) => {
    const query = new URLSearchParams({ equipment_id: equipmentId, from });
    if (to) query.set("to", to);
    return get<Alert[]>(`/api/v1/alerts?${query}`);
  },
};
