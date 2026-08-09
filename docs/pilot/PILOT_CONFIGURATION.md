# Pilot Configuration Contract

What a pilot deployment must be set to, and what it must never be set to.
`pnpm pilot:preflight` checks every mandatory row here and exits non-zero if any
of them is wrong, so this document and the command cannot drift apart without
the command failing.

No secret value appears in this file. Template: [`.env.pilot.example`](../../.env.pilot.example).

## Environment identity

`APP_ENV` names the deployment, separately from `NODE_ENV`. They answer
different questions: `NODE_ENV` tells the framework whether to optimise and
whether the fail-closed secret guard applies; `APP_ENV` tells the operator and
the tooling which system this is. A pilot runs with production semantics while
not being production, and collapsing the two is how a pilot ends up writing to a
development database.

| `APP_ENV` | What it is |
|---|---|
| `development` | a laptop; disposable data |
| `test` | the automated suite; `_test` database, wiped freely |
| `pilot` | real household data, small scope, backed up, recoverable |
| `production` | not yet in use |

## Required values

| Variable | Requirement | Checked by preflight |
|---|---|---|
| `APP_ENV` | `pilot` | must be one of the four known environments |
| `DATABASE_URL` | a database whose name contains `pilot` | mandatory: name, reachability, migrations current |
| `REDIS_URL` | reachable Redis | advisory |
| `JWT_ACCESS_SECRET` | generated, ≥ 32 characters, ≥ 12 distinct, not a known placeholder | mandatory |
| `JWT_REFRESH_SECRET` | if set, not a published placeholder | mandatory when present |
| `S3_ENDPOINT` | the object store | mandatory: must answer |
| `S3_BUCKET` | the live document bucket | mandatory: must exist |
| `FFOS_PILOT_BUCKET` | the bucket the pilot expects | mandatory: must equal `S3_BUCKET` |
| `FFOS_BACKUP_DIR` | host directory outside every container volume | mandatory: must exist and be writable |
| `FFOS_ERASURE_LEDGER_DIR` | host directory, outside the backup directory | mandatory |
| `FFOS_RECOVERY_DATABASE` | never the live database | refused if equal |
| `FFOS_RECOVERY_BUCKET` | never the live bucket | refused if equal |
| `FFOS_BACKUP_RETENTION_DAYS` | 14 for the pilot | used by `backup:prune` |

Generate secrets with `openssl rand -base64 48`. Never reuse a development
secret, and never commit `.env.pilot`.

## Forbidden states

Each of these stops the pilot. They are not warnings.

| State | Why it is refused |
|---|---|
| bucket versioning enabled | a deleted object stays readable as a previous version while the erasure reports success — measured, not theorised |
| object lock enabled | prevents the deletion an erasure depends on |
| retention configured | same |
| `S3_BUCKET` ≠ `FFOS_PILOT_BUCKET` | the deployment is pointed somewhere nobody intended |
| `FFOS_ALLOW_DB_RESET=true` | destructive schema resets must not be one typo away |
| a placeholder signing secret | a token anyone can forge |
| pending migrations | the code and the schema disagree |
| pilot pointed at a `_dev` or `_test` database | real data in a database something else may wipe |
| no backup destination | no recovery path, which is what kept the pilot from starting in the first place |
| no erasure ledger | a restore could silently undo an erasure |

## Why the database name must contain "pilot"

The reset guard treats `pilot` as a protected marker, alongside `prod`,
`staging`, `live` and `customer`. A database named `ffos_pilot` can never
satisfy `pnpm db:reset`, whatever environment variables are set — the guard
refuses protected names before it looks at anything else. Naming the database
correctly is therefore not a convention; it is what makes the reset guard
protect it.

Recovering a pilot database is a separate, deliberate workflow:
`pnpm recovery:prepare`, described in [`PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md).

## Bucket layout

| Bucket | Role |
|---|---|
| `ffos-pilot` | live documents; the only bucket the application writes to |
| `ffos-pilot-recovery` | restore target; never read by the application |
| the backup directory | copies of objects on the host filesystem, outside any container volume |

The backup copy is deliberately outside object storage. It is not a second live
bucket, the application never reads it, and it is not part of document storage.

## Logging

The following must never appear in a log, and were re-verified for the pilot:
signing secrets, passwords, database connection strings, object storage
credentials, session or refresh tokens, personnummer, and the contents of an
uploaded document. The ops commands print host, port, database name, bucket name
and counts — never a credential. `production-secret.py` PROD-014 asserts the
running process never writes its signing secret to the logs.

## Access

The pilot is reached over localhost or a private network. Registration is open
in the product, so the deployment must not be published to the public internet
during the pilot; anyone who can reach the API can create an account, and while
they would see nothing of the pilot household (household isolation is verified
across 37 surfaces), an unbounded set of accounts is not a state worth
operating.
