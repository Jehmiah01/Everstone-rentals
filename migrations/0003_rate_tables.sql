-- Length-based pricing set by the owner (totals in cents for 1..7 days).
ALTER TABLE vehicles ADD COLUMN rate_table TEXT;
UPDATE vehicles SET rate_table = '[8500,16000,22500,28000,32500,34500,35000]', daily_rate_cents = 8500, weekly_rate_cents = 35000, rate_confirmed = 1;
