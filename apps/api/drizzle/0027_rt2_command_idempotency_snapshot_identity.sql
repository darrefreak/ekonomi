-- RT2 critical remediation (RT2-002, RT2-008)

-- RT2-002: aggregate commands that are not a single financial event need their
-- own durable idempotency record. Identity is (household, command type, client
-- key), so the same Idempotency-Key reused for a different command type does
-- not collide. `result` stores only the identity of what was created; a retry
-- re-reads the entity rather than replaying a frozen response.
CREATE TABLE IF NOT EXISTS "command_idempotency" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "command_type" varchar(80) NOT NULL,
  "idempotency_key" varchar(200) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "command_idempotency_key"
  ON "command_idempotency" ("household_id", "command_type", "idempotency_key");

-- RT2-008: the previous remediation deduplicated balance snapshots on the READ
-- side only, so a duplicate could still be written and 113 duplicate groups had
-- already accumulated from two concurrent delete-then-insert reconcile runs.
--
-- Granularity: several sources legitimately describe the same account on the
-- same day and the history reader ranks between them, so uniqueness belongs on
-- (account_id, as_of, source) and NOT on (account_id, as_of).
--
-- Duplicate resolution rule, applied before the index is created: within one
-- (account_id, as_of, source) group keep the row with the greatest `id` and
-- delete the rest. Every row in such a group was produced by the same writer
-- for the same instant, so they describe the same fact; the greatest id is the
-- most recently inserted and therefore the freshest. No financially distinct
-- snapshot is removed, because a snapshot from a different source, instant or
-- account is by definition in a different group.
DELETE FROM "account_balance_snapshots" a
USING "account_balance_snapshots" b
WHERE a."account_id" = b."account_id"
  AND a."as_of" = b."as_of"
  AND a."source" = b."source"
  AND a."id" < b."id";

-- Normalise historical `manual_opening` rows, which were written at an
-- arbitrary wall-clock instant, onto the same midday-UTC convention every other
-- writer uses. Without this the constraint cannot recognise two opening
-- snapshots for one account as duplicates. Collapse any that collide after
-- normalisation, using the same keep-the-greatest-id rule.
UPDATE "account_balance_snapshots"
SET "as_of" = date_trunc('day', "as_of" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
              + interval '12 hours'
WHERE "source" = 'manual_opening';

DELETE FROM "account_balance_snapshots" a
USING "account_balance_snapshots" b
WHERE a."account_id" = b."account_id"
  AND a."as_of" = b."as_of"
  AND a."source" = b."source"
  AND a."id" < b."id";

-- Fail loudly rather than silently skipping the constraint if anything is left.
DO $$
DECLARE
  remaining bigint;
BEGIN
  SELECT count(*) INTO remaining FROM (
    SELECT 1 FROM "account_balance_snapshots"
    GROUP BY "account_id", "as_of", "source"
    HAVING count(*) > 1
  ) d;
  IF remaining > 0 THEN
    RAISE EXCEPTION
      'account_balance_snapshots still has % duplicate (account_id, as_of, source) groups; resolve them before adding the unique index',
      remaining;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "account_balance_snapshot_identity"
  ON "account_balance_snapshots" ("account_id", "as_of", "source");
