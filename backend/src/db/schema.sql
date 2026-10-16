CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  firmware_version text NOT NULL DEFAULT 'simulator-1.0',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS equipment (
  id text PRIMARY KEY,
  name text NOT NULL,
  location text NOT NULL DEFAULT 'Demonstração'
);

CREATE TABLE IF NOT EXISTS batteries (
  id text PRIMARY KEY,
  technology text,
  nominal_voltage double precision CHECK (nominal_voltage IS NULL OR nominal_voltage > 0)
);

CREATE TABLE IF NOT EXISTS device_assignments (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  equipment_id text NOT NULL REFERENCES equipment(id),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_assignment_per_device
  ON device_assignments(device_id) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS battery_assignments (
  id bigserial PRIMARY KEY,
  equipment_id text NOT NULL REFERENCES equipment(id),
  battery_id text NOT NULL REFERENCES batteries(id),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_battery_per_equipment
  ON battery_assignments(equipment_id) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS measurements (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  equipment_id text REFERENCES equipment(id),
  battery_id text REFERENCES batteries(id),
  message_id text NOT NULL,
  acquired_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  voltage double precision NOT NULL CHECK (voltage >= 0 AND voltage <= 100),
  quality text NOT NULL CHECK (quality IN ('simulated', 'measured', 'estimated')),
  UNIQUE(device_id, message_id)
);

CREATE INDEX IF NOT EXISTS measurements_equipment_time ON measurements(equipment_id, acquired_at);
CREATE INDEX IF NOT EXISTS measurements_battery_time ON measurements(battery_id, acquired_at);

CREATE TABLE IF NOT EXISTS measurement_metrics (
  measurement_id bigint NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  name text NOT NULL,
  value double precision NOT NULL,
  unit text NOT NULL,
  quality text NOT NULL CHECK (quality IN ('simulated', 'measured', 'estimated')),
  PRIMARY KEY (measurement_id, name)
);

CREATE TABLE IF NOT EXISTS battery_periods (
  id bigserial PRIMARY KEY,
  battery_id text NOT NULL REFERENCES batteries(id),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('charging', 'discharging', 'unknown')),
  CHECK (ended_at >= started_at),
  UNIQUE (battery_id, started_at, ended_at, state)
);

CREATE TABLE IF NOT EXISTS alerts (
  id bigserial PRIMARY KEY,
  equipment_id text REFERENCES equipment(id),
  battery_id text REFERENCES batteries(id),
  measurement_id bigint NOT NULL UNIQUE REFERENCES measurements(id),
  type text NOT NULL,
  threshold double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
