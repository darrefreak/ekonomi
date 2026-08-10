-- Batch S1: structural integrity checks for financial mutation surfaces.
-- Application Zod remains the primary validation layer; these reinforce DB truth.

-- Currency codes must be 3-letter uppercase ISO-like tokens used by V1.
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_currency_format;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE ledger_postings
  DROP CONSTRAINT IF EXISTS ledger_postings_currency_format;
ALTER TABLE ledger_postings
  ADD CONSTRAINT ledger_postings_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE transaction_splits
  DROP CONSTRAINT IF EXISTS transaction_splits_currency_format;
ALTER TABLE transaction_splits
  ADD CONSTRAINT transaction_splits_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

-- Interest rate basis points cannot be negative in V1.
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_interest_rate_bps_nonneg;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_interest_rate_bps_nonneg
  CHECK (interest_rate_bps IS NULL OR interest_rate_bps >= 0);

-- Split amounts are always present (NOT NULL already); reject zero-length memo abuse via length on varchar is N/A (text).
-- Ensure financial event amounts stay within bigint range implicitly; no float columns exist for money.
