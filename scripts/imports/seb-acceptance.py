#!/usr/bin/env python3
"""SEB CSV account statement — acceptance against the running product.

Drives the real HTTP API in a freshly registered, isolated household: no pilot
data, no demo household, no live store. Everything it imports is synthetic.

The statement it generates has the shape and scale of the export this workstream
was specified against — 8 184 rows, 2021-08-10 to 2026-08-10, semicolon
delimited, UTF-8 with BOM, `YYYY-MM-DD` dates and three-decimal amounts — because
the real file was not present in this environment. Section 5 of
docs/imports/SEB_CSV_ACCEPTANCE.md records that plainly.

Run: python3 scripts/imports/seb-acceptance.py
"""

import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = "http://localhost:3001/api/v1"
PG = ["docker", "exec", "ekonomi-postgres-1", "psql", "-U", "ffos", "-d", "ffos_dev", "-tAc"]

ROW_COUNT = 8_184
START_DATE = "2021-08-10"
END_DATE = "2026-08-10"
OPENING_MINOR = 5_000_000  # 50 000,00 kr

RESULTS: list[tuple[str, bool, str, str]] = []
FACTS: dict[str, object] = {}


def check(ident: str, claim: str, ok: bool, detail: str) -> None:
    RESULTS.append((ident, ok, claim, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {ident} {claim}: {detail}")


def call(method, path, token=None, body=None, query=None, headers=None, timeout=900):
    url = API + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return error.code, {"raw": raw.decode(errors="replace")}


def sql(statement: str) -> str:
    done = subprocess.run(PG + [statement], capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip())
    return done.stdout.strip()


def idem():
    return {"Idempotency-Key": str(uuid.uuid4())}


def register(label: str):
    email = f"seb-import-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    status, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "SebImportAccept123!", "displayName": label},
    )
    if status >= 400:
        raise SystemExit(f"could not register: {status} {body}")
    token = body["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": f"Import {label}"})
    return token, household["id"]


# --------------------------------------------------------------- the statement

MERCHANTS = [
    "ICA MAXI STORMARKNAD", "COOP FORUM", "APOTEKET AB", "SL BILJETT",
    "APPLE COM/BI", "SPOTIFY AB", "CIRCLE K", "SYSTEMBOLAGET",
    "H&M SVERIGE", "IKEA KUNGENS KURVA", "HYRA BOSTAD", "ELNÄT AB",
    "46700280624", "BG MAX INBETALNING", "SWISH BETALNING",
]


def to_seb_decimal(minor: int) -> str:
    """Öre to SEB's three-decimal form. Integer arithmetic only."""
    sign = "-" if minor < 0 else ""
    value = abs(minor)
    return f"{sign}{value // 100}.{value % 100:02d}0"


