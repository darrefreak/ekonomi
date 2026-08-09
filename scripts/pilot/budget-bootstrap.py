#!/usr/bin/env python3
"""Budget has to be a product workflow, not a seed artefact (FPA-003).

A household built through the product used to get `404 Budget period not found`
from a primary navigation entry, for ever, because only the demo seed inserted a
budget period. This probe builds such a household and walks the whole workflow:
the empty state, creating the first budget, entering amounts, reloading,
retrying the create, seeing it on the dashboard, and crossing into a new month.
"""

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

RESULTS: list[tuple[str, bool, str, str]] = []


def check(ident: str, claim: str, ok: bool, detail: str) -> None:
    RESULTS.append((ident, ok, claim, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {ident} {claim}: {detail}")


def call(method, path, token=None, body=None, query=None, headers=None):
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
        with urllib.request.urlopen(req, timeout=60) as response:
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


def register(name: str):
    email = f"budget-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    _, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "BudgetBootstrap123!", "displayName": name},
    )
    token = body["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": f"Hushåll {name}"})
    return token, household["id"]


token, hh = register("Ett")

# A household built the ordinary way: an account and a month of spending.
_, account = call(
    "POST",
    "/accounts",
    token,
    {
        "householdId": hh,
        "name": "Lönekonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": "5000000",
    },
    headers=idem(),
)
as_of = call("GET", "/dashboard", token, query={"householdId": hh})[1]["asOf"]
call(
    "POST",
    "/ledger/expenses",
    token,
    {
        "householdId": hh,
        "cashAccountId": account["id"],
        "amountMinor": "250000",
        "occurredOn": as_of,
        "description": "Matinköp",
    },
    headers=idem(),
)

# --- The empty state ----------------------------------------------------------

status, empty = call("GET", "/budget", token, query={"householdId": hh})
check(
    "BUD-001",
    "a household with no budget gets a usable answer rather than a dead end",
    status == 200 and empty.get("hasBudget") is False,
    f"GET /budget → {status}, hasBudget {empty.get('hasBudget')}",
)
check(
    "BUD-002",
    "the empty state offers groups to start from",
    len(empty.get("suggestedGroups") or []) >= 5,
    ", ".join(g["name"] for g in (empty.get("suggestedGroups") or [])),
)
check(
    "BUD-003",
    "the empty state carries zeroed totals the surface can render",
    (empty.get("totals") or {}).get("planned", {}).get("amountMinor") == "0"
    and empty.get("period") is None,
    json.dumps(empty.get("totals"), ensure_ascii=False)[:120],
)

# --- Creating the first budget -------------------------------------------------

status, created = call("POST", "/budget", token, {"householdId": hh}, headers=idem())
check(
    "BUD-004",
    "the participant can create a first budget without any seed data",
    status in (200, 201) and created.get("hasBudget") is True,
    f"POST /budget → {status}, period {(created.get('period') or {}).get('label')}",
)
check(
    "BUD-005",
    "the new budget has the suggested groups as lines",
    len(created.get("lines") or []) >= 5,
    ", ".join(line["name"] for line in (created.get("lines") or [])),
)

# --- Entering amounts, and persistence -----------------------------------------

lines = created.get("lines") or []
food = next((line for line in lines if line["name"] == "Mat"), lines[0] if lines else None)
status, updated = call(
    "PATCH",
    f"/budget/lines/{food['id']}",
    token,
    {"householdId": hh, "plannedMinor": "850000"},
)
planned = next(
    (line["planned"]["amountMinor"] for line in updated.get("lines", []) if line["id"] == food["id"]),
    None,
)
check(
    "BUD-006",
    "an exact amount entered against a line is stored to the öre",
    status == 200 and planned == "850000",
    f"planned {planned} (8 500,00 kr)",
)

_, reloaded = call("GET", "/budget", token, query={"householdId": hh})
persisted = next(
    (line["planned"]["amountMinor"] for line in reloaded.get("lines", []) if line["id"] == food["id"]),
    None,
)
check(
    "BUD-007",
    "the budget is still there after a reload",
    reloaded.get("hasBudget") is True and persisted == "850000",
    f"planned after reload {persisted}",
)

actual = next(
    (line["actual"]["amountMinor"] for line in reloaded.get("lines", []) if line["id"] == food["id"]),
    None,
)
check(
    "BUD-008",
    "real spending shows up against the budget rather than a column of zeroes",
    (reloaded.get("totals") or {}).get("actual", {}).get("amountMinor") == "250000",
    f"total actual {(reloaded.get('totals') or {}).get('actual', {}).get('amountMinor')}, food line {actual}",
)

# --- Retrying the create -------------------------------------------------------

