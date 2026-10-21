-- Refund tracking for the dashboard's Refund button.
ALTER TABLE bookings ADD COLUMN refunded_cents INTEGER;
ALTER TABLE bookings ADD COLUMN refund_id TEXT;
ALTER TABLE bookings ADD COLUMN refunded_at TEXT;
