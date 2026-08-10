#!/usr/bin/env python3
"""Independent accounting integrity probe for the final pilot acceptance.

Every previous financial check in this repository — including the oracles added
by the RT2 remediation — verifies net worth by *summing balances by account
type*. That is the same shape of arithmetic the product performs, so a shared
misconception about signs or about which rows belong on the balance sheet would
survive all of them. RT2-001 is exactly what that looks like: five surfaces and
every test agreeing on a wrong number.

This probe therefore derives the same quantities a different way, from the
double-entry identity itself:

    For any single entry, debits equal credits.

    Split the accounts of an entry into balance-sheet accounts (assets and
    liabilities) and nominal accounts (income and expense). For an asset, the
    contribution to net worth changes by (debit - credit). For a liability the
    amount owed changes by (credit - debit), and net worth subtracts what is
    owed, so its contribution *also* changes by (debit - credit). Balance-sheet
    accounts therefore contribute uniformly.

    Since the whole entry sums to zero:

        Δ net worth  =  Σ_balance-sheet (debit - credit)
                     = -Σ_nominal (debit - credit)
                     =  income - expenses

So net worth at a date must equal the opening positions plus every krona of
income minus every krona of expense booked up to that date — with no reference
to account-type bucketing at all. If a liability's sign were wrong anywhere,
this identity breaks; if a posting were dropped, it breaks; if an entry did not
balance, it breaks.

Usage:
    python3 scripts/pilot/accounting-integrity.py
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

LIABILITY_TYPES = ("MORTGAGE", "LOAN", "CREDIT_CARD")
NOMINAL_TYPES = ("EXPENSE", "INCOME")

results = []


def record(rid, name, ok, detail):
    results.append((rid, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {rid} {name}: {detail}", flush=True)


def sql(query):
    out = subprocess.run(
        f'{PSQL} "{query}"', shell=True, capture_output=True, text=True, timeout=180
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return [line for line in out.stdout.strip().splitlines() if line.strip()]


def one(query):
    rows = sql(query)
    return rows[0] if rows else ""


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
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return err.code, {"raw": raw.decode(errors="replace")}


# ------------------------------------------------------- structural integrity
# These hold for every household in the database, not only the demo one.

unbalanced = one(
    "select count(*) from (select e.id, "
    "sum(case when p.side = 'debit' then p.amount_minor else -p.amount_minor end) d "
    "from ledger_entries e join ledger_postings p on p.ledger_entry_id = e.id "
    "group by e.id having sum(case when p.side = 'debit' then p.amount_minor "
    "else -p.amount_minor end) <> 0) x"
)
record(
    "ACC-001",
    "every ledger entry balances: debits equal credits",
    unbalanced == "0",
    f"unbalanced entries {unbalanced}",
)

nonpositive = one("select count(*) from ledger_postings where amount_minor <= 0")
record(
    "ACC-002",
    "no posting carries a non-positive amount",
    nonpositive == "0",
    f"non-positive postings {nonpositive}",
)

single_sided = one(
    "select count(*) from (select ledger_entry_id from ledger_postings "
    "group by ledger_entry_id having count(*) < 2) x"
)
record(
    "ACC-003",
    "no single-sided ledger entry exists",
    single_sided == "0",
    f"entries with fewer than two postings {single_sided}",
)

empty_entries = one(
    "select count(*) from ledger_entries e where not exists "
    "(select 1 from ledger_postings p where p.ledger_entry_id = e.id)"
)
record(
    "ACC-004",
    "no ledger entry exists without postings",
    empty_entries == "0",
    f"empty entries {empty_entries}",
)

currency_drift = one(
    "select count(*) from ledger_postings p join accounts a on a.id = p.account_id "
    "where p.currency <> a.currency"
)
record(
    "ACC-005",
    "every posting matches its account's currency",
    currency_drift == "0",
    f"postings whose currency differs from the account {currency_drift}",
)

cross_household = one(
    "select count(*) from ledger_postings p join accounts a on a.id = p.account_id "
    "where a.household_id <> p.household_id"
)
record(
    "ACC-006",
    "no posting references an account in another household",
    cross_household == "0",
    f"cross-household postings {cross_household}",
)

entry_household_drift = one(
    "select count(*) from ledger_postings p join ledger_entries e "
    "on e.id = p.ledger_entry_id where e.household_id <> p.household_id"
)
record(
    "ACC-007",
    "no posting belongs to an entry in another household",
    entry_household_drift == "0",
    f"mismatched entry households {entry_household_drift}",
)

# Classification integrity: the balance sheet and the nominal ledger must not
# overlap, or "exclude the system accounts" would silently drop real positions.
misclassified = sql(
    "select account_type, is_system, count(*) from accounts group by 1,2 "
    f"having (account_type in {NOMINAL_TYPES} and is_system is not true) "
    f"or (account_type not in {NOMINAL_TYPES} and is_system is true)"
)
record(
    "ACC-008",
    "nominal accounts are system accounts and balance-sheet accounts are not",
    not misclassified,
    f"misclassified groups {misclassified or 'none'}",
)

float_money = sql(
    "select table_name || '.' || column_name from information_schema.columns "
    "where table_schema = 'public' and data_type in ('double precision','real') "
    "and (column_name like '%minor%' or column_name like '%amount%' "
    "or column_name like '%balance%' or column_name like '%price%')"
)
record(
    "ACC-009",
    "no money column is stored as a floating point type",
    not float_money,
    f"float money columns {float_money or 'none'}",
)


# ---------------------------------------- the identity, on every household
# Δ net worth from postings must equal income minus expenses, per household.
rows = sql(
    "select h.id, "
    # balance-sheet movement: (debit - credit), liabilities included with the
    # same sign because net worth subtracts what they owe
    "coalesce(sum(case when a.account_type not in ('EXPENSE','INCOME') then "
    "  (case when p.side = 'debit' then p.amount_minor else -p.amount_minor end) "
    "  else 0 end), 0), "
    # income - expenses, derived from the nominal side only
    "coalesce(sum(case when a.account_type = 'INCOME' then "
    "  (case when p.side = 'credit' then p.amount_minor else -p.amount_minor end) "
    "  when a.account_type = 'EXPENSE' then "
    "  (case when p.side = 'credit' then p.amount_minor else -p.amount_minor end) "
    "  else 0 end), 0) "
    "from households h "
    "left join ledger_postings p on p.household_id = h.id "
    "left join accounts a on a.id = p.account_id "
    "group by h.id order by h.id"
)
identity_breaks = []
for line in rows:
    household_id, balance_move, nominal_move = line.split("|")
    # nominal_move as computed above is (income - expenses) with the sign of a
    # credit; the identity requires it to equal the balance-sheet movement.
    if int(balance_move) != int(nominal_move):
        identity_breaks.append(
            f"{household_id}: balance sheet {balance_move} vs income-expenses {nominal_move}"
        )
record(
    "ACC-010",
    "double-entry identity holds per household: Δ(assets−liabilities) = income − expenses",
    not identity_breaks,
    f"households checked {len(rows)}, breaks {identity_breaks or 'none'}",
)


# --------------------------------------------- the identity against the product
_, login = call(
    "POST", "/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
)
TOKEN = (login.get("tokens") or {}).get("accessToken")
if not TOKEN:
    sys.exit(f"demo login failed: {login}")
_, households = call("GET", "/households", TOKEN)
HH = households[0]["id"]
_, nw = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
AS_OF = nw["asOf"]
product_nw = int(nw["current"]["amountMinor"])

# Opening positions: an asset contributes its opening, a liability subtracts it.
opening = int(
    one(
        "select coalesce(sum(case when account_type in "
        f"{LIABILITY_TYPES} then -coalesce(opening_balance_minor,0) "
        "else coalesce(opening_balance_minor,0) end), 0) from accounts "
        f"where household_id = '{HH}' and is_system is not true"
    )
    or "0"
)

# Income and expense booked up to the reported date, from the nominal ledger only.
flow = int(
    one(
        "select coalesce(sum(case when p.side = 'credit' then p.amount_minor "
        "else -p.amount_minor end), 0) from ledger_postings p "
        "join accounts a on a.id = p.account_id "
        "join ledger_entries e on e.id = p.ledger_entry_id "
        "join financial_events f on f.id = e.financial_event_id "
        f"where p.household_id = '{HH}' and a.account_type in {NOMINAL_TYPES} "
        f"and f.status = 'ACTIVE' and e.booked_on <= '{AS_OF}'"
    )
    or "0"
)

derived_nw = opening + flow
record(
    "ACC-011",
    "product net worth equals opening positions plus income minus expenses",
    derived_nw == product_nw,
    f"asOf {AS_OF} product {product_nw} derived {derived_nw} "
    f"(opening {opening} + flow {flow}) delta {product_nw - derived_nw}",
)


# ------------------------------------------------ the identity month by month
# A single total can be right by cancellation. Each month must hold on its own,
# which also catches date-boundary handling in the history series.
_, history_body = call("GET", "/net-worth", TOKEN, query={"householdId": HH})
history = history_body.get("history") or []
month_breaks = []
previous_value = None
previous_date = None
for point in history:
    date = point["asOf"]
    value = int(point["netWorth"]["amountMinor"])
    if previous_value is not None:
        period_flow = int(
            one(
                "select coalesce(sum(case when p.side = 'credit' then p.amount_minor "
                "else -p.amount_minor end), 0) from ledger_postings p "
                "join accounts a on a.id = p.account_id "
                "join ledger_entries e on e.id = p.ledger_entry_id "
                "join financial_events f on f.id = e.financial_event_id "
                f"where p.household_id = '{HH}' and a.account_type in {NOMINAL_TYPES} "
                f"and f.status = 'ACTIVE' and e.booked_on > '{previous_date}' "
                f"and e.booked_on <= '{date}'"
            )
            or "0"
        )
        if value - previous_value != period_flow:
            month_breaks.append(
                f"{previous_date}→{date}: series moved {value - previous_value}, "
                f"income−expenses {period_flow}"
            )
    previous_value, previous_date = value, date
record(
    "ACC-012",
    "each step of the net worth series equals that period's income minus expenses",
    not month_breaks,
    f"steps checked {max(len(history) - 1, 0)}, breaks {month_breaks or 'none'}",
)


print()
total = len(results)
passed = sum(1 for _, _, ok, _ in results if ok)
print(f"TOTAL {total}  PASS {passed}  FAIL {total - passed}")
for rid, name, ok, detail in results:
    if not ok:
        print(f"  FAILED: {rid} {name} {detail}")
sys.exit(0 if passed == total else 1)
