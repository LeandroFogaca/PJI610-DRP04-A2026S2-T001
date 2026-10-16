import { Aedes } from "aedes";
import net from "node:net";
import type { MonitoringRepository } from "../../domain/types.js";
import { startMqttConsumer } from "./consumer.js";

export type MqttBroker = {
  port: number;
  close(): Promise<void>;
};

export async function startMqttBroker(
  host: string,
  port: number,
  repository: MonitoringRepository,
): Promise<MqttBroker> {
  const broker = await Aedes.createBroker();
  const server = net.createServer(broker.handle);
  server.on("error", (error) => console.error("MQTT broker server error", error));
  broker.on("clientError", (client, error) => {
    console.error("MQTT client error", { clientId: client.id, error });
  });
  broker.on("connectionError", (client, error) => {
    console.error("MQTT connection error", { clientId: client?.id, error });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("MQTT broker did not report a TCP listening address");
    }
    const mqttClient = await startMqttConsumer(`mqtt://127.0.0.1:${address.port}`, repository);

    return {
      port: address.port,
      async close() {
        await mqttClient.endAsync();
        const serverClosed = new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
        await new Promise<void>((resolve) => broker.close(resolve));
        await serverClosed;
      },
    };
  } catch (error) {
    await new Promise<void>((resolve) => broker.close(resolve));
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    throw error;
  }
}