periods_before = sql(f"select count(*) from budget_periods where household_id = '{hh}'")
retry_key = idem()
call("POST", "/budget", token, {"householdId": hh}, headers=retry_key)
call("POST", "/budget", token, {"householdId": hh}, headers=retry_key)
call("POST", "/budget", token, {"householdId": hh}, headers=idem())
periods_after = sql(f"select count(*) from budget_periods where household_id = '{hh}'")
check(
    "BUD-009",
    "creating twice, or retrying a create, does not produce a second period",
    periods_before == periods_after,
    f"periods before {periods_before}, after three more create calls {periods_after}",
)

_, after_retry = call("GET", "/budget", token, query={"householdId": hh})
kept = next(
    (line["planned"]["amountMinor"] for line in after_retry.get("lines", []) if line["id"] == food["id"]),
    None,
)
check(
    "BUD-010",
    "a repeated create does not overwrite amounts the participant entered",
    kept == "850000",
    f"planned after retries {kept}",
)

# --- The dashboard --------------------------------------------------------------

_, dashboard = call("GET", "/dashboard", token, query={"householdId": hh})
remaining = (dashboard.get("thisMonth") or {}).get("budgetRemaining")
check(
    "BUD-011",
    "the dashboard reports what is left of the budget",
    isinstance(remaining, dict) and remaining.get("amountMinor") is not None,
    json.dumps(remaining, ensure_ascii=False),
)

# --- Crossing into a new month ---------------------------------------------------

label = (created.get("period") or {}).get("label")
year, month = (int(part) for part in label.split("-"))
next_label = f"{year + 1}-01" if month == 12 else f"{year}-{month + 1:02d}"

_, next_month = call(
    "POST",
    "/budget",
    token,
    {"householdId": hh, "month": next_label},
    headers=idem(),
)

rollover_hh = None
try:
    # A second household proves the lazy rollover path rather than an explicit
    # create: budget in one month, then read in the next.
    roll_token, rollover_hh = register("Två")
    _, roll_created = call("POST", "/budget", roll_token, {"householdId": rollover_hh}, headers=idem())
    roll_label = (roll_created.get("period") or {}).get("label")
    call(
        "PATCH",
        f"/budget/lines/{roll_created['lines'][0]['id']}",
        roll_token,
        {"householdId": rollover_hh, "plannedMinor": "1234500"},
    )
    ry, rm = (int(part) for part in roll_label.split("-"))
    previous_label = f"{ry - 1}-12" if rm == 1 else f"{ry}-{rm - 1:02d}"
    # Relabel the only period into the previous month: the household now looks
    # exactly like one that budgeted last month and has just rolled over.
    sql(
        f"update budget_periods set label = '{previous_label}', "
        f"start_date = '{previous_label}-01', end_date = '{previous_label}-28' "
        f"where household_id = '{rollover_hh}'"
    )
    before = sql(f"select count(*) from budget_periods where household_id = '{rollover_hh}'")
    _, rolled = call("GET", "/budget", roll_token, query={"householdId": rollover_hh})
    after = sql(f"select count(*) from budget_periods where household_id = '{rollover_hh}'")
    labels = sql(
        f"select string_agg(label, ',' order by label) from budget_periods "
        f"where household_id = '{rollover_hh}'"
    )
    check(
        "BUD-012",
        "a budget made last month carries into this one without a database edit",
        rolled.get("hasBudget") is True and after == "2",
        f"periods {before} → {after} ({labels})",
    )
    carried = (rolled.get("lines") or [{}])[0].get("planned", {}).get("amountMinor")
    check(
        "BUD-013",
        "the carried budget keeps last month's amounts as the starting point",
        carried == "1234500",
        f"first line planned {carried}",
    )
    call("GET", "/budget", roll_token, query={"householdId": rollover_hh})
    call("GET", "/budget", roll_token, query={"householdId": rollover_hh})
    repeated = sql(f"select count(*) from budget_periods where household_id = '{rollover_hh}'")
    check(
        "BUD-014",
        "reading the new month repeatedly rolls over once, not once per read",
        repeated == "2",
        f"periods after three reads {repeated}",
    )
except Exception as error:  # noqa: BLE001 - surfaced as a failure
    check("BUD-012", "month transition is defined", False, str(error))

check(
    "BUD-015",
    "a budget can also be created for a named future month",
    next_month.get("hasBudget") is True,
    f"requested {next_label}",
)

# --- Isolation --------------------------------------------------------------------

other_token, other_hh = register("Tre")
status, stolen = call("GET", "/budget", other_token, query={"householdId": hh})
check(
    "BUD-016",
    "another household's budget stays out of reach",
    status in (403, 404),
    f"GET /budget for a household they do not belong to → {status}",
)
status, other_empty = call("GET", "/budget", other_token, query={"householdId": other_hh})
check(
    "BUD-017",
    "a brand-new household is unaffected by the first one's budget",
    status == 200 and other_empty.get("hasBudget") is False,
    f"{status}, hasBudget {other_empty.get('hasBudget')}",
)

passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
sys.exit(0 if passed == len(RESULTS) else 1)
