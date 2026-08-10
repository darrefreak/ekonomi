-- SEB CSV account statement import (V1).
--
-- Extends the existing import architecture rather than adding a second one.
-- Three tables gain columns; nothing is replaced and no existing column changes
-- meaning. See docs/imports/SEB_CSV_DESIGN.md.

-- 1. Batch lifecycle.
--
-- The enum previously held only RUNNING | COMPLETED | FAILED | PARTIAL, which
-- cannot express "the file is parsed and waiting for the user to confirm". A
-- statement import must be able to stop before any financial write.
ALTER TYPE "import_batch_status" ADD VALUE IF NOT EXISTS 'UPLOADED';
ALTER TYPE "import_batch_status" ADD VALUE IF NOT EXISTS 'INSPECTING';
ALTER TYPE "import_batch_status" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
ALTER TYPE "import_batch_status" ADD VALUE IF NOT EXISTS 'IMPORTING';
ALTER TYPE "import_batch_status" ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_WARNINGS';

-- 2. What the batch was.
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "provider" varchar(80);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "format" varchar(80);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "format_version" integer;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "file_name" varchar(260);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "file_byte_size" integer;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "storage_key" varchar(320);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "bucket" varchar(120);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "target_account_id" uuid
  REFERENCES "accounts"("id") ON DELETE SET NULL;

-- Counts with the meaning a statement import needs. createdCount/updatedCount/
-- ignoredCount/failedCount stay as they are for existing writers.
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "new_records" integer NOT NULL DEFAULT 0;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "existing_records" integer NOT NULL DEFAULT 0;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "review_records" integer NOT NULL DEFAULT 0;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "invalid_records" integer NOT NULL DEFAULT 0;

-- 3. Statement period and the source's own reconciliation verdict.
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "period_start" date;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "period_end" date;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "balance_chain_status" varchar(40);
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "balance_chain" jsonb;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "closing_balance_minor" bigint;
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "message" text;

CREATE INDEX IF NOT EXISTS "import_batches_household_started_idx"
  ON "import_batches" ("household_id", "started_at" DESC);
-- Recognising a file the household already uploaded. Not a dedupe key: the same
-- transactions can legitimately arrive in a differently-cut export.
CREATE INDEX IF NOT EXISTS "import_batches_file_hash_idx"
  ON "import_batches" ("household_id", "file_hash");

-- 4. Which line of the file a preserved row came from, so it can be shown as
--    "line 4 812" rather than as an opaque record.
ALTER TABLE "raw_import_records" ADD COLUMN IF NOT EXISTS "row_number" integer;
CREATE INDEX IF NOT EXISTS "raw_import_records_batch_row_idx"
  ON "raw_import_records" ("import_batch_id", "row_number");

-- 5. Statement provenance on the normalized transaction.
--
-- provider_reference is SEB's Verifikationsnummer, which is NOT unique and is
-- therefore not an external id. reported_balance_after_minor is the bank's own
-- running balance: evidence for reconciliation, never a posting.
ALTER TABLE "source_transactions" ADD COLUMN IF NOT EXISTS "provider_reference" varchar(160);
ALTER TABLE "source_transactions" ADD COLUMN IF NOT EXISTS "reported_balance_after_minor" bigint;
-- Why this row needs a human. Needs Review is derived from source_transactions,
-- so an import ambiguity has to be state on the row rather than a separate queue.
ALTER TABLE "source_transactions" ADD COLUMN IF NOT EXISTS "review_reason" varchar(40);

CREATE INDEX IF NOT EXISTS "source_tx_fingerprint_idx"
  ON "source_transactions" ("household_id", "account_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "source_tx_review_reason_idx"
  ON "source_transactions" ("household_id", "review_reason");
-- Finding a manual entry that an imported row may duplicate.
CREATE INDEX IF NOT EXISTS "source_tx_account_date_amount_idx"
  ON "source_transactions" ("account_id", "booking_date", "amount_minor");
