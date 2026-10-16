export function numericSetting(name: string, defaultValue: number, minimum: number, maximum: number): number {
  const configured = process.env[name];
  if (configured === undefined || configured.trim() === "") return defaultValue;
  const value = Number(configured);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}
