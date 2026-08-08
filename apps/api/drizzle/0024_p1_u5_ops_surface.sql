-- P1-U5: anomaly dismiss + ops surface support
ALTER TABLE "anomaly_findings"
  ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz;
