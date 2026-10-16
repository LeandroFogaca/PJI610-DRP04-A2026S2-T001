# Backend

Fastify/TypeScript API with an embedded Aedes MQTT broker and telemetry consumer. The backend starts the broker on `MQTT_BIND_HOST`/`MQTT_PORT` (defaults `127.0.0.1:1883`) and connects its consumer internally. The PostgreSQL schema is initialized with `npm run migrate`; `npm run seed` inserts demonstration assets and 48 simulated measurements. Configure the repository-root `.env` from `.env.example` before running these commands.

Endpoints are implemented under `/api/v1`; `/health` checks database connectivity. Telemetry is validated against `contracts/telemetry/v1/measurement.schema.json`, MQTT identity must match the topic, retries are deduplicated by `(device_id, message_id)`, and the battery is resolved using the assignment active at acquisition time. Measurements without an unambiguous assignment remain stored with nullable asset IDs rather than being attached incorrectly.

Low-voltage alerts are stored when a new assigned reading falls below `ALERT_VOLTAGE_THRESHOLD`. Periods are inferred from the slope between consecutive voltage readings; `CYCLE_MIN_CHANGE_PER_MINUTE` configures the demonstration threshold. Neither the alert threshold nor the classifier settings are characterized for the real operation.

Run `npm run dev --workspace backend`, `npm run test --workspace backend`, or `npm run build --workspace backend` from the repository root. MQTT development topic: `telemetry/v1/{device_id}/measurements`. The broker has no authentication or TLS; leave it on localhost unless you are using an isolated development network.
