-- The seeded photo paths were never shipped; show the placeholder until the
-- owner uploads real photos from the dashboard. Additive data fix only.
UPDATE vehicles SET photo_url = NULL WHERE photo_url LIKE '/assets/fleet/%';
