-- Renters can extend from their reservation page. The extension is held as a
-- request (ext_req_*) until the Square payment for it completes, then applied.
ALTER TABLE bookings ADD COLUMN extension_by TEXT;
ALTER TABLE bookings ADD COLUMN ext_req_date TEXT;
ALTER TABLE bookings ADD COLUMN ext_req_time TEXT;
ALTER TABLE bookings ADD COLUMN ext_req_cents INTEGER;
ALTER TABLE bookings ADD COLUMN ext_req_link TEXT;
ALTER TABLE bookings ADD COLUMN ext_req_link_id TEXT;
ALTER TABLE bookings ADD COLUMN ext_req_order_id TEXT;
ALTER TABLE bookings ADD COLUMN ext_req_at TEXT;
-- Amount of the latest dashboard extension link (extension_cents is the running total).
ALTER TABLE bookings ADD COLUMN extension_link_cents INTEGER;
