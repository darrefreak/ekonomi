#!/usr/bin/env python3
"""Clean-room pilot journey: what a real pilot household actually does.

The demo household is seeded with two years of coherent history, so every
previous audit has largely measured the product against data the product itself
produced. A pilot participant arrives with none of that. This probe registers a
new user and walks the whole path from an empty account to a household with
positions, income, spending and a vehicle, checking at each step that the
product is usable and that its arithmetic still closes.

Every financial assertion is verified against positions computed here in
explicit arithmetic from SQL, never against another product surface.

Usage:
    python3 scripts/pilot/pilot-journey.py
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
PSQL = os.environ.get(
    "RT_PSQL", "docker exec ekonomi-postgres-1 psql -U ffos -d ffos_dev -tAc"
)

LIABILITY_TYPES = ("MORTGAGE", "LOAN", "CREDIT_CARD")

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
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return err.code, {"raw": raw.decode(errors="replace")}


def sql(query):
    out = subprocess.run(
        f'{PSQL} "{query}"', shell=True, capture_output=True, text=True, timeout=180
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return [line for line in out.stdout.strip().splitlines() if line.strip()]


def key():
    return {"Idempotency-Key": f"pilot-{uuid.uuid4()}"}


def oracle_net_worth(household_id, as_of):
    """Positions from SQL: opening plus postings, liabilities kept signed."""
    total = 0
    kinds = {}
    for line in sql(
        "select id, account_type, coalesce(opening_balance_minor, 0) from accounts "
        f"where household_id = '{household_id}' and is_system is not true"
    ):
        account_id, account_type, opening = line.split("|")
        kinds[account_id] = account_type
        total += -int(opening) if account_type in LIABILITY_TYPES else int(opening)
    for line in sql(
        "select p.account_id, p.side, p.amount_minor from ledger_postings p "
        "join ledger_entries e on e.id = p.ledger_entry_id "
        "join financial_events f on f.id = e.financial_event_id "
        f"where p.household_id = '{household_id}' and f.status = 'ACTIVE' "
        f"and e.booked_on <= '{as_of}'"
    ):
        account_id, side, amount = line.split("|")
        if account_id not in kinds:
            continue
        total += int(amount) if side == "debit" else -int(amount)
    return total


# ============================================================ arrival
email = f"pilot-{int(time.time())}-{uuid.uuid4().hex[:8]}@example.com"
status, registered = call(
    "POST",
    "/auth/register",
    body={"email": email, "password": "PilotHousehold123!", "displayName": "Pilot"},
)
TOKEN = (registered.get("tokens") or {}).get("accessToken")
record(
    "PILOT-001",
    "a new participant can register",
    status in (200, 201) and bool(TOKEN),
    f"status {status}",
)
if not TOKEN:
    sys.exit("cannot continue without a token")

status, households = call("GET", "/households", TOKEN)
auto_created = bool(households)
record(
    "PILOT-002",
    "registration leaves the participant with a usable household",
    auto_created,
    f"households after register {len(households or [])} "
    f"({'auto-created' if auto_created else 'none — RT-010, the participant must create one'})",
)

if auto_created:
    HH = households[0]["id"]
else:
    _, created = call("POST", "/households", TOKEN, {"name": "Pilothushållet"})
    HH = created["id"]
record(
    "PILOT-003",
    "a household can be created and is immediately addressable",
    bool(HH),
    f"household {HH}",
)


# ============================================ the empty household is usable
# A participant who has just signed up sees these surfaces before entering any
# data. Anything that is not 200 here is a dead end on the very first screen.
EMPTY_SURFACES = [
    "/dashboard",
    "/net-worth",
    "/accounts",
    "/transactions",
    "/cashflow",
    "/budget",
    "/debt",
    "/investments",
    "/assets",
    "/vehicles",
    "/goals",
    "/forecast",
    "/insights",
    "/opportunities",
    "/subscriptions",
    "/contracts",
    "/risk",
    "/documents",
    "/integrations",
    "/imports",
    "/review",
    "/notifications",
    "/settings",
    "/anomalies",
    "/categories",
    "/merchants",
    "/coverage",
    "/scenarios",
    "/audit-logs",
    "/analysis-runs",
    "/vehicle-market",
    "/metrics/snapshots",
    "/reports/monthly",
    "/reports/yearly",
    "/advisor/brief",
    "/ledger/balances",
    "/feature-flags",
    "/privacy/requests",
    "/search",
]
broken = []
for path in EMPTY_SURFACES:
    query = {"householdId": HH}
    if path == "/search":
        query["q"] = "test"
    status, body = call("GET", path, TOKEN, query=query)
    if status != 200:
        code = (body or {}).get("code") or (body or {}).get("message")
        broken.append(f"{path} → {status} {code}")
record(
    "PILOT-004",
    "every product surface answers for a brand-new empty household",
    not broken,
    f"surfaces {len(EMPTY_SURFACES)}, failing {broken or 'none'}",
)

status, dash = call("GET", "/dashboard", TOKEN, query={"householdId": HH})
empty_nw = (
    int(dash["position"]["netWorth"]["amountMinor"])
    if status == 200 and (dash or {}).get("position")
    else None
)
record(
    "PILOT-005",
    "an empty household reports zero rather than a null or an error",
    empty_nw == 0,
    f"net worth on an empty household {empty_nw}",
)


# ================================================= building a real position
def make_account(name, account_type, opening):
    status, body = call(
        "POST",
        "/accounts",
        TOKEN,
        {
            "householdId": HH,
            "name": name,
            "accountType": account_type,
            "currency": "SEK",
            "openingBalanceMinor": str(opening),
        },
        key(),
    )
    return status, body


accounts = {}
creation_failures = []
for name, account_type, opening in [
    ("Lönekonto", "CHECKING", 4_500_00),
    ("Sparkonto", "SAVINGS", 12_000_00),
    ("Fonddepå", "INVESTMENT", 30_000_00),
    ("Kreditkort", "CREDIT_CARD", 2_400_00),
    ("Bolån", "MORTGAGE", 1_850_000_00),
]:
    status, body = make_account(name, account_type, opening)
    if status != 201 or not body.get("id"):
        creation_failures.append(f"{name} → {status} {body}")
    else:
        accounts[account_type] = body["id"]
record(
    "PILOT-006",
    "a participant can open the account types a household actually has",
    not creation_failures,
    f"created {len(accounts)}/5, failures {creation_failures or 'none'}",
)

_, nw = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
AS_OF = nw["asOf"]
product_nw = int(nw["current"]["amountMinor"])
expected = 4_500_00 + 12_000_00 + 30_000_00 - 2_400_00 - 1_850_000_00
record(
    "PILOT-007",
    "opening positions produce the arithmetically correct net worth",
    product_nw == expected == oracle_net_worth(HH, AS_OF),
    f"product {product_nw} expected {expected} oracle {oracle_net_worth(HH, AS_OF)}",
)

# Salary in, rent and groceries out, a card purchase, and a mortgage payment:
# the ordinary month a pilot household will record by hand.
flows = []
status, body = call(
    "POST",
    "/ledger/income",
    TOKEN,
    {
        "householdId": HH,
        "cashAccountId": accounts["CHECKING"],
        "amountMinor": "3200000",
        "occurredOn": AS_OF,
        "description": "Lön",
    },
    key(),
)
flows.append(("income", status))
for amount, description in [("1200000", "Hyra"), ("450000", "Mat")]:
    status, body = call(
        "POST",
        "/ledger/expenses",
        TOKEN,
        {
            "householdId": HH,
            "cashAccountId": accounts["CHECKING"],
            "amountMinor": amount,
            "occurredOn": AS_OF,
            "description": description,
        },
        key(),
    )
    flows.append((description, status))
status, body = call(
    "POST",
    "/ledger/credit-card/purchase",
    TOKEN,
    {
        "householdId": HH,
        "creditCardAccountId": accounts["CREDIT_CARD"],
        "amountMinor": "90000",
        "occurredOn": AS_OF,
        "description": "Kortköp",
    },
    key(),
)
flows.append(("card purchase", status))
status, body = call(
    "POST",
    "/ledger/mortgage/payment",
    TOKEN,
    {
        "householdId": HH,
        "mortgageAccountId": accounts["MORTGAGE"],
        "cashAccountId": accounts["CHECKING"],
        "principalMinor": "500000",
        "interestMinor": "310000",
        "occurredOn": AS_OF,
    },
    key(),
)
flows.append(("mortgage payment", status))
record(
    "PILOT-008",
    "an ordinary month of household activity records without error",
    all(status == 201 for _, status in flows),
    f"{flows}",
)

_, nw = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
product_nw = int(nw["current"]["amountMinor"])
oracle_nw = oracle_net_worth(HH, AS_OF)
# Independent expectation, in öre: opening, plus salary, minus every expense,
# minus the interest. The 5 000 kr of principal moves cash into the mortgage and
# must leave net worth untouched — the property RT2-001 got wrong.
opening_nw = expected
expected = opening_nw + 3_200_000 - 1_200_000 - 450_000 - 90_000 - 310_000
record(
    "PILOT-009",
    "net worth after a month equals opening plus income minus expenses, principal neutral",
    product_nw == expected == oracle_nw,
    f"product {product_nw} expected {expected} oracle {oracle_nw} "
    f"delta {product_nw - expected}",
)

_, debt = call("GET", "/debt", TOKEN, query={"householdId": HH})
mortgage_row = next(
    (row for row in (debt.get("items") or []) if row.get("id") == accounts["MORTGAGE"]),
    None,
)
mortgage_owed = mortgage_row and int(mortgage_row["outstanding"]["amountMinor"])
record(
    "PILOT-010",
    "the principal payment reduced the debt shown to the participant",
    mortgage_owed == 1_850_000_00 - 5_000_00,
    f"mortgage shown {mortgage_owed} expected {1_850_000_00 - 5_000_00}",
)

status, vehicle = call(
    "POST",
    "/vehicles",
    TOKEN,
    {
        "householdId": HH,
        "name": "Familjebilen",
        "make": "Volvo",
        "model": "V60",
        "modelYear": 2020,
        "fuelType": "DIESEL",
        "acquisitionMode": "EXISTING",
        "purchaseType": "CASH",
        "purchaseDate": "2022-04-01",
        "purchasePriceMinor": "22000000",
        "currentValueMinor": "16000000",
    },
    key(),
)
record(
    "PILOT-011",
    "a participant can onboard a vehicle they already own",
    status == 201 and bool(vehicle.get("id")),
    f"status {status} vehicle {vehicle.get('id')}",
)

_, nw = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
product_nw = int(nw["current"]["amountMinor"])
oracle_nw = oracle_net_worth(HH, AS_OF)
expected_with_vehicle = expected + 16_000_000
record(
    "PILOT-012",
    "the vehicle's value lands in net worth and matches the ledger",
    product_nw == oracle_nw == expected_with_vehicle,
    f"product {product_nw} oracle {oracle_nw} expected {expected_with_vehicle}",
)


# ============================================ the surfaces stay coherent
_, dash = call("GET", "/dashboard", TOKEN, query={"householdId": HH})
_, registry = call("GET", "/metrics/snapshots", TOKEN, query={"householdId": HH})
registry_nw = None
for row in registry if isinstance(registry, list) else registry.get("items", []):
    if row.get("metricKey") == "net_worth":
        registry_nw = int(row["money"]["amountMinor"])
surfaces = {
    "dashboard": int(dash["position"]["netWorth"]["amountMinor"]),
    "net-worth": product_nw,
    "registry": registry_nw,
}
record(
    "PILOT-013",
    "every surface reports the independently computed net worth for a real household",
    all(v == oracle_nw for v in surfaces.values() if v is not None),
    f"oracle {oracle_nw} surfaces {surfaces}",
)

populated_broken = []
for path in EMPTY_SURFACES:
    query = {"householdId": HH}
    if path == "/search":
        query["q"] = "Hyra"
    status, body = call("GET", path, TOKEN, query=query)
    if status != 200:
        populated_broken.append(f"{path} → {status}")
record(
    "PILOT-014",
    "every product surface still answers once the household holds real data",
    not populated_broken,
    f"failing {populated_broken or 'none'}",
)


# ============================================================ leaving
status, export = call("POST", "/privacy/export", TOKEN, {"householdId": HH})
record(
    "PILOT-015",
    "a participant can export their own data",
    status in (200, 201, 202),
    f"status {status} keys {sorted((export or {}).keys())[:6]}",
)

REFRESH = (registered.get("tokens") or {}).get("refreshToken")
status, _ = call("POST", "/auth/logout", TOKEN, {})
refresh_status, _ = call("POST", "/auth/refresh", body={"refreshToken": REFRESH})
access_status, _ = call("GET", "/households", TOKEN)
# The architecture is stateless access tokens plus revocable refresh tokens
# (ADR-0003), so logging out must kill the refresh token. The access token
# survives until it expires; that window is measured by the security probe
# rather than asserted away here.
record(
    "PILOT-016",
    "logging out revokes the refresh token so the session cannot be renewed",
    status in (200, 201, 204) and refresh_status == 401,
    f"logout {status}, refresh after logout {refresh_status}, "
    f"access token still accepted for its remaining TTL: {access_status == 200}",
)


print()
total = len(results)
passed = sum(1 for _, _, ok, _ in results if ok)
print(f"TOTAL {total}  PASS {passed}  FAIL {total - passed}")
for rid, name, ok, detail in results:
    if not ok:
        print(f"  FAILED: {rid} {name} {detail}")
sys.exit(0 if passed == total else 1)
