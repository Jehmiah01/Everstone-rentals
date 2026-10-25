-- Most an extra driver can cost per rental (0 = no cap). Set per car in the dashboard.
ALTER TABLE vehicles ADD COLUMN driver_fee_cap_cents INTEGER NOT NULL DEFAULT 5000;
