-- Everstone Rentals schema. Additive only; one live database.
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT,
  vin TEXT,
  plate TEXT,
  owner_name TEXT,
  daily_rate_cents INTEGER NOT NULL DEFAULT 5000,
  weekly_rate_cents INTEGER NOT NULL DEFAULT 35000,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  late_fee_cents INTEGER NOT NULL DEFAULT 2500,
  late_daily_cents INTEGER NOT NULL DEFAULT 1000,
  seats INTEGER DEFAULT 5,
  transmission TEXT DEFAULT 'Automatic',
  fuel TEXT DEFAULT 'Gasoline',
  description TEXT,
  photo_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  rate_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO vehicles (id, slug, year, make, model, color, vin, plate, owner_name, daily_rate_cents, weekly_rate_cents, seats, description, photo_url, rate_confirmed) VALUES
  ('veh_acura_tl', 'acura-tl', 2007, 'Acura', 'TL', 'Dark grey', '19UUA66257A018557', '4GV8423', 'Jehmiah Johnson', 5000, 35000, 5, 'Comfortable mid-size sedan with a smooth V6, leather seats and plenty of trunk space for a week in the city.', '/assets/fleet/acura-tl.jpg', 1),
  ('veh_hyundai_elantra', 'hyundai-elantra', 2008, 'Hyundai', 'Elantra', 'Silver', NULL, NULL, NULL, 5000, 35000, 5, 'Easy-to-park compact sedan with great fuel economy. A simple, dependable daily driver.', '/assets/fleet/hyundai-elantra.jpg', 0),
  ('veh_subaru_forester', 'subaru-forester', 2009, 'Subaru', 'Forester', 'Dark green', NULL, NULL, NULL, 5000, 35000, 5, 'All-wheel-drive compact SUV with a tall cargo area. Good in rain and snow, easy to load.', '/assets/fleet/subaru-forester.jpg', 0);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  dob TEXT NOT NULL,
  dl_number TEXT NOT NULL,
  dl_state TEXT NOT NULL,
  dl_expiration TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  pickup_time TEXT NOT NULL DEFAULT '10:00',
  return_time TEXT NOT NULL DEFAULT '10:00',
  days INTEGER NOT NULL,
  rate_breakdown TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  additional_drivers TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_link TEXT,
  square_order_id TEXT,
  square_payment_id TEXT,
  paid_at TEXT,
  agreements_signed_at TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  address_sent_at TEXT,
  approved_at TEXT,
  rep_name TEXT,
  rep_signed_at TEXT,
  mileage_out TEXT,
  fuel_out TEXT,
  condition_notes TEXT,
  mileage_in TEXT,
  fuel_in TEXT,
  damage_cents INTEGER,
  fees_cents INTEGER,
  deposit_refunded_cents INTEGER,
  deposit_deducted_cents INTEGER,
  final_paid_cents INTEGER,
  actual_return_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_dates ON bookings(vehicle_id, pickup_date, return_date);
CREATE INDEX IF NOT EXISTS idx_bookings_order ON bookings(square_order_id);

CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  signed_at TEXT,
  signer_name TEXT,
  initials TEXT,
  consent_text TEXT,
  ip TEXT,
  user_agent TEXT,
  signature_key TEXT,
  pdf_key TEXT,
  doc_hash TEXT,
  sent_at TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agreements_booking ON agreements(booking_id);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  license_key TEXT,
  selfie_key TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  reviewed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verifications_booking ON verifications(booking_id);

CREATE TABLE IF NOT EXISTS blackouts (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
