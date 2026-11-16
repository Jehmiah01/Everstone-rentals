-- Rental extensions from the dashboard. return_date/return_time hold the current
-- return; original_return_* keep what the renter signed for (set on the first extension).
ALTER TABLE bookings ADD COLUMN original_return_date TEXT;
ALTER TABLE bookings ADD COLUMN original_return_time TEXT;
ALTER TABLE bookings ADD COLUMN extended_at TEXT;
-- Extra charged for all extensions on this reservation (not part of total_cents, which is what the first payment covered).
ALTER TABLE bookings ADD COLUMN extension_cents INTEGER NOT NULL DEFAULT 0;
-- Square link for the latest extension charge, its order id, and when it was paid.
ALTER TABLE bookings ADD COLUMN extension_link TEXT;
ALTER TABLE bookings ADD COLUMN extension_order_id TEXT;
ALTER TABLE bookings ADD COLUMN extension_paid_at TEXT;
