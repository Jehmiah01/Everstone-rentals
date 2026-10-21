-- Owner-confirmed colors (2026-10-21).
UPDATE vehicles SET color = 'Black' WHERE id = 'veh_acura_tl';
UPDATE vehicles SET color = 'Red' WHERE id = 'veh_hyundai_elantra';
UPDATE vehicles SET color = 'Gray' WHERE id = 'veh_subaru_forester';

-- Rentals already out before the site launched, blocked so they can't be double-booked.
INSERT OR IGNORE INTO blackouts (id, vehicle_id, start_date, end_date, reason) VALUES
  ('blk_seed_elantra_20261021', 'veh_hyundai_elantra', '2026-10-21', '2026-10-22', 'Existing rental, returns Thu Oct 22 at 6:00 PM'),
  ('blk_seed_forester_20261021', 'veh_subaru_forester', '2026-10-21', '2026-10-27', 'Existing rental, returns Tue Oct 27 at 6:00 PM');