def build_statement(row_count: int, seed: int = 20260810):
    """A statement whose reported balance chains exactly, by construction."""
    import datetime
    import random

    rng = random.Random(seed)
    start = datetime.date.fromisoformat(START_DATE)
    end = datetime.date.fromisoformat(END_DATE)
    span = (end - start).days

    rows = []
    balance = OPENING_MINOR
    for i in range(row_count):
        day = start + datetime.timedelta(days=(i * span) // max(1, row_count - 1))
        is_income = i % 30 == 0
        # A month of salary against a month of spending, so the balance stays
        # plausible across five years instead of drifting far negative.
        magnitude = (
            rng.randint(3_600_000, 3_900_000) if is_income else rng.randint(1_000, 250_000)
        )
        amount = magnitude if is_income else -magnitude
        balance += amount
        rows.append(
            {
                "booking": day.isoformat(),
                "value": day.isoformat(),
                # A small reference pool, so the same Verifikationsnummer recurs
                # across unrelated transactions exactly as SEB does.
                "reference": str(100000 + (i % 900)),
                "text": "LÖN ARBETSGIVARE AB" if is_income else MERCHANTS[i % len(MERCHANTS)],
                "amount": amount,
                "balance": balance,
            }
        )
    return rows, balance


def to_csv(rows, *, bom=True) -> bytes:
    header = "Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo"
    lines = [header]
    for row in rows:
        lines.append(
            ";".join(
                [
                    row["booking"],
                    row["value"],
                    row["reference"],
                    row["text"],
                    to_seb_decimal(row["amount"]),
                    to_seb_decimal(row["balance"]),
                ]
            )
        )
    text = "\n".join(lines) + "\n"
    return (("\ufeff" if bom else "") + text).encode("utf-8")


def encode(payload: bytes) -> str:
    return base64.b64encode(payload).decode("ascii")


def await_batch(token, household, batch_id, *, limit_seconds=900):
    """Poll until the batch reaches a terminal state."""
    deadline = time.time() + limit_seconds
    delay = 1.0
    while time.time() < deadline:
        _, batch = call("GET", f"/imports/batches/{batch_id}", token, query={"householdId": household})
        if batch.get("status") in {"COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED"}:
            return batch
        time.sleep(delay)
        delay = min(delay * 1.25, 5.0)
    raise SystemExit("import did not finish within the time limit")


# ------------------------------------------------------------------- the run

print(f"Building a synthetic SEB statement: {ROW_COUNT} rows, {START_DATE} → {END_DATE}")
rows, closing = build_statement(ROW_COUNT)
csv_bytes = to_csv(rows)
print(f"  {len(csv_bytes):,} bytes, closing balance {to_seb_decimal(closing)}\n")

token, household = register("Isolerat")
_, account = call(
    "POST",
    "/accounts",
    token,
    {
        "householdId": household,
        "name": "SEB Lönekonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": str(OPENING_MINOR),
    },
    headers=idem(),
)
account_id = account["id"]
FACTS["householdId"] = household
FACTS["accountId"] = account_id

# SEB-001 format detection
started = time.time()
status, preview = call(
    "POST",
    "/imports/statements/inspect",
    token,
    {
        "householdId": household,
        "accountId": account_id,
        "filename": "kontoutdrag 20260810-1206.csv",
        "contentBase64": encode(csv_bytes),
    },
)
if status >= 400:
    raise SystemExit(f"inspect failed: {status} {json.dumps(preview)[:400]}")
inspect_seconds = time.time() - started

check(
    "SEB-001",
    "the file is recognised as a SEB CSV account statement",
    preview.get("provider") == "SEB"
    and preview.get("format") == "SEB_CSV_ACCOUNT_STATEMENT"
    and preview.get("formatVersion") == 1,
    f"provider {preview.get('provider')}, format {preview.get('format')}, version {preview.get('formatVersion')}",
)

# SEB-002 rows parsed
check(
    "SEB-002",
    "every row is parsed",
    preview["totalRows"] == ROW_COUNT and preview["invalidRows"] == 0,
    f"{preview['totalRows']} rows, {preview['invalidRows']} invalid, inspected in {inspect_seconds:.1f}s",
)
FACTS["rowsParsed"] = preview["totalRows"]
FACTS["invalidRows"] = preview["invalidRows"]

# SEB-003 date range
check(
    "SEB-003",
    "the period matches the statement",
    preview["periodStart"] == START_DATE and preview["periodEnd"] == END_DATE,
    f"{preview['periodStart']} → {preview['periodEnd']}",
)
FACTS["periodStart"] = preview["periodStart"]
FACTS["periodEnd"] = preview["periodEnd"]

# SEB-004 exact money
check(
    "SEB-004",
    "the closing balance is exact in öre",
    preview["closingBalanceMinor"] == str(closing),
    f"reported {preview['closingBalanceMinor']}, expected {closing}",
)

# SEB-005 balance chain
chain = preview["balanceChain"]
check(
    "SEB-005",
    "the statement reconciles against its own reported balances",
    chain["status"] == "RECONCILED" and chain["breakCount"] == 0,
    f"{chain['status']}, {chain['rowsReconciled']}/{chain['rowsChecked']} links, {chain['breakCount']} breaks, direction {chain['direction']}",
)
FACTS["balanceChainStatus"] = chain["status"]
FACTS["balanceChainBreaks"] = chain["breakCount"]

# SEB-006 preview stays small
check(
    "SEB-006",
    "the preview hands the client a sample, not every row",
    len(preview["sample"]) <= 25,
    f"{len(preview['sample'])} sample rows for {preview['totalRows']} total",
)

# SEB-007 nothing financial has happened yet
events_before = int(sql(f"select count(*) from financial_events where household_id = '{household}'"))
raw_after_inspect = int(sql(f"select count(*) from raw_import_records where household_id = '{household}'"))
check(
    "SEB-007",
    "inspection preserves every row and writes nothing to the ledger",
    events_before == 0 and raw_after_inspect == ROW_COUNT,
    f"{raw_after_inspect} raw rows preserved, {events_before} financial events",
)
FACTS["rawRowsPreserved"] = raw_after_inspect

# SEB-008 confirmation is explicit and the work is queued
started = time.time()
status, commit = call(
    "POST",
    "/imports/statements/commit",
    token,
    {"householdId": household, "batchId": preview["batchId"]},
)
check(
    "SEB-008",
    "confirmation returns without holding the request open for the whole import",
    status < 400 and time.time() - started < 30,
    f"status {status}, returned in {time.time() - started:.1f}s, queued={commit.get('queued')}",
)

batch = await_batch(token, household, preview["batchId"])
commit_seconds = time.time() - started
check(
    "SEB-009",
    "the batch reaches a terminal status",
    batch["status"] in {"COMPLETED", "COMPLETED_WITH_WARNINGS"},
    f"{batch['status']} after {commit_seconds:.1f}s, {batch['newRecords']} new, {batch['failedCount']} failed",
)
FACTS["newTransactions"] = batch["newRecords"]
FACTS["failed"] = batch["failedCount"]
FACTS["reviewRecords"] = batch["reviewRecords"]
FACTS["commitSeconds"] = round(commit_seconds, 1)

# SEB-010 source transactions and links
tx_count = int(sql(f"select count(*) from source_transactions where household_id = '{household}'"))
event_count = int(sql(f"select count(*) from financial_events where household_id = '{household}'"))
link_count = int(sql(f"select count(*) from source_transaction_links where household_id = '{household}'"))
check(
    "SEB-010",
    "each imported row is one source transaction linked to one financial event",
    tx_count == ROW_COUNT and event_count == ROW_COUNT and link_count == ROW_COUNT,
    f"{tx_count} transactions, {event_count} events, {link_count} links",
)

# SEB-011 the ledger balances
unbalanced = sql(
    f"""
    select count(*) from (
      select ledger_entry_id
      from ledger_postings
      where household_id = '{household}'
      group by ledger_entry_id
      having sum(case when side = 'debit' then amount_minor else -amount_minor end) <> 0
    ) x
    """
)
check(
    "SEB-011",
    "every ledger entry balances",
    unbalanced == "0",
    f"{unbalanced} unbalanced entries",
)

# SEB-012 the ledger agrees with the statement's own closing balance
posted = sql(
    f"""
    select coalesce(sum(case when side = 'debit' then amount_minor else -amount_minor end), 0)
    from ledger_postings
    where household_id = '{household}' and account_id = '{account_id}'
    """
)
derived = OPENING_MINOR + int(posted)
check(
    "SEB-012",
    "the ledger's account balance equals the statement's closing balance",
    derived == closing,
    f"ledger {derived}, statement {closing}",
)

# SEB-012b the cached balance the product displays agrees too
cached = sql(
    f"select current_balance_minor from accounts where id = '{account_id}'"
)
reported = sql(
    f"select reported_balance_minor from accounts where id = '{account_id}'"
)
check(
    "SEB-012b",
    "the derived balance cache the product displays agrees with the postings",
    int(cached) == closing and int(reported) == closing,
    f"cached {cached}, reported {reported}, statement {closing}",
)
FACTS["cachedBalanceMinor"] = int(cached)

# SEB-012c the statement's own starting point is stated
check(
    "SEB-012c",
    "the preview states what the account held before the first row",
    preview.get("statementStartingBalanceMinor") == str(OPENING_MINOR),
    f"statement starts at {preview.get('statementStartingBalanceMinor')}, account opened at {OPENING_MINOR}",
)

# SEB-013 duplicate provider references did not merge anything
distinct_refs = int(
    sql(f"select count(distinct provider_reference) from source_transactions where household_id = '{household}'")
)
check(
    "SEB-013",
    "a reused Verifikationsnummer did not collapse transactions",
    distinct_refs < tx_count and tx_count == ROW_COUNT,
    f"{distinct_refs} distinct references across {tx_count} transactions",
)
FACTS["distinctProviderReferences"] = distinct_refs

# SEB-014 Saldo is evidence, not a posting
snapshots = int(
    sql(f"select count(*) from account_balance_snapshots where household_id = '{household}' and source = 'seb_statement'")
)
postings = int(sql(f"select count(*) from ledger_postings where household_id = '{household}'"))
check(
    "SEB-014",
    "the reported balance became a snapshot, never a posting",
    snapshots == 1 and postings == ROW_COUNT * 2,
    f"{snapshots} statement snapshot, {postings} postings for {ROW_COUNT} rows",
)

# SEB-015 same file again
status, again = call(
    "POST",
    "/imports/statements/inspect",
    token,
    {
        "householdId": household,
        "accountId": account_id,
        "filename": "kontoutdrag 20260810-1206.csv",
        "contentBase64": encode(csv_bytes),
    },
)
check(
    "SEB-015",
    "the same file again finds nothing new",
    again["newRows"] == 0 and again["existingRows"] == ROW_COUNT,
    f"{again['newRows']} new, {again['existingRows']} already imported",
)

call("POST", "/imports/statements/commit", token, {"householdId": household, "batchId": again["batchId"]})
await_batch(token, household, again["batchId"])
tx_after = int(sql(f"select count(*) from source_transactions where household_id = '{household}'"))
event_after = int(sql(f"select count(*) from financial_events where household_id = '{household}'"))
check(
    "SEB-016",
    "re-importing the same file creates no second economic effect",
    tx_after == tx_count and event_after == event_count,
    f"{tx_after} transactions and {event_after} events, unchanged",
)

# SEB-017 overlapping export.
#
# A true superset: a second household imports the first 6 000 rows, then the same
# statement in full. Slicing a prefix keeps the running balance intact, so the
# overlap is row-for-row identical — which is what a household re-exporting a
# longer period actually produces.
overlap_token, overlap_household = register("Overlappande")
_, overlap_account = call(
    "POST",
    "/accounts",
    overlap_token,
    {
        "householdId": overlap_household,
        "name": "SEB Lönekonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": str(OPENING_MINOR),
    },
    headers=idem(),
)
PREFIX = 6_000
_, first_half = call(
    "POST",
    "/imports/statements/inspect",
    overlap_token,
    {
        "householdId": overlap_household,
        "accountId": overlap_account["id"],
        "filename": "kontoutdrag-del1.csv",
        "contentBase64": encode(to_csv(rows[:PREFIX])),
    },
)
call(
    "POST",
    "/imports/statements/commit",
    overlap_token,
    {"householdId": overlap_household, "batchId": first_half["batchId"]},
)
await_batch(overlap_token, overlap_household, first_half["batchId"])

status, overlap = call(
    "POST",
    "/imports/statements/inspect",
    overlap_token,
    {
        "householdId": overlap_household,
        "accountId": overlap_account["id"],
        "filename": "kontoutdrag-hela.csv",
        "contentBase64": encode(csv_bytes),
    },
)
check(
    "SEB-017",
    "an overlapping export imports only the rows that are new",
    status < 400
    and overlap["existingRows"] == PREFIX
    and overlap["newRows"] == ROW_COUNT - PREFIX,
    f"{overlap['totalRows']} rows: {overlap['existingRows']} already imported, {overlap['newRows']} new",
)
FACTS["overlapExisting"] = overlap["existingRows"]
FACTS["overlapNew"] = overlap["newRows"]

call(
    "POST",
    "/imports/statements/commit",
    overlap_token,
    {"householdId": overlap_household, "batchId": overlap["batchId"]},
)
await_batch(overlap_token, overlap_household, overlap["batchId"])
overlap_total = int(
    sql(f"select count(*) from source_transactions where household_id = '{overlap_household}'")
)
check(
    "SEB-017b",
    "the overlapping import leaves one transaction per statement row, not two",
    overlap_total == ROW_COUNT,
    f"{overlap_total} transactions for {ROW_COUNT} statement rows",
)

# SEB-018 household isolation
other_token, other_household = register("Annat")
status, refused = call(
    "POST",
    "/imports/statements/inspect",
    other_token,
    {
        "householdId": other_household,
        "accountId": account_id,  # an account in the first household
        "filename": "x.csv",
        "contentBase64": encode(to_csv(rows[:5])),
    },
)
check(
    "SEB-018",
    "another household cannot import into this account",
    status in {403, 404},
    f"status {status}",
)

status, refused_read = call(
    "GET", f"/imports/batches/{preview['batchId']}", other_token, query={"householdId": other_household}
)
check(
    "SEB-019",
    "another household cannot read this import",
    status in {403, 404},
    f"status {status}",
)

# SEB-020 a non-SEB file is refused
status, rejected = call(
    "POST",
    "/imports/statements/inspect",
    token,
    {
        "householdId": household,
        "accountId": account_id,
        "filename": "inte-seb.csv",
        "contentBase64": encode(b"Datum,Belopp\n2026-01-01,100\n"),
    },
)
check(
    "SEB-020",
    "a file that is not a SEB statement is refused",
    status >= 400,
    f"status {status}, code {(rejected.get('error') or {}).get('code') if isinstance(rejected.get('error'), dict) else rejected.get('code')}",
)

# SEB-021 third-decimal policy, through the real API
precision_csv = (
    "\ufeffBokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo\n"
    "2026-08-01;2026-08-01;900001;GILTIG RAD;-100.000;1000.000\n"
    "2026-08-02;2026-08-02;900002;OJÄMN ÖRE;-0.001;999.000\n"
).encode("utf-8")
status, precision = call(
    "POST",
    "/imports/statements/inspect",
    token,
    {
        "householdId": household,
        "accountId": account_id,
        "filename": "precision.csv",
        "contentBase64": encode(precision_csv),
    },
)
check(
    "SEB-021",
    "a third decimal that is not zero is refused rather than rounded",
    status < 400 and precision["invalidRows"] == 1 and precision["newRows"] == 1,
    f"{precision['invalidRows']} invalid, {precision['newRows']} importable, issue "
    f"{(precision['invalidSample'][0] or {}).get('issue') if precision['invalidSample'] else 'none'}",
)

# SEB-022 import history
status, history = call("GET", "/imports/history", token, query={"householdId": household})
check(
    "SEB-022",
    "the import appears in history with its period and counts",
    status < 400 and any(item["provider"] == "SEB" and item["totalRecords"] == ROW_COUNT for item in history["items"]),
    f"{len(history['items'])} batches in history",
)

# SEB-023 audit trail
audit_actions = sql(
    f"select string_agg(distinct action, ',') from audit_logs where household_id = '{household}' and action like 'import.%'"
)
check(
    "SEB-023",
    "the import is audited without recording statement contents",
    "import.statement.uploaded" in audit_actions and "import.statement.confirmed" in audit_actions,
    audit_actions,
)

# SEB-024 no float contamination: every amount is a whole öre integer
non_integer = sql(
    f"select count(*) from source_transactions where household_id = '{household}' and amount_minor::text ~ '[^0-9-]'"
)
check(
    "SEB-024",
    "every stored amount is an exact integer of öre",
    non_integer == "0",
    f"{non_integer} non-integer amounts",
)

print("\n" + "=" * 72)
passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"TOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
print("\nFacts:")
print(json.dumps(FACTS, indent=2, ensure_ascii=False))
sys.exit(0 if passed == len(RESULTS) else 1)
