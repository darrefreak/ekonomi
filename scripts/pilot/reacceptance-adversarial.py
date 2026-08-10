#!/usr/bin/env python3
"""Final targeted pilot re-acceptance: the attacks the remediation did not run.

The four remediation probes (`currency-legacy.py`, `production-secret.py`,
`budget-bootstrap.py`, `erasure.py`) were written by the same pass that wrote the
fixes, so they test the doors the author thought to close. This probe goes at the
same four claims from angles those probes never used:

  FPA-001  the *household's* base currency, not the account's, and whether an
           excluded account can still receive money.
  FPA-003  concurrency and month gaps rather than sequential retries.
  FPA-004  a non-owner member, simultaneous confirmations, and an erasure that
           runs while object storage is unavailable.

Every check states the claim it is testing, so a FAIL reads as a finding rather
than as a broken script.

Usage:
    python3 scripts/pilot/reacceptance-adversarial.py
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
from concurrent.futures import ThreadPoolExecutor

API = "http://localhost:3001/api/v1"
WEB = "http://localhost:3000"
PG = ["docker", "exec", "ekonomi-postgres-1", "psql", "-U", "ffos", "-d", "ffos_dev", "-tAc"]
MINIO = "ekonomi-minio-1"

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
        with urllib.request.urlopen(req, timeout=120) as response:
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


def register(prefix: str, password: str = "Reacceptance123!"):
    email = f"{prefix}-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    _, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": password, "displayName": prefix},
    )
    return email, body["tokens"]["accessToken"]


SURFACES = ["/dashboard", "/net-worth", "/forecast", "/insights", "/debt", "/investments"]


def failing_surfaces(token, household):
    out = []
    for path in SURFACES:
        status, _ = call("GET", path, token, query={"householdId": household})
        if status != 200:
            out.append(f"{path} → {status}")
    return out


# =============================================================================
# FPA-001 — the household's own currency, and money on an excluded account
# =============================================================================

# The account form no longer offers a currency. The onboarding form still offers
# one for the household, which is the same promise one screen earlier.
onboarding = subprocess.run(
    ["git", "grep", "-n", "option value=", "--", "apps/web/src/components/onboarding/onboarding-page.tsx"],
    capture_output=True,
    text=True,
).stdout
offered = [line.split('value="')[1].split('"')[0] for line in onboarding.splitlines() if 'value="' in line]
unsupported_offered = [code for code in offered if code != "SEK"]
page_status = 0
try:
    with urllib.request.urlopen(f"{WEB}/onboarding", timeout=30) as response:
        page_status = response.status
except Exception:
    page_status = 0
check(
    "RA-101",
    "the product does not offer a household base currency its totals cannot use",
    not unsupported_offered,
    f"/onboarding → {page_status}, currencies offered to a new household: {offered or 'none'}",
)

# Either fix passes this: stop offering the currency, or make the account form
# follow the household it belongs to. What must not stand is offering a base
# currency and then refusing every account in it.
#
# The form submits a fixed "SEK" (accounts-page.tsx never reads the household's
# base currency), so that is what is submitted here.
unusable: list[str] = []
for code in offered or ["SEK"]:
    _, base_token = register("basecur")
    created_status, created = call(
        "POST", "/households", base_token, {"name": f"Hushall {code}", "baseCurrency": code}
    )
    if created_status >= 400:
        continue  # the offer was refused at the API, which is a valid fix
    account_status, _ = call(
        "POST",
        "/accounts",
        base_token,
        {
            "householdId": created["id"],
            "name": "Lönekonto",
            "accountType": "CHECKING",
            "currency": "SEK",
            "openingBalanceMinor": "1000000",
        },
        headers=idem(),
    )
    if account_status not in (200, 201):
        repair_status, _ = call(
            "PATCH",
            "/settings",
            base_token,
            {"householdId": created["id"], "baseCurrency": "SEK"},
        )
        unusable.append(f"{code}: account → {account_status}, repair → {repair_status}")

check(
    "RA-102",
    "every base currency the product offers yields a household that can open an account",
    not unusable,
    f"offered {offered}; unusable: {unusable or 'none'}",
)

# An account the totals exclude is still a full account everywhere else.
_, token = register("excluded")
_, household = call("POST", "/households", token, {"name": "Uteslutet"})
hh = household["id"]
call(
    "POST",
    "/accounts",
    token,
    {
        "householdId": hh,
        "name": "Lönekonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": "4200000",
    },
    headers=idem(),
)
legacy = str(uuid.uuid4())
sql(
    "insert into accounts (id, household_id, name, account_type, currency, "
    "opening_balance_minor, current_balance_minor, is_shared, is_system) values "
    f"('{legacy}', '{hh}', 'Gammalt eurokonto', 'CHECKING', 'EUR', 500000, 500000, true, false)"
)

before_nw = call("GET", "/net-worth", token, query={"householdId": hh})[1]["current"]["amountMinor"]

expense_status, _ = call(
    "POST",
    "/ledger/expenses",
    token,
    {
        "householdId": hh,
        "cashAccountId": legacy,
        "amountMinor": "100000",
        "occurredOn": "2026-08-05",
        "description": "Utgift på uteslutet konto",
    },
    headers=idem(),
)
income_status, _ = call(
    "POST",
    "/ledger/income",
    token,
    {
        "householdId": hh,
        "cashAccountId": legacy,
        "amountMinor": "250000",
        "occurredOn": "2026-08-05",
        "description": "Inkomst på uteslutet konto",
    },
    headers=idem(),
)
check(
    "RA-103",
    "money cannot be booked onto an account the totals refuse to include",
    expense_status >= 400 and income_status >= 400,
    f"expense → {expense_status}, income → {income_status}",
)

mismatched = sql(
    "select count(*) from ledger_postings lp join accounts a on a.id = lp.account_id "
    f"where lp.household_id = '{hh}' and lp.currency <> a.currency"
)
check(
    "RA-104",
    "no posting is written in a currency its account does not hold (the ACC-005 invariant)",
    mismatched == "0",
    f"postings whose currency differs from the account: {mismatched}",
)

after = call("GET", "/net-worth", token, query={"householdId": hh})[1]["current"]["amountMinor"]
_, dash = call("GET", "/dashboard", token, query={"householdId": hh})
month = dash.get("thisMonth") or {}
recognised_income = ((month.get("income") or {}) or {}).get("amountMinor", "0")
flows = sql(
    f"""select
      (select coalesce(sum(case when lp.side = 'credit' then lp.amount_minor else -lp.amount_minor end), 0)
         from ledger_postings lp join accounts a on a.id = lp.account_id
        where lp.household_id = '{hh}' and a.account_type = 'INCOME')
      -
      (select coalesce(sum(case when lp.side = 'debit' then lp.amount_minor else -lp.amount_minor end), 0)
         from ledger_postings lp join accounts a on a.id = lp.account_id
        where lp.household_id = '{hh}' and a.account_type = 'EXPENSE')"""
)
moved = int(after) - int(before_nw)
check(
    "RA-105",
    "net worth moves by the income and expense the product recognises",
    moved == int(flows),
    f"recognised income {recognised_income}, ledger flow {flows} öre, "
    f"net worth moved {moved} öre ({before_nw} → {after})",
)

# The two doors that are genuinely shut, kept as regression cover.
update_status, _ = call(
    "PATCH", f"/accounts/{legacy}", token, {"householdId": hh, "currency": "SEK"}
)
check(
    "RA-106",
    "an account's currency cannot be changed after the fact",
    update_status >= 400,
    f"PATCH /accounts with a currency field → {update_status}",
)

settings_status, _ = call(
    "PATCH", "/settings", token, {"householdId": hh, "baseCurrency": "EUR"}
)
base_now = sql(f"select base_currency from households where id = '{hh}'")
check(
    "RA-107",
    "a household's base currency cannot be switched under its existing accounts",
    settings_status >= 400 and base_now == "SEK",
    f"PATCH /settings baseCurrency=EUR → {settings_status}, base currency still {base_now}",
)

# =============================================================================
# FPA-003 — concurrency and gaps, not sequential retries
# =============================================================================

_, budget_token = register("budgetrace")
_, budget_household = call("POST", "/households", budget_token, {"name": "Budgetrace"})
bhh = budget_household["id"]


def create_budget(_):
    return call(
        "POST",
        "/budget",
        budget_token,
        {"householdId": bhh, "template": "SIMPLE"},
        headers=idem(),
    )[0]


with ThreadPoolExecutor(max_workers=8) as pool:
    create_codes = sorted(pool.map(create_budget, range(8)))
periods = sql(f"select count(*) from budget_periods where household_id = '{bhh}'")
lines = sql(f"select count(*) from budget_lines where household_id = '{bhh}'")
check(
    "RA-301",
    "eight simultaneous first-budget submissions create one budget, not eight",
    periods == "1" and lines == "6",
    f"statuses {create_codes}, periods {periods}, lines {lines}",
)

_, roll_token = register("rollrace")
_, roll_household = call("POST", "/households", roll_token, {"name": "Rullningsrace"})
rhh = roll_household["id"]
call("POST", "/budget", roll_token, {"householdId": rhh, "template": "SIMPLE"}, headers=idem())
sql(
    "update budget_periods set label = '2026-07', start_date = '2026-07-01', "
    f"end_date = '2026-07-31' where household_id = '{rhh}'"
)


def read_budget(_):
    return call("GET", "/budget", roll_token, query={"householdId": rhh})[0]


with ThreadPoolExecutor(max_workers=8) as pool:
    read_codes = sorted(pool.map(read_budget, range(8)))
roll_periods = sql(f"select count(*) from budget_periods where household_id = '{rhh}'")
roll_labels = sql(
    f"select string_agg(label, ',' order by label) from budget_periods where household_id = '{rhh}'"
)
check(
    "RA-302",
    "eight simultaneous reads across a month boundary roll the budget over once",
    roll_periods == "2",
    f"statuses {read_codes}, periods {roll_periods} ({roll_labels})",
)

_, gap_token = register("budgetgap")
_, gap_household = call("POST", "/households", gap_token, {"name": "Gaphushall"})
ghh = gap_household["id"]
call("POST", "/budget", gap_token, {"householdId": ghh, "template": "SIMPLE"}, headers=idem())
sql(
    "update budget_periods set label = '2026-05', start_date = '2026-05-01', "
    f"end_date = '2026-05-31' where household_id = '{ghh}'"
)
gap_status, gap_body = call("GET", "/budget", gap_token, query={"householdId": ghh})
gap_label = ((gap_body or {}).get("period") or {}).get("label")
check(
    "RA-303",
    "a budget last touched three months ago still resolves to this month",
    gap_status == 200 and gap_body.get("hasBudget") is True and gap_label == "2026-08",
    f"GET /budget → {gap_status}, hasBudget {gap_body.get('hasBudget')}, period {gap_label}",
)

_, stranger_token = register("budgetstranger")
stranger_status, _ = call(
    "POST",
    "/budget",
    stranger_token,
    {"householdId": ghh, "template": "SIMPLE"},
    headers=idem(),
)
check(
    "RA-304",
    "a stranger cannot create a budget inside someone else's household",
    stranger_status in (403, 404),
    f"POST /budget into another household → {stranger_status}",
)

# =============================================================================
# FPA-004 — a non-owner, simultaneous confirmations, and a storage outage
# =============================================================================


def household_with_owner_and_member(role: str):
    _, owner_token = register("eraowner")
    _, created = call("POST", "/households", owner_token, {"name": "Rollhushall"})
    household_id = created["id"]
    member_email, member_token = register("eramember")
    member_user = sql(f"select id from users where email = '{member_email}'")
    sql(
        "insert into household_members (household_id, user_id, role, personal_data_policy) "
        f"values ('{household_id}', '{member_user}', '{role}', 'FULL_DETAILS')"
    )
    _, request = call(
        "POST",
        "/privacy/delete-request",
        owner_token,
        {"householdId": household_id, "kind": "delete_household", "note": "re-acceptance"},
    )
    return household_id, owner_token, member_token, request["id"]


for ident, role in (("RA-401", "ADULT"), ("RA-402", "ADMIN")):
    hid, owner_token, member_token, rid = household_with_owner_and_member(role)
    status, body = call(
        "POST", f"/privacy/requests/{rid}/confirm", member_token, {"householdName": "Rollhushall"}
    )
    survived = sql(f"select count(*) from households where id = '{hid}'")
    check(
        ident,
        f"a {role} who is not an owner cannot erase the household",
        status in (401, 403) and survived == "1",
        f"confirm → {status}, household rows {survived}",
    )
    if ident == "RA-402":

        def confirm(_):
            return call(
                "POST",
                f"/privacy/requests/{rid}/confirm",
                owner_token,
                {"householdName": "Rollhushall"},
            )[0]

        with ThreadPoolExecutor(max_workers=6) as pool:
            confirm_codes = sorted(pool.map(confirm, range(6)))
        left = sql(f"select count(*) from households where id = '{hid}'")
        requests = sql(f"select count(*) from privacy_requests where id = '{rid}'")
        state = sql(f"select status from privacy_requests where id = '{rid}'")
        check(
            "RA-403",
            "six simultaneous confirmations erase the household exactly once",
            left == "0" and requests == "1" and state == "completed",
            f"statuses {confirm_codes}, household rows {left}, request {state}",
        )

# The promise that matters most: the object goes, not just its row. Here the
# object store is unavailable at the moment of erasure.
_, outage_token = register("storageoutage")
_, outage_household = call("POST", "/households", outage_token, {"name": "Lagringshushall"})
ohh = outage_household["id"]
call(
    "POST",
    "/documents/upload",
    outage_token,
    {
        "householdId": ohh,
        "title": "Kvitto",
        "filename": "kvitto.txt",
        "contentType": "text/plain",
        "contentBase64": base64.b64encode("personnummer 19900101-1234".encode()).decode(),
    },
)
outage_key = sql(f"select coalesce(max(storage_key), '') from documents where household_id = '{ohh}'")
_, outage_request = call(
    "POST",
    "/privacy/delete-request",
    outage_token,
    {"householdId": ohh, "kind": "delete_household", "note": "re-acceptance"},
)
outage_rid = outage_request["id"]

subprocess.run(["docker", "stop", MINIO], capture_output=True)
try:
    outage_status, outage_summary = call(
        "POST",
        f"/privacy/requests/{outage_rid}/confirm",
        outage_token,
        {"householdName": "Lagringshushall"},
    )
finally:
    subprocess.run(["docker", "start", MINIO], capture_output=True)
    for _ in range(30):
        health = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Health.Status}}", MINIO],
            capture_output=True,
            text=True,
        ).stdout.strip()
        if health == "healthy":
            break
        time.sleep(2)

reported = (outage_summary or {}).get("status")
claimed_objects = (outage_summary or {}).get("objectsRemoved")
rows_left = sql(f"select count(*) from households where id = '{ohh}'")
check(
    "RA-404",
    "an erasure that cannot reach object storage does not report success",
    not (reported == "completed" and rows_left == "0"),
    f"confirm with object storage down → {outage_status}, status {reported}, "
    f"objectsRemoved {claimed_objects}, household rows {rows_left}",
)

survivor = subprocess.run(
    ["docker", "exec", MINIO, "sh", "-lc", f'ls "/data/ffos/{outage_key}" 2>/dev/null | head -1'],
    capture_output=True,
    text=True,
).stdout.strip()
pointer = sql(f"select count(*) from documents where storage_key = '{outage_key}'")
check(
    "RA-405",
    "no stored object outlives the erasure that claimed to have removed it",
    survivor == "",
    f"object in bucket after erasure: {survivor or 'gone'}, "
    f"rows still pointing at it: {pointer}",
)

# Whole-schema orphan sweep, generated rather than a chosen list of tables.
generated = sql(
    """select string_agg(
         format('select %L t, count(*) c from %I x where x.household_id is not null
                 and not exists (select 1 from households h where h.id = x.household_id)',
                table_name, table_name), ' union all ')
       from information_schema.columns
       where table_schema = 'public' and column_name = 'household_id'
         and table_name <> 'households'"""
)
orphans = sql(
    f"select coalesce(string_agg(t || ':' || c, ', '), 'none') from ({generated}) z where c > 0"
)
tables = sql(
    """select count(*) from information_schema.columns
       where table_schema = 'public' and column_name = 'household_id'
         and table_name <> 'households'"""
)
check(
    "RA-406",
    "no table anywhere holds rows pointing at a household that no longer exists",
    orphans == "none",
    f"{tables} household-scoped tables swept, dangling: {orphans}",
)

passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
sys.exit(0 if passed == len(RESULTS) else 1)
