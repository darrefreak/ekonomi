ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "opening_balance_minor" bigint NOT NULL DEFAULT 0;

ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "reported_balance_minor" bigint;

COMMENT ON COLUMN "accounts"."opening_balance_minor" IS
  'Authoritative opening for ledger reconstruction (minor units).';

COMMENT ON COLUMN "accounts"."current_balance_minor" IS
  'Derived cache of ledger-calculated ending balance; must not diverge silently from postings.';

COMMENT ON COLUMN "accounts"."reported_balance_minor" IS
  'Optional provider/bank-reported balance for reconciliation (not ledger truth).';
