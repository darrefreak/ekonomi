#!/usr/bin/env python3
"""Re-run the original V1 Red Team reproductions for the BLOCKER/HIGH findings.

Each check replays the exact reproduction recorded in
`docs/acceptance/V1_RED_TEAM_FINDINGS.md`, so a finding may only be marked
VERIFIED_FIXED when its original repro no longer reproduces.

Usage:
    pnpm db:reset            # optional clean room
    python3 scripts/rt-repro.py

Exits non-zero if any reproduction still fails.
"""

import concurrent.futures
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("RT_API_URL", "http://localhost:3001/api/v1")
DEMO_EMAIL = os.environ.get("RT_DEMO_EMAIL", "demo@ffos.local")
DEMO_PASSWORD = os.environ.get("RT_DEMO_PASSWORD", "demo-password-123")
DEMO_AS_OF = os.environ.get("RT_DEMO_AS_OF", "2026-08-01")

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
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return err.code, {"raw": raw.decode(errors="replace")}


def record(rid, name, ok, detail):
    results.append((rid, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {rid} {name}: {detail}", flush=True)


# ------------------------------------------------------------------ demo login
_, login = call("POST", "/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
DEMO_TOKEN = (login.get("tokens") or {}).get("accessToken")
if not DEMO_TOKEN:
    sys.exit(f"demo login failed: {login}")
_, households = call("GET", "/households", DEMO_TOKEN)
DEMO_HH = households[0]["id"]
_, accounts = call("GET", "/accounts", DEMO_TOKEN, query={"householdId": DEMO_HH})
cash = next(a for a in accounts["items"] if a["accountType"] in ("CHECKING", "SAVINGS", "CASH"))

# ------------------------------------- RT-002 / BLOCKER: duplicate expense repro
key = f"rt-repro-{uuid.uuid4()}"
payload = {
    "householdId": DEMO_HH,
    "cashAccountId": cash["id"],
    "amountMinor": "11100",
    "occurredOn": "2026-07-18",
    "description": "Double tap",
}
status_a, first = call("POST", "/ledger/expenses", DEMO_TOKEN, payload, {"Idempotency-Key": key})
status_b, second = call("POST", "/ledger/expenses", DEMO_TOKEN, payload, {"Idempotency-Key": key})
record(
    "RT-002",
    "identical retry with Idempotency-Key",
    status_a == 201 and status_b == 201 and first.get("id") == second.get("id"),
    f"{status_a}/{status_b} ids {first.get('id')} vs {second.get('id')}",
)

concurrent_key = f"rt-repro-conc-{uuid.uuid4()}"
concurrent_payload = dict(payload, amountMinor="22200", description="Concurrent tap")
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    futures = [
        pool.submit(
            call, "POST", "/ledger/expenses", DEMO_TOKEN, concurrent_payload,
            {"Idempotency-Key": concurrent_key},
        )
        for _ in range(6)
    ]
    settled = [f.result() for f in futures]
distinct = {body.get("id") for status, body in settled if status == 201 and body.get("id")}
record(
    "RT-003",
    "concurrent same-key submissions",
    len(distinct) == 1,
    f"statuses {[s for s, _ in settled]} distinct ids {len(distinct)}",
)

status_c, conflict = call(
    "POST", "/ledger/expenses", DEMO_TOKEN, dict(payload, amountMinor="22200"),
    {"Idempotency-Key": key},
)
code = (conflict.get("error") or {}).get("code") or conflict.get("code")
record(
    "RT-002b",
    "same key + different payload conflicts",
    status_c == 409 and code == "IDEMPOTENCY_CONFLICT",
    f"status {status_c} code {code}",
)

status_d, _ = call("POST", "/ledger/expenses", DEMO_TOKEN, dict(payload, amountMinor="10100"))
record("RT-002c", "expense without any key still succeeds", status_d == 201, f"status {status_d}")

# --------------------------------------------- RT-001 / HIGH: demo asOf pollution
email = f"rt-repro-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
_, registered = call(
    "POST", "/auth/register",
    body={"email": email, "password": "TestPassword123!", "displayName": "RT Repro"},
)
NEW_TOKEN = (registered.get("tokens") or {}).get("accessToken")
_, new_household = call("POST", "/households", NEW_TOKEN, {"name": "RT Repro HH"})
NEW_HH = new_household["id"]

today = datetime.date.today().isoformat()
_, new_dash = call("GET", "/dashboard", NEW_TOKEN, query={"householdId": NEW_HH})
record(
    "RT-001",
    "new household uses the real clock",
    new_dash.get("asOf") == today,
    f"asOf {new_dash.get('asOf')} expected {today}",
)
_, demo_dash = call("GET", "/dashboard", DEMO_TOKEN, query={"householdId": DEMO_HH})
record(
    "RT-001b",
    "demo household keeps its frozen date",
    demo_dash.get("asOf") == DEMO_AS_OF,
    f"asOf {demo_dash.get('asOf')}",
)
_, historical = call(
    "GET", "/dashboard", NEW_TOKEN, query={"householdId": NEW_HH, "asOf": "2026-05-31"},
)
record(
    "RT-001c",
    "explicit historical asOf is honored",
    historical.get("asOf") == "2026-05-31",
    f"asOf {historical.get('asOf')}",
)
# Two households in one process must not contaminate each other's clock.
_, demo_again = call("GET", "/dashboard", DEMO_TOKEN, query={"householdId": DEMO_HH})
_, new_again = call("GET", "/dashboard", NEW_TOKEN, query={"householdId": NEW_HH})
record(
    "RT-001d",
    "interleaved households keep separate clocks",
    demo_again.get("asOf") == DEMO_AS_OF and new_again.get("asOf") == today,
    f"demo {demo_again.get('asOf')} real {new_again.get('asOf')}",
)

# ------------------------------------- RT-004 / HIGH: net worth history duplicate
_, net_worth = call("GET", "/net-worth", DEMO_TOKEN, query={"householdId": DEMO_HH})
history = net_worth.get("history") or []
dates = [point["asOf"] for point in history]
final = history[-1] if history else None
record(
    "RT-004",
    "net worth history has no duplicate/doubled bucket",
    len(dates) == len(set(dates))
    and final is not None
    and final["netWorth"]["amountMinor"] == net_worth["current"]["amountMinor"],
    f"buckets {dates} final {final and final['netWorth']['amountMinor']} "
    f"current {net_worth['current']['amountMinor']}",
)

_, snapshots = call("GET", "/metrics/snapshots", DEMO_TOKEN, query={"householdId": DEMO_HH})
registry_nw = next(
    (i.get("valueMinor") for i in (snapshots.get("items") or []) if i.get("metricKey") == "net_worth"),
    None,
)
record(
    "RT-004b",
    "registry net worth equals net-worth endpoint",
    registry_nw == net_worth["current"]["amountMinor"],
    f"registry {registry_nw} endpoint {net_worth['current']['amountMinor']}",
)

# ----------------------------------------- RT-012 / HIGH: real vehicle create path
vehicle = {
    "householdId": NEW_HH,
    "name": "Repro Golf",
    "make": "VW",
    "model": "Golf",
    "modelYear": 2018,
    "fuelType": "PETROL",
    "currency": "SEK",
    "acquisitionMode": "EXISTING",
    "purchaseType": "FINANCED",
    "purchaseDate": "2022-06-01",
    "purchasePriceMinor": "22000000",
    "currentValueMinor": "16000000",
    "outstandingDebtMinor": "9000000",
    "financeLender": "Testbank",
    "currentOdometerKm": 71000,
}
status_v, created = call("POST", "/vehicles", NEW_TOKEN, vehicle)
record(
    "RT-012",
    "POST /vehicles creates a vehicle",
    status_v in (200, 201) and bool(created.get("id")),
    f"status {status_v} id {created.get('id')}",
)
if created.get("id"):
    _, detail = call("GET", f"/vehicles/{created['id']}", NEW_TOKEN, query={"householdId": NEW_HH})
    equity = detail["metrics"]["netEquity"]["amountMinor"]
    record(
        "RT-012b",
        "onboarded vehicle equity is value - debt - selling cost",
        equity == "6500000",
        f"equity {equity}",
    )
    _, cashflow = call("GET", "/cashflow", NEW_TOKEN, query={"householdId": NEW_HH})
    months = cashflow.get("months") or cashflow.get("items") or []
    spend = sum(
        int(m["spending"]["amountMinor"])
        for m in months
        if isinstance(m, dict) and isinstance(m.get("spending"), dict)
    )
    income = sum(
        int(m["income"]["amountMinor"])
        for m in months
        if isinstance(m, dict) and isinstance(m.get("income"), dict)
    )
    record(
        "RT-012c",
        "onboarding created no current-period income/expense",
        spend == 0 and income == 0,
        f"spend {spend} income {income}",
    )

print()
failed = [r for r in results if not r[2]]
print(f"TOTAL {len(results)}  PASS {len(results) - len(failed)}  FAIL {len(failed)}")
for entry in failed:
    print("  FAILED:", entry[0], entry[1], entry[3])
sys.exit(1 if failed else 0)
