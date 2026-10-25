-- Extra driver fee: charged per listed driver, per rental day. Set per car in the dashboard.
ALTER TABLE vehicles ADD COLUMN driver_fee_cents INTEGER NOT NULL DEFAULT 1000;
-- What a reservation charges for extra drivers. Already included in bookings.total_cents.
ALTER TABLE bookings ADD COLUMN driver_fee_cents INTEGER NOT NULL DEFAULT 0;
