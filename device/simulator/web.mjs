import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { URL } from "node:url";
import mqtt from "mqtt";
import {
  BatterySimulator,
  createMeasurement,
  getBatteryConfig,
  measurementTopic,
} from "./index.mjs";

// Load environment variables if available
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    try {
      process.loadEnvFile(new URL("../../.env", import.meta.url));
    } catch {
      // Ignore if missing
    }
  }
}

const defaultMqttUrl = process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883";
const webPort = parseInt(process.env.WEB_PORT ?? "4000", 10);
const client = mqtt.connect(defaultMqttUrl, { reconnectPeriod: 2_000, connectTimeout: 10_000 });

client.on("connect", () => {
  console.info(`[Simulator Web Manager] Conectado ao broker MQTT em ${defaultMqttUrl}`);
});
client.on("error", (err) => {
  console.warn(`[Simulator Web Manager] Erro na conexão MQTT: ${err.message}`);
});

class DeviceInstance {
  constructor(options) {
    this.deviceId = options.deviceId;
    this.name = options.name ?? `ESP32 (${options.deviceId})`;
    this.equipmentId = options.equipmentId ?? (options.deviceId === "esp32-002" ? "eq-002" : "eq-001");
    this.running = options.running ?? false;

    // Parameters
    this.sampleIntervalMs = options.sampleIntervalMs ?? 1500;
    this.fullVoltage = options.fullVoltage ?? 26.8;
    this.alertVoltage = options.alertVoltage ?? 23.0;
    this.lowVoltage = options.lowVoltage ?? 22.0;
    this.lowDurationMinutes = options.lowDurationMinutes ?? 1;
    this.normalDrainMin = options.normalDrainMin ?? 0.00;
    this.normalDrainMax = options.normalDrainMax ?? 0.05;
    this.acceleratedDrainMin = options.acceleratedDrainMin ?? 0.05;
    this.acceleratedDrainMax = options.acceleratedDrainMax ?? 0.10;

    // Runtime state
    this.currentVoltage = this.fullVoltage;
    this.lastPublishedAt = null;
    this.totalPublished = 0;
    this.statusNote = "Pronto para iniciar";
    this.timer = null;

    this.initSimulator();
    if (this.running) {
      this.start();
    }
  }

  initSimulator() {
    this.simulator = new BatterySimulator({
      fullVoltage: this.fullVoltage,
      alertVoltage: this.alertVoltage,
      lowVoltage: this.lowVoltage,
      lowDurationMinutes: this.lowDurationMinutes,
      sampleIntervalMs: this.sampleIntervalMs,
      normalDrainMin: this.normalDrainMin,
      normalDrainMax: this.normalDrainMax,
      acceleratedDrainMin: this.acceleratedDrainMin,
      acceleratedDrainMax: this.acceleratedDrainMax,
    }, Math.random);
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.running = true;
    this.statusNote = "Transmitindo...";
    this.publish();
    this.timer = setInterval(() => this.publish(), this.sampleIntervalMs);
  }

