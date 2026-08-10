-- Batch R3: financial event lifecycle status for reverse/correct semantics.
-- ACTIVE (default) participates in reconstruct + period totals.
-- REVERSED / CORRECTED are excluded from reconstruct and period economics.

ALTER TABLE "financial_events"
  ADD COLUMN IF NOT EXISTS "status" varchar(40) NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS "financial_events_household_status"
  ON "financial_events" ("household_id", "status");
