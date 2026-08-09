#!/usr/bin/env python3
"""Re-test every finding left open by the earlier audits, at pilot severity.

The Medium and Low findings were deferred by instruction during remediation, so
nobody has re-measured them since. A pilot changes what "Medium" means: an edge
case on seeded demo data can be the first screen a real participant sees. This
probe reproduces each one against a household built the way a participant would
build it, and records what actually happens now rather than what was recorded
before.

A PASS here means the symptom is gone. A FAIL means the finding still
reproduces; the pilot report judges each one's impact separately.

Usage:
    python3 scripts/pilot/open-findings.py
"""

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
WEB = os.environ.get("RT_WEB_URL", "http://localhost:3000")
PSQL = os.environ.get(
    "RT_PSQL", "docker exec ekonomi-postgres-1 psql -U ffos -d ffos_dev -tAc"
)

results = []


def record(rid, name, ok, detail):
    results.append((rid, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {rid} {name}: {detail}", flush=True)


def call(method, path, token=None, body=None, headers=None, query=None):
    url = API + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return err.code, {"raw": raw.decode(errors="replace")}


def http_status(url):
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.read().decode(errors="replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(errors="replace")


def sql(query):
    out = subprocess.run(
        f'{PSQL} "{query}"', shell=True, capture_output=True, text=True, timeout=120
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return [line for line in out.stdout.strip().splitlines() if line.strip()]


def key():
    return {"Idempotency-Key": f"open-{uuid.uuid4()}"}


# A household built the way a pilot participant would build one.
email = f"open-{int(time.time())}-{uuid.uuid4().hex[:8]}@example.com"
_, reg = call(
    "POST",
    "/auth/register",
    body={"email": email, "password": "OpenFindings123!", "displayName": "Open"},
)
TOKEN = reg["tokens"]["accessToken"]
_, household = call("POST", "/households", TOKEN, {"name": "Öppna fynd"})
HH = household["id"]
_, checking = call(
    "POST",
    "/accounts",
    TOKEN,
    {
        "householdId": HH,
        "name": "Lönekonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": "100000",
    },
    key(),
)
_, mortgage = call(
    "POST",
    "/accounts",
    TOKEN,
    {
        "householdId": HH,
        "name": "Bolån",
        "accountType": "MORTGAGE",
        "currency": "SEK",
        "openingBalanceMinor": "150000000",
    },
    key(),
)
_, nw = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
AS_OF = nw["asOf"]


# ------------------------------------------------------------------ RT-010
_, fresh = call(
    "POST",
    "/auth/register",
    body={
        "email": f"rt010-{uuid.uuid4().hex[:8]}@example.com",
        "password": "OpenFindings123!",
        "displayName": "Fresh",
    },
)
_, fresh_households = call("GET", "/households", fresh["tokens"]["accessToken"])
record(
    "RT-010",
    "registration leaves the participant with a household",
    bool(fresh_households),
    f"households immediately after register {len(fresh_households or [])}",
)


# ------------------------------------------------------------------ RT-005
status, body = call("GET", "/budget", TOKEN, query={"householdId": HH})
record(
    "RT-005",
    "the Budget surface answers for a household the participant built",
    status == 200,
    f"GET /budget → {status} {(body or {}).get('error', {}).get('message', '')}",
)
# And the reason, which is stronger than the original finding: nothing in the
# product creates a budget period, so this can never resolve on its own.
period_writers = subprocess.run(
    "grep -rl 'insert(budgetPeriods)' apps/api/src --include=*.ts",
    shell=True,
    capture_output=True,
    text=True,
).stdout.split()
non_seed_writers = [p for p in period_writers if "/seed" not in p]
record(
    "RT-005b",
    "a product path exists to create a budget period",
    bool(non_seed_writers),
    f"code paths that create a budget period: {period_writers or 'none'}; "
    f"outside the seed: {non_seed_writers or 'none'}",
)


# ------------------------------------------------------------------ RT-006
status, body = call(
    "POST",
    "/ledger/mortgage/payment",
    TOKEN,
    {
        "householdId": HH,
        "mortgageAccountId": mortgage["id"],
        "cashAccountId": checking["id"],
        "principalMinor": "100000",
        "interestMinor": "0",
        "occurredOn": AS_OF,
    },
    key(),
)
record(
    "RT-006",
    "an interest-free (or fully amortising) mortgage payment is accepted",
    status == 201,
    f"principal-only payment → {status} "
    f"{json.dumps((body or {}).get('error', {}), ensure_ascii=False)[:160]}",
)


# ------------------------------------------------------------------ RT-011
status, body = call(
    "POST",
    "/ledger/expenses",
    TOKEN,
    {
        "householdId": HH,
        "cashAccountId": checking["id"],
        "amountMinor": "5000000000",
        "occurredOn": AS_OF,
        "description": "Felaktig nolla",
    },
    key(),
)
balance = sql(
    f"select current_balance_minor from accounts where id = '{checking['id']}'"
)[0]
record(
    "RT-011",
    "a cash expense far beyond the balance is refused or flagged",
    status >= 400,
    f"50 000 000 kr expense against 1 000 kr cash → {status}, "
    f"resulting balance {balance} öre",
)


# ------------------------------------------------------------------ RT-007
_, cash2 = call(
    "POST",
    "/accounts",
    TOKEN,
    {
        "householdId": HH,
        "name": "Litet konto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": "100000",
    },
    key(),
)
status, body = call(
    "POST",
    "/vehicles",
    TOKEN,
    {
        "householdId": HH,
        "name": "Övertrasseringsbil",
        "make": "Volvo",
        "model": "V90",
        "modelYear": 2023,
        "fuelType": "DIESEL",
        "acquisitionMode": "NEW_PURCHASE",
        "purchaseType": "FINANCED",
        "purchaseDate": AS_OF,
        "purchasePriceMinor": "40000000",
        "currentValueMinor": "40000000",
        "cashAccountId": cash2["id"],
        "downPaymentMinor": "1000000",
        "outstandingDebtMinor": "39000000",
    },
    key(),
)
cash2_balance = sql(
    f"select current_balance_minor from accounts where id = '{cash2['id']}'"
)[0]
record(
    "RT-007",
    "a down payment larger than the cash balance is refused or flagged",
    status >= 400,
    f"10 000 kr down payment on 1 000 kr cash → {status}, "
    f"resulting balance {cash2_balance} öre",
)


# ------------------------------------------------------------------ RT-008
status, balances = call("GET", "/ledger/balances", TOKEN, query={"householdId": HH})
rows = (balances or {}).get("accounts") or (balances or {}).get("items") or []
mismatched = [
    r
    for r in rows
    if (r.get("reconciliation") or {}).get("status") == "MISMATCH"
    or r.get("status") == "MISMATCH"
]
record(
    "RT-008",
    "manually maintained accounts do not report a permanent reconciliation mismatch",
    not mismatched,
    f"accounts {len(rows)}, reporting MISMATCH {len(mismatched)}",
)


# ------------------------------------------------------------------ RT-009
_, spend = call(
    "POST",
    "/ledger/expenses",
    TOKEN,
    {
        "householdId": HH,
        "cashAccountId": checking["id"],
        "amountMinor": "50000",
        "occurredOn": AS_OF,
        "description": "Delad utgift",
    },
    key(),
)
event_id = (spend or {}).get("id") or (spend or {}).get("eventId")
splits_visible = None
if event_id:
    _, categories = call("GET", "/categories", TOKEN, query={"householdId": HH})
    rows = (categories or {}).get("items", categories if isinstance(categories, list) else [])
    cat_ids = [c["id"] for c in rows if c.get("kind") == "expense"][:2]
    if len(cat_ids) >= 2:
        status_split, _ = call(
            "POST",
            f"/ledger/events/{event_id}/splits",
            TOKEN,
            {
                "householdId": HH,
                "splits": [
                    {"categoryId": cat_ids[0], "amountMinor": "30000"},
                    {"categoryId": cat_ids[1], "amountMinor": "20000"},
                ],
            },
            key(),
        )
        _, detail = call("GET", f"/transactions/{event_id}", TOKEN)
        splits_visible = "splits" in (detail or {}) and bool(detail.get("splits"))
record(
    "RT-009",
    "a split is visible on the transaction detail that the participant opens",
    bool(splits_visible),
    f"transaction detail exposes splits: {splits_visible}",
)


# ------------------------------------------------------------------ RT-013
_, opportunities = call("GET", "/opportunities", TOKEN, query={"householdId": HH})
items = (opportunities or {}).get("items") or (
    opportunities if isinstance(opportunities, list) else []
)
absurd = []
for item in items:
    blob = json.dumps(item)
    for field in ("estimatedAnnualSavingMinor", "savingMinor", "impactMinor"):
        value = item.get(field)
        if value is not None and abs(int(value)) > 100_000_00 * 100:
            absurd.append(f"{item.get('type')}: {field}={value}")
    if "%" in blob:
        for token in blob.split():
            if token.rstrip('",').endswith("%"):
                try:
                    if abs(float(token.rstrip('",%'))) > 1000:
                        absurd.append(f"{item.get('type')}: {token}")
                except ValueError:
                    pass
record(
    "RT-013",
    "the opportunity engine produces no absurd figures on a thin household",
    not absurd,
    f"opportunities {len(items)}, implausible {absurd or 'none'}",
)


# ------------------------------------------------------------------ RT-014
status, _ = http_status(f"{WEB}/dashboard")
record(
    "RT-014",
    "/dashboard resolves rather than returning not-found",
    status == 200,
    f"GET {WEB}/dashboard → {status}",
)


# ----------------------------------------------------------------- RT2-010
status, html = http_status(f"{WEB}/definitely-not-a-route")
english_default = "This page could not be found" in html
record(
    "RT2-010",
    "the not-found page is localised for a Swedish product",
    not english_default,
    f"status {status}, framework English default present {english_default}",
)


# ----------------------------------------------------------------- RT-015
# Only real tooling counts: a file that merely mentions pg_dump (such as this
# probe) is not a restore path.
restore_tooling = subprocess.run(
    "grep -rl --exclude-dir=pilot -E 'pg_dump|pg_restore' "
    "scripts/ infrastructure/ package.json 2>/dev/null",
    shell=True,
    capture_output=True,
    text=True,
).stdout.split()
record(
    "RT-015",
    "backup and restore tooling exists and can be exercised",
    bool(restore_tooling),
    f"backup/restore tooling found: {restore_tooling or 'none — documentation only'}",
)


print()
total = len(results)
passed = sum(1 for _, _, ok, _ in results if ok)
print(f"TOTAL {total}  PASS {passed}  FAIL {total - passed}")
for rid, name, ok, detail in results:
    if not ok:
        print(f"  STILL PRESENT: {rid} {name} — {detail}")
sys.exit(0 if passed == total else 1)
