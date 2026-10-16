import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import schema from "../../../../contracts/telemetry/v1/measurement.schema.json" with { type: "json" };
import type { MeasurementPayload } from "../../domain/types.js";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<MeasurementPayload>(schema);

export function validateMeasurement(value: unknown):
  | { valid: true; payload: MeasurementPayload }
  | { valid: false; message: string } {
  if (!validateSchema(value)) {
    return { valid: false, message: ajv.errorsText(validateSchema.errors, { separator: "; " }) };
  }

  const payload = value as MeasurementPayload;
  if (!payload.metrics.some((metric) => metric.name === "battery.voltage" && metric.unit === "V")) {
    return { valid: false, message: "A battery.voltage metric with unit V is required" };
  }
  if (new Set(payload.metrics.map((metric) => metric.name)).size !== payload.metrics.length) {
    return { valid: false, message: "Metric names must be unique within a measurement" };
  }
  if (Date.parse(payload.timestamp) > Date.now() + 5 * 60_000) {
    return { valid: false, message: "Measurement timestamp cannot be more than five minutes in the future" };
  }
  return { valid: true, payload };
}
