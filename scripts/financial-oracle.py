#!/usr/bin/env python3
"""Independent economic oracle for the running stack.

RT2-001 was invisible to every consistency test in the repository because all
five net worth surfaces read the same aggregation, so they agreed with each
other while all being wrong. This script exists to be the outside opinion:

  * it reads `accounts`, `ledger_postings`, `ledger_entries`, `financial_events`
    and `vehicles` straight out of Postgres;
  * it recomputes positions here, in explicit arithmetic, from the canonical
    sign convention (`packages/financial-engine/src/account-sign.ts`) —
    it never calls `calculateNetWorth`, `bucketBalancesForNetWorth`,
    `getFinancialSnapshot`, the metric registry or any other product code;
  * it then requires every product surface to equal that number.

Surfaces checked for net worth: dashboard, `/net-worth`, the final point of the
`/net-worth` history series, the metric registry snapshot, and the AI advisor's
deterministic `get_net_worth` tool.

Usage:
    python3 scripts/financial-oracle.py
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("RT_API_URL", "http://localhost:3001/api/v1")
DEMO_EMAIL = os.environ.get("RT_DEMO_EMAIL", "demo@ffos.local")
DEMO_PASSWORD = os.environ.get("RT_DEMO_PASSWORD", "demo-password-123")
PSQL = os.environ.get(
    "RT_PSQL", "docker exec ekonomi-postgres-1 psql -U ffos -d ffos_dev -tAc"
)

# The canonical convention, restated here rather than imported, so this file
# cannot inherit a sign bug from the code it audits.
CASH_TYPES = {"CHECKING", "SAVINGS", "CASH"}
INVESTMENT_TYPES = {"INVESTMENT", "PENSION", "CRYPTO"}
ASSET_TYPES = {"ASSET"}
LIABILITY_TYPES = {"MORTGAGE", "LOAN", "CREDIT_CARD"}
NOMINAL_TYPES = {"EXPENSE", "INCOME"}
VEHICLE_SELLING_COST_MINOR = 500_000  # 5 000,00 kr, the product's assumption

results = []


def record(rid, name, ok, detail):
    results.append((rid, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {rid} {name}: {detail}", flush=True)


def call(method, path, token=None, body=None, query=None):
    url = API + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
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
    out = subprocess.run(
        f'{PSQL} "{query}"', shell=True, capture_output=True, text=True, timeout=120
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return [line for line in out.stdout.strip().splitlines() if line.strip()]


# --------------------------------------------------------------------- login
_, login = call(
    "POST", "/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
)
TOKEN = (login.get("tokens") or {}).get("accessToken")
if not TOKEN:
    sys.exit(f"demo login failed: {login}")
_, households = call("GET", "/households", TOKEN)
HH = households[0]["id"]
_, nw_body = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
AS_OF = nw_body["asOf"]


# ---------------------------------------------------------------- the oracle
def oracle_balances(as_of):
    """Balance per account = opening + Σ postings, by the canonical convention.

    Asset and nominal accounts: a debit raises the balance, a credit lowers it.
    Liability accounts: a credit raises what is owed, a debit lowers it, and the
    result is kept signed — a credit balance stays negative rather than being
    turned into debt, which is precisely the RT2-001 mistake.
    """
    balances = {}
    types = {}
    for line in sql(
        "select id, account_type, coalesce(opening_balance_minor, 0) from accounts "
        f"where household_id = '{HH}' and is_system is not true"
    ):
        account_id, account_type, opening = line.split("|")
        balances[account_id] = int(opening)
        types[account_id] = account_type

    for line in sql(
        "select p.account_id, p.side, p.amount_minor from ledger_postings p "
        "join ledger_entries e on e.id = p.ledger_entry_id "
        "join financial_events f on f.id = e.financial_event_id "
        f"where p.household_id = '{HH}' and f.status = 'ACTIVE' "
        f"and e.booked_on <= '{as_of}'"
    ):
        account_id, side, amount = line.split("|")
        if account_id not in balances:
            continue  # system account, excluded from household position
        signed = int(amount) if side == "debit" else -int(amount)
        if types[account_id] in LIABILITY_TYPES:
            signed = -signed
        balances[account_id] += signed
    return balances, types


balances, types = oracle_balances(AS_OF)

cash = sum(b for a, b in balances.items() if types[a] in CASH_TYPES)
investments = sum(b for a, b in balances.items() if types[a] in INVESTMENT_TYPES)
assets = sum(b for a, b in balances.items() if types[a] in ASSET_TYPES)
liabilities = sum(b for a, b in balances.items() if types[a] in LIABILITY_TYPES)
oracle_net_worth = cash + investments + assets - liabilities
# What the household owes is the sum of the positive liability positions; a card
# in credit owes nothing rather than a negative amount.
oracle_debt_owed = sum(
    max(b, 0) for a, b in balances.items() if types[a] in LIABILITY_TYPES
)

unclassified = sorted(
    {
        types[a]
        for a in balances
        if types[a]
        not in CASH_TYPES | INVESTMENT_TYPES | ASSET_TYPES | LIABILITY_TYPES | NOMINAL_TYPES
    }
)
record(
    "ORACLE-000",
    "every account type is classified by the oracle",
    not unclassified,
    f"unclassified types {unclassified or 'none'}",
)
print(
    f"\n  oracle asOf {AS_OF}: cash {cash} investments {investments} assets {assets} "
    f"liabilities(signed) {liabilities} net worth {oracle_net_worth}\n",
    flush=True,
)


# ----------------------------------------------------- five surfaces + oracle
_, dashboard = call("GET", "/dashboard", TOKEN, query={"householdId": HH})
surface_dashboard = int(dashboard["position"]["netWorth"]["amountMinor"])
surface_endpoint = int(nw_body["current"]["amountMinor"])
history = nw_body["history"]
surface_history = int(history[-1]["netWorth"]["amountMinor"])
_, registry = call("GET", "/metrics/snapshots", TOKEN, query={"householdId": HH})
surface_registry = int(
    next(i for i in registry["items"] if i["metricKey"] == "net_worth")["valueMinor"]
)
_, chat = call(
    "POST",
    "/advisor/chat",
    TOKEN,
    {"householdId": HH, "message": "Vad är vår nettoförmögenhet?"},
)
nw_tool = next(t for t in chat["toolTrace"] if t["tool"] == "get_net_worth")
surface_ai = int(nw_tool["data"]["netWorthMinor"])

for rid, label, value in [
    ("ORACLE-001", "dashboard net worth equals the oracle", surface_dashboard),
    ("ORACLE-002", "/net-worth equals the oracle", surface_endpoint),
    ("ORACLE-003", "history final point equals the oracle", surface_history),
    ("ORACLE-004", "metric registry net_worth equals the oracle", surface_registry),
    ("ORACLE-005", "AI get_net_worth equals the oracle", surface_ai),
]:
    record(
        rid,
        label,
        value == oracle_net_worth,
        f"surface {value} oracle {oracle_net_worth} delta {value - oracle_net_worth}",
    )

record(
    "ORACLE-006",
    "available cash equals the oracle",
    int(dashboard["position"]["availableCash"]["amountMinor"]) == cash,
    f"surface {dashboard['position']['availableCash']['amountMinor']} oracle {cash}",
)
record(
    "ORACLE-007",
    "investments total equals the oracle",
    int(nw_body["breakdown"]["investments"]["amountMinor"]) == investments,
    f"surface {nw_body['breakdown']['investments']['amountMinor']} oracle {investments}",
)
record(
    "ORACLE-008",
    "net worth breakdown liabilities carry the signed position",
    int(nw_body["breakdown"]["liabilities"]["amountMinor"]) == liabilities,
    f"surface {nw_body['breakdown']['liabilities']['amountMinor']} oracle {liabilities}",
)

_, debt = call("GET", "/debt", TOKEN, query={"householdId": HH})
debt_total = int(debt["totals"]["outstanding"]["amountMinor"])
rows_owed = sum(int(i["outstanding"]["amountMinor"]) for i in debt["items"])
rows_credit = sum(int(i["credit"]["amountMinor"]) for i in debt["items"])
record(
    "ORACLE-009",
    "debt total is the signed liability position net worth subtracts",
    debt_total == liabilities,
    f"surface {debt_total} oracle {liabilities}",
)
record(
    "ORACLE-009b",
    "per-account owed magnitudes equal the positive liability positions",
    rows_owed == oracle_debt_owed,
    f"rows {rows_owed} oracle {oracle_debt_owed}",
)
record(
    "ORACLE-009c",
    "owed minus credit reconciles the display rows with the economic total",
    rows_owed - rows_credit == debt_total,
    f"owed {rows_owed} - credit {rows_credit} = {rows_owed - rows_credit}, total {debt_total}",
)


# ------------------------------------------------------------ vehicle equity
_, vehicles = call("GET", "/vehicles", TOKEN, query={"householdId": HH})
vehicle_checks = []
for line in sql(
    "select id, coalesce(estimated_value_mid_minor, 0), coalesce(linked_loan_account_id::text, '') "
    f"from vehicles where household_id = '{HH}'"
):
    vehicle_id, value_minor, loan_account = line.split("|")
    debt_minor = max(balances.get(loan_account, 0), 0) if loan_account else 0
    expected_equity = int(value_minor) - debt_minor - VEHICLE_SELLING_COST_MINOR
    item = next((v for v in vehicles["items"] if v["id"] == vehicle_id), None)
    if not item:
        vehicle_checks.append((vehicle_id, "missing from /vehicles", False))
        continue
    actual = int(item["netEquity"]["amountMinor"])
    vehicle_checks.append(
        (
            item["name"],
            f"equity {actual} oracle {expected_equity} (value {value_minor} - debt {debt_minor} - selling cost {VEHICLE_SELLING_COST_MINOR})",
            actual == expected_equity,
        )
    )
record(
    "ORACLE-010",
    "vehicle equity equals value - debt - selling cost",
    bool(vehicle_checks) and all(ok for _, _, ok in vehicle_checks),
    "; ".join(f"{name}: {detail}" for name, detail, _ in vehicle_checks) or "no vehicles",
)


# --------------------------------------------------------- monthly spending
# Independent spending: debits to EXPENSE-class accounts booked in the current
# period, on ACTIVE events whose primary source transaction is not excluded. The
# product reads the denormalised `expense_amount_minor` instead, so this
# compares two genuinely different derivations of the same month. The period is
# the one the product reports, so the two sides are talking about the same month.
_, cashflow = call("GET", "/cashflow", TOKEN, query={"householdId": HH})
month = cashflow["currentPeriod"]["label"]

# `spending` is CASH spending, so the oracle counts only expense postings whose
# event actually moved money out of a cash account or onto a card. Vehicle
# depreciation debits the expense book against an ASSET credit — an economic
# cost, not a payment — and is excluded on that basis rather than by event type.
PAID_FROM = "'CHECKING','SAVINGS','CASH','CREDIT_CARD','LOAN','MORTGAGE'"
paid_in_cash = (
    "  select 1 from ledger_postings pc "
    "  join ledger_entries ec on ec.id = pc.ledger_entry_id "
    "  join accounts ac on ac.id = pc.account_id "
    f"  where ec.financial_event_id = f.id and ac.account_type in ({PAID_FROM})"
)
not_excluded = (
    "  select 1 from source_transaction_links l "
    "  join source_transactions st on st.id = l.source_transaction_id "
    "  where l.financial_event_id = f.id and l.role = 'primary' and st.is_excluded = true"
)
expense_rows = sql(
    "select coalesce(sum(case when p.side = 'debit' then p.amount_minor else -p.amount_minor end), 0) "
    "from ledger_postings p "
    "join ledger_entries e on e.id = p.ledger_entry_id "
    "join financial_events f on f.id = e.financial_event_id "
    "join accounts a on a.id = p.account_id "
    f"where p.household_id = '{HH}' and a.account_type = 'EXPENSE' "
    f"and f.status = 'ACTIVE' and to_char(f.occurred_on, 'YYYY-MM') = '{month}' "
    f"and exists ({paid_in_cash}) "
    f"and not exists ({not_excluded})"
)
oracle_spending = int(expense_rows[0]) if expense_rows else 0
product_spending = int(dashboard["thisMonth"]["spending"]["amountMinor"])
record(
    "ORACLE-011",
    f"monthly cash spending for {month} equals the expense-ledger oracle",
    product_spending == oracle_spending,
    f"surface {product_spending} oracle {oracle_spending} delta {product_spending - oracle_spending}",
)

income_rows = sql(
    "select coalesce(sum(case when p.side = 'credit' then p.amount_minor else -p.amount_minor end), 0) "
    "from ledger_postings p "
    "join ledger_entries e on e.id = p.ledger_entry_id "
    "join financial_events f on f.id = e.financial_event_id "
    "join accounts a on a.id = p.account_id "
    f"where p.household_id = '{HH}' and a.account_type = 'INCOME' "
    f"and f.status = 'ACTIVE' and to_char(f.occurred_on, 'YYYY-MM') = '{month}' "
    f"and not exists ({not_excluded})"
)
oracle_income = int(income_rows[0]) if income_rows else 0
product_income = int(dashboard["thisMonth"]["income"]["amountMinor"])
record(
    "ORACLE-012",
    f"monthly income for {month} equals the income-ledger oracle",
    product_income == oracle_income,
    f"surface {product_income} oracle {oracle_income} delta {product_income - oracle_income}",
)


# ------------------------------------------------------------------- summary
passed = sum(1 for _, _, ok, _ in results if ok)
print(f"\nTOTAL {len(results)}  PASS {passed}  FAIL {len(results) - passed}")
sys.exit(0 if passed == len(results) else 1)
