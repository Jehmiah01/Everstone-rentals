-- Additional drivers: full license details per reservation and their own
-- one-time ID check (license photo + selfie), reviewed by the owner.
CREATE TABLE IF NOT EXISTS additional_drivers (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  dob TEXT NOT NULL,
  dl_number TEXT NOT NULL,
  dl_state TEXT NOT NULL,
  dl_expiration TEXT NOT NULL,
  token TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  license_key TEXT,
  selfie_key TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_additional_drivers_booking ON additional_drivers(booking_id);
CREATE INDEX IF NOT EXISTS idx_additional_drivers_license ON additional_drivers(dl_number);