  stop() {
    this.running = false;
    this.statusNote = "Parado (Standby)";
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  toggle() {
    if (this.running) {
      this.stop();
    } else {
      this.start();
    }
    return this.running;
  }

  swapBattery() {
    this.initSimulator();
    this.currentVoltage = this.fullVoltage;
    this.statusNote = "🔄 Bateria trocada por nova recarregada (>26 V)";
    if (this.running) {
      this.publish();
    }
  }

  updateConfig(updates) {
    if (updates.name !== undefined) this.name = String(updates.name);
    if (updates.equipmentId !== undefined) this.equipmentId = String(updates.equipmentId);
    if (updates.sampleIntervalMs !== undefined && updates.sampleIntervalMs >= 200) {
      this.sampleIntervalMs = Number(updates.sampleIntervalMs);
    }
    if (updates.fullVoltage !== undefined && updates.fullVoltage > 0) {
      this.fullVoltage = Number(updates.fullVoltage);
    }
    if (updates.alertVoltage !== undefined && updates.alertVoltage > 0) {
      this.alertVoltage = Number(updates.alertVoltage);
    }
    if (updates.lowVoltage !== undefined && updates.lowVoltage > 0) {
      this.lowVoltage = Number(updates.lowVoltage);
    }
    if (updates.lowDurationMinutes !== undefined && updates.lowDurationMinutes >= 0) {
      this.lowDurationMinutes = Number(updates.lowDurationMinutes);
    }
    if (updates.normalDrainMin !== undefined && updates.normalDrainMin >= 0) {
      this.normalDrainMin = Number(updates.normalDrainMin);
    }
    if (updates.normalDrainMax !== undefined && updates.normalDrainMax >= this.normalDrainMin) {
      this.normalDrainMax = Number(updates.normalDrainMax);
    }
    if (updates.acceleratedDrainMin !== undefined && updates.acceleratedDrainMin >= 0) {
      this.acceleratedDrainMin = Number(updates.acceleratedDrainMin);
    }
    if (updates.acceleratedDrainMax !== undefined && updates.acceleratedDrainMax >= this.acceleratedDrainMin) {
      this.acceleratedDrainMax = Number(updates.acceleratedDrainMax);
    }

    // Refresh simulation parameters
    this.initSimulator();

    // Reset interval timer if running
    if (this.running) {
      this.start();
    }
  }

  publish() {
    const sample = this.simulator.nextSample();
    this.currentVoltage = Number(sample.voltage.toFixed(3));
    this.lastPublishedAt = new Date().toISOString();
    this.totalPublished++;

    if (sample.isSwap) {
      this.statusNote = "🔄 [Bateria trocada por nova recarregada (>26 V)]";
    } else if (this.currentVoltage < this.lowVoltage) {
      this.statusNote = "⚠️ [Bateria crítica (<22 V) - contagem para troca]";
    } else if (this.currentVoltage < this.alertVoltage) {
      this.statusNote = `⚡ [Subtensão (<23 V) - consumo acelerado (${this.acceleratedDrainMin.toFixed(2)}-${this.acceleratedDrainMax.toFixed(2)} V)]`;
    } else {
      this.statusNote = `🔋 [Consumo normal (${this.normalDrainMin.toFixed(2)}-${this.normalDrainMax.toFixed(2)} V)]`;
    }

    const measurement = createMeasurement(
      this.deviceId,
      sample,
      new Date(),
      Math.random,
      {
        fullVoltage: this.fullVoltage,
        alertVoltage: this.alertVoltage,
        lowVoltage: this.lowVoltage,
        lowDurationMinutes: this.lowDurationMinutes,
        sampleIntervalMs: this.sampleIntervalMs,
        normalDrainMin: this.normalDrainMin,
        normalDrainMax: this.normalDrainMax,
        acceleratedDrainMin: this.acceleratedDrainMin,
        acceleratedDrainMax: this.acceleratedDrainMax,
      },
    );

    const topic = measurementTopic(this.deviceId);
    if (client.connected) {
      client.publish(topic, JSON.stringify(measurement), { qos: 1 });
    }
  }

  toJSON() {
    return {
      deviceId: this.deviceId,
      name: this.name,
      equipmentId: this.equipmentId,
      running: this.running,
      sampleIntervalMs: this.sampleIntervalMs,
      fullVoltage: this.fullVoltage,
      alertVoltage: this.alertVoltage,
      lowVoltage: this.lowVoltage,
      lowDurationMinutes: this.lowDurationMinutes,
      normalDrainMin: this.normalDrainMin,
      normalDrainMax: this.normalDrainMax,
      acceleratedDrainMin: this.acceleratedDrainMin,
      acceleratedDrainMax: this.acceleratedDrainMax,
      currentVoltage: this.currentVoltage,
      lastPublishedAt: this.lastPublishedAt,
      totalPublished: this.totalPublished,
      statusNote: this.statusNote,
    };
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// Registry of devices
const devices = new Map();

// Default seed devices
const dev1 = new DeviceInstance({
  deviceId: "esp32-001",
  name: "ESP32 #1 — Empilhadeira A (eq-001)",
  equipmentId: "eq-001",
  running: true,
  sampleIntervalMs: 1500,
  normalDrainMin: 0.00,
  normalDrainMax: 0.05,
  acceleratedDrainMin: 0.05,
  acceleratedDrainMax: 0.10,
});
devices.set(dev1.deviceId, dev1);

const dev2 = new DeviceInstance({
  deviceId: "esp32-002",
  name: "ESP32 #2 — Empilhadeira B (eq-002)",
  equipmentId: "eq-002",
  running: false,
  sampleIntervalMs: 2000,
  normalDrainMin: 0.00,
  normalDrainMax: 0.05,
  acceleratedDrainMin: 0.05,
  acceleratedDrainMax: 0.10,
});
devices.set(dev2.deviceId, dev2);

// Helpers
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

// HTTP Server
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // API Routes
  if (url.pathname === "/api/devices") {
    if (method === "GET") {
      const list = Array.from(devices.values()).map((d) => d.toJSON());
      return sendJson(res, 200, list);
    }
    if (method === "POST") {
      try {
        const body = await readBody(req);
        if (!body.deviceId) {
          return sendJson(res, 400, { error: "deviceId é obrigatório." });
        }
        if (devices.has(body.deviceId)) {
          return sendJson(res, 400, { error: `Dispositivo ${body.deviceId} já existe.` });
        }
        const newDevice = new DeviceInstance(body);
        devices.set(newDevice.deviceId, newDevice);
        if (body.startImmediately || body.running) {
          newDevice.start();
        }
        return sendJson(res, 201, newDevice.toJSON());
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // Device subroutes: /api/devices/:id/...
  const match = url.pathname.match(/^\/api\/devices\/([A-Za-z0-9._-]+)(?:\/([a-z]+))?$/);
  if (match) {
    const [, deviceId, action] = match;
    const device = devices.get(deviceId);
    if (!device) {
      return sendJson(res, 404, { error: `Dispositivo ${deviceId} não encontrado.` });
    }

    if (!action) {
      if (method === "GET") {
        return sendJson(res, 200, device.toJSON());
      }
      if (method === "DELETE") {
        device.destroy();
        devices.delete(deviceId);
        return sendJson(res, 200, { success: true, message: `Dispositivo ${deviceId} removido.` });
      }
      if (method === "PATCH") {
        try {
          const body = await readBody(req);
          device.updateConfig(body);
          return sendJson(res, 200, device.toJSON());
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }
    }

    if (action === "toggle" && method === "POST") {
      device.toggle();
      return sendJson(res, 200, device.toJSON());
    }
    if (action === "start" && method === "POST") {
      device.start();
      return sendJson(res, 200, device.toJSON());
    }
    if (action === "stop" && method === "POST") {
      device.stop();
      return sendJson(res, 200, device.toJSON());
    }
    if (action === "swap" && method === "POST") {
      device.swapBattery();
      return sendJson(res, 200, device.toJSON());
    }
  }

  // Batch actions
  if (url.pathname === "/api/batch/start-all" && method === "POST") {
    for (const d of devices.values()) d.start();
    return sendJson(res, 200, { success: true });
  }
  if (url.pathname === "/api/batch/stop-all" && method === "POST") {
    for (const d of devices.values()) d.stop();
    return sendJson(res, 200, { success: true });
  }

  // O favicon pedido pelo browser: mesmo padrão do index, lido do disco a cada request
  if (url.pathname === "/favicon.svg") {
    try {
      const iconPath = new URL("./public/favicon.svg", import.meta.url);
      const content = await readFile(iconPath, "utf-8");
      res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
      return res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "favicon indisponível" }));
    }
  }

  // Static HTML File Serving
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const htmlPath = new URL("./public/index.html", import.meta.url);
      const content = await readFile(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(content);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Erro ao carregar index.html da interface web do simulador.");
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Rota não encontrada" }));
});

server.listen(webPort, "0.0.0.0", () => {
  console.info(`=======================================================`);
  console.info(`🚀 Gerenciador Web de Dispositivos IoT iniciado!`);
  console.info(`🌐 Acesse a interface em: http://localhost:${webPort}`);
  console.info(`📡 Conectado ao broker MQTT em: ${defaultMqttUrl}`);
  console.info(`=======================================================`);
});

// Graceful cleanup
function cleanup() {
  console.info("\nEncerrando Gerenciador de Dispositivos...");
  for (const d of devices.values()) d.destroy();
  client.end(false, () => {
    server.close(() => {
      console.info("Gerenciador encerrado.");
      process.exit(0);
    });
  });
}

process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);
