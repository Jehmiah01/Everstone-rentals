-- Agreements the owner sends a team member (for example the VA) to sign in the dashboard.
-- status: sent (waiting on the team member) | signed (team member signed; owner may countersign) | void
CREATE TABLE IF NOT EXISTS team_agreements (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  number TEXT NOT NULL,
  terms TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  contractor_name TEXT,
  contractor_address TEXT,
  contractor_signed_at TEXT,
  contractor_ip TEXT,
  contractor_user_agent TEXT,
  signature_key TEXT,
  doc_hash TEXT,
  owner_name TEXT,
  owner_signed_at TEXT,
  pdf_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_agreements_staff ON team_agreements(staff_id, created_at);
