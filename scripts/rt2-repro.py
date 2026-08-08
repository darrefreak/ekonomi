#!/usr/bin/env python3
"""Reproduce the RT2 re-acceptance findings against a running stack.

Each check replays the reproduction recorded in
`docs/acceptance/V1_RED_TEAM_REACCEPTANCE_FINDINGS.md`. Before the remediation
every check FAILS; after it every check must PASS, so the same script is both
the reproduction harness and the verification harness.

Findings covered here (the ones that are observable over HTTP/SQL):

    RT2-001  liability credit balance misstates net worth
    RT2-002  POST /accounts and POST /vehicles ignore Idempotency-Key
    RT2-003  synthetic natural-key externalId refuses a genuinely new command
    RT2-008  duplicate account_balance_snapshots can be persisted

RT2-004 (mobile 404 guard), RT2-005 (test execution) and RT2-006 (db:reset
guard) are reproduced by their own commands; see
`docs/remediation/RT2_CRITICAL_REPRO.md`.

Usage:
    pnpm db:reset                 # optional clean room
    python3 scripts/rt2-repro.py
"""

import concurrent.futures
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("RT_API_URL", "http://localhost:3001/api/v1")
DEMO_EMAIL = os.environ.get("RT_DEMO_EMAIL", "demo@ffos.local")
DEMO_PASSWORD = os.environ.get("RT_DEMO_PASSWORD", "demo-password-123")
PSQL = os.environ.get(
    "RT_PSQL", "docker exec ekonomi-postgres-1 psql -U ffos -d ffos_dev -tAc"
)

results = []


def call(method, path, token=None, body=None, headers=None, query=None):
    url = API + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return err.code, {"raw": raw.decode(errors="replace")}


