CREATE TYPE "public"."account_type" AS ENUM('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT', 'MORTGAGE', 'LOAN', 'TAX_ACCOUNT', 'PENSION', 'CRYPTO', 'OTHER', 'EXPENSE', 'INCOME', 'ASSET');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('CONNECTED', 'SYNCING', 'AUTH_REQUIRED', 'DEGRADED', 'ERROR', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'BOOKED', 'REVERSED', 'CORRECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."financial_event_type" AS ENUM('INCOME', 'EXPENSE', 'TRANSFER', 'INVESTMENT', 'LOAN_PRINCIPAL', 'INTEREST', 'FEE', 'TAX', 'REFUND', 'REIMBURSEMENT', 'ASSET_PURCHASE', 'ASSET_SALE', 'CREDIT_CARD_PURCHASE', 'CREDIT_CARD_PAYMENT', 'ADJUSTMENT', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."posting_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider_id" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"domain" varchar(40) NOT NULL,
	"protocol" varchar(40) NOT NULL,
	"authentication_method" varchar(40) NOT NULL,
	"connection_status" "connection_status" DEFAULT 'CONNECTED' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"freshness_label" varchar(80),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"source_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "import_batch_status" DEFAULT 'RUNNING' NOT NULL,
	"total_records" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"ignored_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_import_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"source_id" uuid,
	"import_batch_id" uuid,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hash" varchar(128) NOT NULL,
	"processing_status" "processing_status" DEFAULT 'PENDING' NOT NULL,
	"schema_version" varchar(40) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"parent_id" uuid,
	"key" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(40) DEFAULT 'expense' NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"canonical_name" varchar(160) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"merchant_category" varchar(80),
	"country" varchar(2) DEFAULT 'SE',
	"confidence" numeric(5, 4) DEFAULT '1',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(80),
	"owner_member_id" uuid,
	"is_shared" boolean DEFAULT true NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"account_type" "account_type" NOT NULL,
	"external_reference" varchar(160),
	"source_id" uuid,
	"credit_limit_minor" bigint,
	"current_balance_minor" bigint DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"connection_status" "connection_status" DEFAULT 'CONNECTED' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"reported_balance_minor" bigint,
	"available_balance_minor" bigint,
	"ledger_calculated_balance_minor" bigint,
	"reconciled_balance_minor" bigint,
	"as_of" timestamp with time zone NOT NULL,
	"source" varchar(40) DEFAULT 'seed' NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '1',
	"user_verified" boolean DEFAULT false NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" varchar(160),
	"fingerprint" varchar(128),
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"description" text,
	"raw_description" text,
	"merchant_id" uuid,
	"category_id" uuid,
	"status" "transaction_status" DEFAULT 'BOOKED' NOT NULL,
	"source_id" uuid,
	"import_batch_id" uuid,
	"source_record_id" uuid,
	"confidence" numeric(5, 4) DEFAULT '1',
	"is_recurring" boolean DEFAULT false NOT NULL,
	"is_internal_transfer" boolean DEFAULT false NOT NULL,
	"transfer_group_id" uuid,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"event_type" "financial_event_type" NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"expense_amount_minor" bigint DEFAULT 0 NOT NULL,
	"income_amount_minor" bigint DEFAULT 0 NOT NULL,
	"debt_reduction_minor" bigint DEFAULT 0 NOT NULL,
	"net_worth_delta_minor" bigint DEFAULT 0 NOT NULL,
	"merchant_id" uuid,
	"category_id" uuid,
	"vehicle_id" uuid,
	"confidence" numeric(5, 4) DEFAULT '1',
	"user_verified" boolean DEFAULT false NOT NULL,
	"source_type" varchar(40) DEFAULT 'seed',
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_transaction_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"source_transaction_id" uuid NOT NULL,
	"financial_event_id" uuid NOT NULL,
	"role" varchar(40) DEFAULT 'primary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"financial_event_id" uuid NOT NULL,
	"booked_on" date NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "posting_side" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"financial_event_id" uuid NOT NULL,
	"category_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"vehicle_id" uuid,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "reconciliation_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" varchar(40) DEFAULT 'transfer' NOT NULL,
	"status" varchar(40) DEFAULT 'suggested' NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0.9',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import_records" ADD CONSTRAINT "raw_import_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import_records" ADD CONSTRAINT "raw_import_records_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import_records" ADD CONSTRAINT "raw_import_records_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_member_id_household_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."household_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_events" ADD CONSTRAINT "financial_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_financial_event_id_financial_events_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_financial_event_id_financial_events_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_groups" ADD CONSTRAINT "reconciliation_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_import_records_household_hash" ON "raw_import_records" USING btree ("household_id","hash");--> statement-breakpoint
CREATE UNIQUE INDEX "source_tx_household_external" ON "source_transactions" USING btree ("household_id","account_id","external_id");