def sql(query):
    """Authoritative check: read Postgres directly, never a product surface."""
    out = subprocess.run(
        f'{PSQL} "{query}"', shell=True, capture_output=True, text=True, timeout=120
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return out.stdout.strip()


def record(rid, name, ok, detail):
    results.append((rid, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {rid} {name}: {detail}", flush=True)


def register():
    email = f"rt2-{int(time.time())}-{uuid.uuid4().hex[:8]}@example.com"
    _, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "TestPassword123!", "displayName": "RT2"},
    )
    token = (body.get("tokens") or {}).get("accessToken")
    if not token:
        sys.exit(f"register failed: {body}")
    _, hh = call("POST", "/households", token, {"name": f"RT2 {uuid.uuid4().hex[:6]}"})
    return token, hh["id"]


def account(token, household_id, name, account_type, opening="0", key=None):
    status, body = call(
        "POST",
        "/accounts",
        token,
        {
            "householdId": household_id,
            "name": name,
            "accountType": account_type,
            "currency": "SEK",
            "openingBalanceMinor": opening,
        },
        {"Idempotency-Key": key} if key else None,
    )
    return status, body


def net_worth_minor(token, household_id):
    _, body = call("GET", "/net-worth", token, query={"householdId": household_id})
    return int(body["current"]["amountMinor"]), body


# ------------------------------------------------------------------ demo login
_, login = call(
    "POST", "/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
)
DEMO_TOKEN = (login.get("tokens") or {}).get("accessToken")
if not DEMO_TOKEN:
    sys.exit(f"demo login failed: {login}")
_, households = call("GET", "/households", DEMO_TOKEN)
DEMO_HH = households[0]["id"]


# =============================================================== RT2-001 BLOCKER
# A liability holding a credit balance must ADD to net worth, not subtract.
token, hh = register()
_, checking = account(token, hh, "Lönekonto", "CHECKING", "10000000")
_, card = account(token, hh, "Kreditkort", "CREDIT_CARD", "0")

base_nw, _ = net_worth_minor(token, hh)
record(
    "RT2-001a",
    "clean household opening net worth",
    base_nw == 10_000_000,
    f"net worth {base_nw} expected 10000000",
)

# Purchase 1 000 kr on the card: cash unchanged, card owes 100 000 öre.
call(
    "POST",
    "/ledger/credit-card/purchase",
    token,
    {
        "householdId": hh,
        "creditCardAccountId": card["id"],
        "amountMinor": "100000",
        "occurredOn": "2026-08-01",
        "description": "Kortköp",
    },
    {"Idempotency-Key": f"rt2-{uuid.uuid4()}"},
)
after_purchase, _ = net_worth_minor(token, hh)
record(
    "RT2-001b",
    "card purchase reduces net worth by the purchase",
    after_purchase == 9_900_000,
    f"net worth {after_purchase} expected 9900000",
)

# Overpay the card by 2 000 kr: cash -300 000, card balance -200 000 (a credit).
call(
    "POST",
    "/ledger/credit-card/payment",
    token,
    {
        "householdId": hh,
        "cashAccountId": checking["id"],
        "creditCardAccountId": card["id"],
        "amountMinor": "300000",
        "occurredOn": "2026-08-02",
        "description": "Överbetalning",
    },
    {"Idempotency-Key": f"rt2-{uuid.uuid4()}"},
)
card_balance = int(
    sql(f"select current_balance_minor from accounts where id = '{card['id']}'") or "0"
)
after_overpay, nw_body = net_worth_minor(token, hh)
# cash 9 700 000, card credit 200 000 in the household's favour -> 9 900 000.
record(
    "RT2-001c",
    "liability credit balance adds to net worth",
    card_balance == -200_000 and after_overpay == 9_900_000,
    f"card balance {card_balance} net worth {after_overpay} expected 9900000",
)
liability_component = int(nw_body["breakdown"]["liabilities"]["amountMinor"])
record(
    "RT2-001d",
    "net worth breakdown carries the signed liability position",
    liability_component == -200_000,
    f"liabilities component {liability_component} expected -200000",
)
_, debt_view = call("GET", "/debt", token, query={"householdId": hh})
card_row = next(
    (row for row in (debt_view.get("items") or []) if row.get("id") == card["id"]),
    None,
)
outstanding = card_row and int(card_row["outstanding"]["amountMinor"])
record(
    "RT2-001f",
    "debt surface shows nothing owed on a credit balance",
    outstanding == 0,
    f"debt outstanding {outstanding} expected 0",
)

# The same defect on the shipped demo seed, computed independently from positions.
#
# The position is rebuilt here from opening balances plus the postings booked on
# or before the date the surface reports. Reading accounts.current_balance_minor
# instead would be a different question: that column is the position *now*, so
# once anything is booked after the demo freeze (an end-to-end run does exactly
# that) it legitimately disagrees with a frozen asOf, and the oracle would
# accuse the product of a sign bug it does not have.
demo_nw, demo_nw_body = net_worth_minor(DEMO_TOKEN, DEMO_HH)
demo_as_of = demo_nw_body["asOf"]

positions = {}
kinds = {}
for line in sql(
    "select id, account_type, coalesce(opening_balance_minor, 0) from accounts "
    f"where household_id = '{DEMO_HH}' and is_system is not true "
    "and account_type not in ('EXPENSE','INCOME')"
).splitlines():
    if not line.strip():
        continue
    account_id, account_type, opening = line.split("|")
    positions[account_id] = int(opening)
    kinds[account_id] = account_type

for line in sql(
    "select p.account_id, p.side, p.amount_minor from ledger_postings p "
    "join ledger_entries e on e.id = p.ledger_entry_id "
    "join financial_events f on f.id = e.financial_event_id "
    f"where p.household_id = '{DEMO_HH}' and f.status = 'ACTIVE' "
    f"and e.booked_on <= '{demo_as_of}'"
).splitlines():
    if not line.strip():
        continue
    account_id, side, amount = line.split("|")
    if account_id not in positions:
        continue  # system or nominal account, outside the balance sheet
    signed = int(amount) if side == "debit" else -int(amount)
    if kinds[account_id] in ("MORTGAGE", "LOAN", "CREDIT_CARD"):
        # A credit raises what is owed; the result stays signed, which is the
        # whole point of RT2-001.
        signed = -signed
    positions[account_id] += signed

assets = sum(b for a, b in positions.items() if kinds[a] not in ("MORTGAGE", "LOAN", "CREDIT_CARD"))
liabilities = sum(b for a, b in positions.items() if kinds[a] in ("MORTGAGE", "LOAN", "CREDIT_CARD"))
expected_demo_nw = assets - liabilities
record(
    "RT2-001e",
    "demo net worth equals independently computed positions",
    demo_nw == expected_demo_nw,
    f"asOf {demo_as_of} product {demo_nw} independent {expected_demo_nw} "
    f"delta {demo_nw - expected_demo_nw}",
)


# =============================================================== RT2-002 BLOCKER
# Account create: an identical retry must not duplicate the opening position.
acc_key = f"rt2-acc-{uuid.uuid4()}"
payload_account = {
    "householdId": hh,
    "name": "Buffert",
    "accountType": "SAVINGS",
    "currency": "SEK",
    "openingBalanceMinor": "12345600",
}
status_a, first = call(
    "POST", "/accounts", token, payload_account, {"Idempotency-Key": acc_key}
)
status_b, second = call(
    "POST", "/accounts", token, payload_account, {"Idempotency-Key": acc_key}
)
count = int(
    sql(
        f"select count(*) from accounts where household_id = '{hh}' and name = 'Buffert'"
    )
)
record(
    "RT2-002a",
    "account create identical retry yields one account",
    count == 1 and first.get("id") == second.get("id"),
    f"statuses {status_a}/{status_b} rows {count} ids {first.get('id')} vs {second.get('id')}",
)
snapshot_count = int(
    sql(
        "select count(*) from account_balance_snapshots where account_id = "
        f"'{first.get('id')}'"
    )
    or "0"
)
record(
    "RT2-002b",
    "account retry books one opening snapshot",
    snapshot_count == 1,
    f"snapshots {snapshot_count}",
)

status_c, conflict = call(
    "POST",
    "/accounts",
    token,
    dict(payload_account, openingBalanceMinor="99999900"),
    {"Idempotency-Key": acc_key},
)
code = (conflict.get("error") or {}).get("code") or conflict.get("code")
record(
    "RT2-002c",
    "account same key + changed payload conflicts",
    status_c == 409 and code == "IDEMPOTENCY_CONFLICT",
    f"status {status_c} code {code}",
)

conc_key = f"rt2-acc-conc-{uuid.uuid4()}"
conc_payload = dict(payload_account, name="Samtidig", openingBalanceMinor="500000")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    settled = [
        f.result()
        for f in [
            pool.submit(
                call, "POST", "/accounts", token, conc_payload,
                {"Idempotency-Key": conc_key},
            )
            for _ in range(8)
        ]
    ]
conc_count = int(
    sql(
        f"select count(*) from accounts where household_id = '{hh}' and name = 'Samtidig'"
    )
)
record(
    "RT2-002d",
    "account concurrent same-key retry yields one account",
    conc_count == 1,
    f"statuses {[s for s, _ in settled]} rows {conc_count}",
)

# Vehicle create: an identical retry must not duplicate the whole aggregate.
veh_key = f"rt2-veh-{uuid.uuid4()}"
payload_vehicle = {
    "householdId": hh,
    "name": "RT2 Volvo",
    "make": "Volvo",
    "model": "V60",
    "modelYear": 2019,
    "fuelType": "DIESEL",
    "currency": "SEK",
    "acquisitionMode": "EXISTING",
    "purchaseType": "FINANCED",
    "purchaseDate": "2021-03-01",
    "purchasePriceMinor": "28000000",
    "currentValueMinor": "18000000",
    "outstandingDebtMinor": "9000000",
    "financeLender": "Testbank",
    "currentOdometerKm": 82000,
}
nw_before_vehicle, _ = net_worth_minor(token, hh)
status_v1, veh1 = call(
    "POST", "/vehicles", token, payload_vehicle, {"Idempotency-Key": veh_key}
)
status_v2, veh2 = call(
    "POST", "/vehicles", token, payload_vehicle, {"Idempotency-Key": veh_key}
)
veh_count = int(
    sql(
        f"select count(*) from vehicles where household_id = '{hh}' and name = 'RT2 Volvo'"
    )
)
asset_count = int(
    sql(
        f"select count(*) from accounts where household_id = '{hh}' "
        "and name = 'RT2 Volvo (fordon)'"
    )
)
loan_count = int(
    sql(
        f"select count(*) from accounts where household_id = '{hh}' "
        "and name = 'RT2 Volvo (billån)'"
    )
)
record(
    "RT2-002e",
    "vehicle create identical retry yields one aggregate",
    veh_count == 1 and asset_count == 1 and loan_count == 1
    and veh1.get("id") == veh2.get("id"),
    f"statuses {status_v1}/{status_v2} vehicles {veh_count} asset accounts "
    f"{asset_count} loan accounts {loan_count}",
)
nw_after_vehicle, _ = net_worth_minor(token, hh)
record(
    "RT2-002f",
    "vehicle retry does not inflate net worth",
    nw_after_vehicle - nw_before_vehicle == 9_000_000,
    f"delta {nw_after_vehicle - nw_before_vehicle} expected 9000000",
)

status_v3, veh_conflict = call(
    "POST",
    "/vehicles",
    token,
    dict(payload_vehicle, currentValueMinor="25000000"),
    {"Idempotency-Key": veh_key},
)
veh_code = (veh_conflict.get("error") or {}).get("code") or veh_conflict.get("code")
record(
    "RT2-002g",
    "vehicle same key + changed payload conflicts",
    status_v3 == 409 and veh_code == "IDEMPOTENCY_CONFLICT",
    f"status {status_v3} code {veh_code}",
)

# A different key with the same shape is a second real vehicle.
status_v4, veh4 = call(
    "POST",
    "/vehicles",
    token,
    dict(payload_vehicle, name="RT2 Volvo II"),
    {"Idempotency-Key": f"rt2-veh-{uuid.uuid4()}"},
)
record(
    "RT2-002h",
    "different key creates a genuinely new vehicle",
    status_v4 in (200, 201) and veh4.get("id") and veh4.get("id") != veh1.get("id"),
    f"status {status_v4} id {veh4.get('id')}",
)

# Same key across different command types must not collide.
shared_key = f"rt2-shared-{uuid.uuid4()}"
status_s1, _ = account(token, hh, "Delad nyckel", "SAVINGS", "100000", shared_key)
status_s2, shared_vehicle = call(
    "POST",
    "/vehicles",
    token,
    dict(payload_vehicle, name="RT2 Delad"),
    {"Idempotency-Key": shared_key},
)
record(
    "RT2-002i",
    "same key across command types does not collide",
    status_s1 in (200, 201) and status_s2 in (200, 201),
    f"account {status_s1} vehicle {status_s2}",
)


# ================================================================== RT2-003 HIGH
# Two legitimate same-shape commands with different keys must both be recorded.
_, savings = account(token, hh, "Sparkonto RT2-003", "SAVINGS", "0")
transfer = {
    "householdId": hh,
    "fromAccountId": checking["id"],
    "toAccountId": savings["id"],
    "amountMinor": "1000000",
    "occurredOn": "2026-08-03",
    "description": "Till sparkonto",
}
status_t1, t1 = call(
    "POST", "/ledger/transfers/internal", token, transfer,
    {"Idempotency-Key": f"rt2-t1-{uuid.uuid4()}"},
)
status_t2, t2 = call(
    "POST", "/ledger/transfers/internal", token, transfer,
    {"Idempotency-Key": f"rt2-t2-{uuid.uuid4()}"},
)
transfer_events = int(
    sql(
        f"select count(*) from financial_events where household_id = '{hh}' "
        "and description = 'Till sparkonto'"
    )
)
record(
    "RT2-003a",
    "two same-shape transfers with different keys are both recorded",
    status_t1 in (200, 201) and status_t2 in (200, 201) and transfer_events == 2,
    f"statuses {status_t1}/{status_t2} events {transfer_events}",
)

payment = {
    "householdId": hh,
    "cashAccountId": checking["id"],
    "creditCardAccountId": card["id"],
    "amountMinor": "50000",
    "occurredOn": "2026-08-04",
    "description": "Kortbetalning RT2-003",
}
status_p1, _ = call(
    "POST", "/ledger/credit-card/payment", token, payment,
    {"Idempotency-Key": f"rt2-p1-{uuid.uuid4()}"},
)
status_p2, _ = call(
    "POST", "/ledger/credit-card/payment", token, payment,
    {"Idempotency-Key": f"rt2-p2-{uuid.uuid4()}"},
)
payment_events = int(
    sql(
        f"select count(*) from financial_events where household_id = '{hh}' "
        "and description = 'Kortbetalning RT2-003'"
    )
)
record(
    "RT2-003b",
    "two same-shape card payments with different keys are both recorded",
    status_p1 in (200, 201) and status_p2 in (200, 201) and payment_events == 2,
    f"statuses {status_p1}/{status_p2} events {payment_events}",
)

# The retry protection must survive: the same key twice is still one event.
retry_key = f"rt2-retry-{uuid.uuid4()}"
retry = dict(transfer, amountMinor="250000", description="Retry-skydd RT2-003")
call("POST", "/ledger/transfers/internal", token, retry, {"Idempotency-Key": retry_key})
call("POST", "/ledger/transfers/internal", token, retry, {"Idempotency-Key": retry_key})
retry_events = int(
    sql(
        f"select count(*) from financial_events where household_id = '{hh}' "
        "and description = 'Retry-skydd RT2-003'"
    )
)
record(
    "RT2-003c",
    "same key retry still collapses to one event",
    retry_events == 1,
    f"events {retry_events}",
)

# Provider dedup must keep working: an explicit externalId still dedupes.
provider_external = f"bank-{uuid.uuid4()}"
provider = dict(transfer, amountMinor="70000", description="Provider RT2-003",
                externalId=provider_external)
call("POST", "/ledger/transfers/internal", token, provider,
     {"Idempotency-Key": f"rt2-prov1-{uuid.uuid4()}"})
call("POST", "/ledger/transfers/internal", token, provider,
     {"Idempotency-Key": f"rt2-prov2-{uuid.uuid4()}"})
provider_events = int(
    sql(
        f"select count(*) from financial_events where household_id = '{hh}' "
        "and description = 'Provider RT2-003'"
    )
)
record(
    "RT2-003d",
    "explicit provider externalId still dedupes across keys",
    provider_events == 1,
    f"events {provider_events}",
)


# ================================================================== RT2-008 HIGH
# The database must refuse a second snapshot for the same account/instant/source.
snapshot_account = checking["id"]
duplicate_sql = (
    "insert into account_balance_snapshots "
    "(household_id, account_id, reported_balance_minor, available_balance_minor, "
    "ledger_calculated_balance_minor, reconciled_balance_minor, as_of, source) values "
    f"('{hh}', '{snapshot_account}', 1, 1, 1, 1, "
    "'2026-08-09 12:00:00+00', 'rt2_probe')"
)
sql(duplicate_sql)
try:
    sql(duplicate_sql)
    duplicate_rejected = False
    duplicate_detail = "second identical snapshot inserted"
except RuntimeError as err:
    duplicate_rejected = "duplicate key" in str(err) or "23505" in str(err)
    duplicate_detail = "second insert rejected by the database"
record(
    "RT2-008a",
    "duplicate (account, as_of, source) snapshot is rejected",
    duplicate_rejected,
    duplicate_detail,
)

remaining = sql(
    "select count(*) from ("
    "select account_id, as_of, source from account_balance_snapshots "
    "group by 1,2,3 having count(*) > 1) d"
)
record(
    "RT2-008b",
    "no duplicate snapshot groups remain in the database",
    int(remaining) == 0,
    f"duplicate groups {remaining}",
)


print()
failed = [r for r in results if not r[2]]
print(f"TOTAL {len(results)}  PASS {len(results) - len(failed)}  FAIL {len(failed)}")
for entry in failed:
    print("  FAILED:", entry[0], entry[1], entry[3])
sys.exit(1 if failed else 0)
