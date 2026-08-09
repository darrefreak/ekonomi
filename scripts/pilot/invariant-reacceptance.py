#!/usr/bin/env python3
"""Final invariant re-acceptance: attacking the two new guards.

The invariant remediation claims two things:

  1. no ledger posting can exist whose currency is not its account's, and no
     account can hold a currency the household does not count in;
  2. an erasure reports `completed` only after the store that owns each object
     has confirmed the object is gone.

Its own probes test the first claim through income, expenses and transfers, and
the second through a stopped MinIO. This probe goes at the same two claims from
the directions those did not use:

  * every *other* endpoint that writes money — credit card, mortgage,
    investment, depreciation, refund, asset purchase, financed purchase,
    reclassification, vehicle purchase — each aimed at a quarantined account of
    the correct type, so the account-type check cannot be what refuses it;
  * an object whose recorded bucket does not exist, a household holding two
    objects where only one can be removed, and a user deletion during an outage.

Usage:
    python3 scripts/pilot/invariant-reacceptance.py
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
MINIO = "ekonomi-minio-1"
MARKER = "personnummer 19900101-1234"

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


def register(prefix: str):
    email = f"{prefix}-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    _, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "InvariantAudit123!", "displayName": prefix},
    )
    return body["tokens"]["accessToken"], email


def code_of(body) -> str:
    if not isinstance(body, dict):
        return ""
    error = body.get("error")
    if isinstance(error, dict):
        return str(error.get("code") or "")
    return str(body.get("code") or "")


def open_account(token, household, name, account_type, opening="1000000"):
    _, body = call(
        "POST",
        "/accounts",
        token,
        {
            "householdId": household,
            "name": name,
            "accountType": account_type,
            "currency": "SEK",
            "openingBalanceMinor": opening,
        },
        headers=idem(),
    )
    return body["id"]


def forge_account(household, name, account_type, currency="EUR"):
    """A pre-guard row: the household counts in SEK, this account does not."""
    account_id = str(uuid.uuid4())
    sql(
        "insert into accounts (id, household_id, name, account_type, currency, "
        "opening_balance_minor, current_balance_minor, is_shared, is_system) values "
        f"('{account_id}', '{household}', '{name}', '{account_type}', '{currency}', "
        "500000, 500000, true, false)"
    )
    return account_id


def minio_cmd(command: str) -> str:
    return subprocess.run(
        ["docker", "exec", MINIO, "sh", "-lc", command], capture_output=True, text=True
    ).stdout.strip()


def stop_storage():
    subprocess.run(["docker", "stop", MINIO], capture_output=True)


def start_storage():
    subprocess.run(["docker", "start", MINIO], capture_output=True)
    for _ in range(40):
        health = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Health.Status}}", MINIO],
            capture_output=True,
            text=True,
        ).stdout.strip()
        if health == "healthy":
            return
        time.sleep(2)


# =============================================================================
# 1. The ledger guard, through the endpoints its own probes did not use
# =============================================================================

token, _ = register("invaudit")
_, household = call("POST", "/households", token, {"name": "Invariantgranskning"})
hh = household["id"]

cash = open_account(token, hh, "Lönekonto", "CHECKING", "5000000")
card = open_account(token, hh, "Kreditkort", "CREDIT_CARD", "0")
invest = open_account(token, hh, "Depå", "INVESTMENT", "0")

# Quarantined counterparts, each of the type its endpoint expects, so the
# account-type check cannot be what refuses the write.
q_cash = forge_account(hh, "EUR lönekonto", "CHECKING")
q_card = forge_account(hh, "EUR kreditkort", "CREDIT_CARD")
q_mortgage = forge_account(hh, "EUR bolån", "MORTGAGE")
q_invest = forge_account(hh, "EUR depå", "INVESTMENT")
q_asset = forge_account(hh, "EUR tillgång", "ASSET")
q_loan = forge_account(hh, "EUR lån", "LOAN")

before_postings = sql(f"select count(*) from ledger_postings where household_id = '{hh}'")

ATTACKS = [
    (
        "IRA-101",
        "a credit-card purchase on a quarantined card",
        "/ledger/credit-card/purchase",
        {"creditCardAccountId": q_card, "amountMinor": "50000", "description": "Köp"},
    ),
    (
        "IRA-102",
        "a credit-card payment from a quarantined cash account",
        "/ledger/credit-card/payment",
        {
            "cashAccountId": q_cash,
            "creditCardAccountId": card,
            "amountMinor": "50000",
            "description": "Betalning",
        },
    ),
    (
        "IRA-103",
        "a credit-card payment onto a quarantined card",
        "/ledger/credit-card/payment",
        {
            "cashAccountId": cash,
            "creditCardAccountId": q_card,
            "amountMinor": "50000",
            "description": "Betalning",
        },
    ),
    (
        "IRA-104",
        "a mortgage payment against a quarantined mortgage",
        "/ledger/mortgage/payment",
        {
            "cashAccountId": cash,
            "mortgageAccountId": q_mortgage,
            "principalMinor": "40000",
            "interestMinor": "10000",
            "description": "Amortering",
        },
    ),
    (
        "IRA-105",
        "an investment transfer into a quarantined depot",
        "/ledger/investments/transfer",
        {
            "cashAccountId": cash,
            "investmentAccountId": q_invest,
            "amountMinor": "50000",
            "description": "Insättning",
        },
    ),
    (
        "IRA-106",
        "an investment transfer out of a quarantined cash account",
        "/ledger/investments/transfer",
        {
            "cashAccountId": q_cash,
            "investmentAccountId": invest,
            "amountMinor": "50000",
            "description": "Insättning",
        },
    ),
    (
        "IRA-107",
        "a refund into a quarantined cash account",
        "/ledger/refunds",
        {"cashAccountId": q_cash, "amountMinor": "50000", "description": "Återbetalning"},
    ),
    (
        "IRA-108",
        "an asset purchase paid from a quarantined cash account",
        "/ledger/assets/purchase",
        {
            "cashAccountId": q_cash,
            "assetAccountId": invest,
            "amountMinor": "50000",
            "description": "Köp",
        },
    ),
    (
        "IRA-109",
        "an asset purchase into a quarantined asset account",
        "/ledger/assets/purchase",
        {
            "cashAccountId": cash,
            "assetAccountId": q_asset,
            "amountMinor": "50000",
            "description": "Köp",
        },
    ),
    (
        "IRA-110",
        "a financed purchase against a quarantined loan",
        "/ledger/assets/financed-purchase",
        {
            "cashAccountId": cash,
            "assetAccountId": q_asset,
            "loanAccountId": q_loan,
            "purchasePriceMinor": "200000",
            "downPaymentMinor": "50000",
            "description": "Finansierat köp",
        },
    ),
    (
        "IRA-111",
        "depreciation of a quarantined asset",
        "/ledger/assets/depreciation",
        {
            "assetAccountId": q_asset,
            "expenseAccountId": q_asset,
            "amountMinor": "10000",
            "description": "Avskrivning",
        },
    ),
]

for ident, claim, path, payload in ATTACKS:
    status, body = call(
        "POST",
        path,
        token,
        {"householdId": hh, "occurredOn": "2026-08-05", **payload},
        headers=idem(),
    )
    check(
        ident,
        f"{claim} is refused",
        status >= 400,
        f"{path} → {status} {code_of(body)}",
    )

# Reclassification retargets the accounts of an event that already exists, so it
# reaches the second write path — the one that rebuilds postings.
status, event = call(
    "POST",
    "/ledger/expenses",
    token,
    {
        "householdId": hh,
        "cashAccountId": cash,
        "amountMinor": "25000",
        "occurredOn": "2026-08-05",
        "description": "Vanlig utgift",
    },
    headers=idem(),
)
check(
    "IRA-112",
    "an ordinary expense on a good account still books, so the guard is not blanket",
    status in (200, 201),
    f"POST /ledger/expenses → {status}",
)

status, body = call(
    "POST",
    "/ledger/events/revise-classification",
    token,
    {
        "householdId": hh,
        "financialEventId": (event or {}).get("id"),
        "mode": "EXPENSE_TO_TRANSFER",
        "fromAccountId": cash,
        "toAccountId": q_cash,
        "amountMinor": "25000",
        "occurredOn": "2026-08-05",
        "description": "Omklassad till spärrat konto",
    },
    headers=idem(),
)
check(
    "IRA-113",
    "an event cannot be reclassified onto a quarantined account",
    status >= 400,
    f"revise-classification → {status} {code_of(body)}",
)

status, body = call(
    "POST",
    "/vehicles",
    token,
    {
        "householdId": hh,
        "name": "Bil",
        "make": "Volvo",
        "model": "V60",
        "modelYear": 2020,
        "fuelType": "DIESEL",
        "acquisitionMode": "PURCHASE",
        "purchaseType": "CASH",
        "purchaseDate": "2026-08-05",
        "purchasePriceMinor": "100000",
        "currentValueMinor": "100000",
        "cashAccountId": q_cash,
    },
    headers=idem(),
)
check(
    "IRA-114",
    "a vehicle cannot be bought from a quarantined account",
    status >= 400,
    f"POST /vehicles → {status} {code_of(body)}",
)

after_postings = sql(f"select count(*) from ledger_postings where household_id = '{hh}'")
mismatched = sql(
    "select count(*) from ledger_postings lp join accounts a on a.id = lp.account_id "
    f"where lp.household_id = '{hh}' and lp.currency <> a.currency"
)
check(
    "IRA-115",
    "after fourteen attempts not one posting sits in the wrong currency",
    mismatched == "0",
    f"postings {before_postings} → {after_postings}, mismatched {mismatched}",
)

status, _ = call("POST", "/ledger/reconcile", token, {"householdId": hh})
failing = [
    f"{path} → {call('GET', path, token, query={'householdId': hh})[0]}"
    for path in ("/dashboard", "/net-worth", "/insights", "/forecast", "/debt", "/investments")
    if call("GET", path, token, query={"householdId": hh})[0] != 200
]
check(
    "IRA-116",
    "reconciliation and every aggregate still work with six quarantined accounts present",
    status in (200, 201) and not failing,
    f"POST /ledger/reconcile → {status}, failing surfaces: {failing or 'none'}",
)

# =============================================================================
# 2. The household boundary and the migration remediation
# =============================================================================

status, body = call(
    "POST", f"/households/{hh}/base-currency", token, {"baseCurrency": "EUR"}
)
check(
    "IRA-201",
    "the remediation endpoint cannot be used to move a household to an unsupported currency",
    status >= 400,
    f"migrate → EUR → {status} {code_of(body)}",
)

status, body = call(
    "POST", f"/households/{hh}/base-currency", token, {"baseCurrency": "SEK"}
)
check(
    "IRA-202",
    "migrating a household that already counts in SEK changes nothing and does not error",
    status in (200, 201) and (body or {}).get("changed") is False,
    f"migrate → SEK → {status}, changed {(body or {}).get('changed')}",
)

outsider_token, _ = register("invoutsider")
status, body = call(
    "POST", f"/households/{hh}/base-currency", outsider_token, {"baseCurrency": "SEK"}
)
check(
    "IRA-203",
    "a stranger cannot change another household's currency",
    status in (403, 404),
    f"outsider migrate → {status} {code_of(body)}",
)

# A legacy household whose only accounts are archived: migration must not
# quietly re-denominate the money sitting in them.
legacy_token, legacy_email = register("invlegacy")
legacy_user = sql(f"select id from users where email = '{legacy_email}'")
archived_hh = str(uuid.uuid4())
sql(
    "insert into households (id, name, base_currency) values "
    f"('{archived_hh}', 'Arkiverat eurohushall', 'EUR')"
)
sql(
    "insert into household_members (household_id, user_id, role, personal_data_policy) values "
    f"('{archived_hh}', '{legacy_user}', 'OWNER', 'FULL_DETAILS')"
)
archived_account = str(uuid.uuid4())
sql(
    "insert into accounts (id, household_id, name, account_type, currency, "
    "opening_balance_minor, current_balance_minor, is_shared, is_system, archived_at) values "
    f"('{archived_account}', '{archived_hh}', 'Arkiverat eurokonto', 'CHECKING', 'EUR', "
    "10000, 10000, true, false, now())"
)
status, body = call(
    "POST", f"/households/{archived_hh}/base-currency", legacy_token, {"baseCurrency": "SEK"}
)
account_currency = sql(f"select currency from accounts where id = '{archived_account}'")
check(
    "IRA-204",
    "money in an archived account is never re-denominated by a migration",
    account_currency == "EUR",
    f"migrate → {status} {code_of(body)}, archived account still {account_currency}",
)

if status in (200, 201):
    _, worth = call("GET", "/net-worth", legacy_token, query={"householdId": archived_hh})
    check(
        "IRA-205",
        "a migrated household does not absorb the archived foreign balance into its total",
        (worth or {}).get("current", {}).get("amountMinor") == "0",
        f"net worth after migration {(worth or {}).get('current', {}).get('amountMinor')}",
    )
else:
    check(
        "IRA-205",
        "a migrated household does not absorb the archived foreign balance into its total",
        True,
        "migration refused, so nothing could be absorbed",
    )

# =============================================================================
# 3. The erasure confirmation
# =============================================================================


def household_with_documents(name: str, buckets: list[str]):
    doc_token, _ = register("inverase")
    _, created = call("POST", "/households", doc_token, {"name": name})
    household_id = created["id"]
    open_account(doc_token, household_id, "Lönekonto", "CHECKING", "100000")
    keys = []
    for index, bucket in enumerate(buckets):
        if bucket == "real":
            call(
                "POST",
                "/documents/upload",
                doc_token,
                {
                    "householdId": household_id,
                    "title": f"Kvitto {index}",
                    "filename": f"kvitto-{index}.txt",
                    "contentType": "text/plain",
                    "contentBase64": base64.b64encode(MARKER.encode()).decode(),
                },
            )
            row = sql(
                "select storage_key || '|' || bucket from documents "
                f"where household_id = '{household_id}' order by received_at desc limit 1"
            )
            keys.append(tuple(row.split("|")))
        else:
            key = f"households/{household_id}/documents/{uuid.uuid4()}-ghost.txt"
            sql(
                "insert into documents (household_id, title, storage_key, bucket, "
                "content_type, byte_size, checksum_sha256) values "
                f"('{household_id}', 'Spöke {index}', '{key}', '{bucket}', 'text/plain', 10, "
                f"'{'0' * 64}')"
            )
            keys.append((key, bucket))
    return doc_token, household_id, keys


# An object whose recorded bucket does not exist. The store answers 404 — but
# that is the bucket missing, not the object confirmed absent.
ghost_token, ghost_hh, ghost_keys = household_with_documents(
    "Spokhushall", ["bucket-som-inte-finns"]
)
_, ghost_request = call(
    "POST",
    "/privacy/delete-request",
    ghost_token,
    {"householdId": ghost_hh, "kind": "delete_household", "note": "audit"},
)
status, body = call(
    "POST",
    f"/privacy/requests/{ghost_request['id']}/confirm",
    ghost_token,
    {"householdName": "Spokhushall"},
)
check(
    "IRA-301",
    "an object in a bucket that does not exist is not counted as confirmed gone",
    (body or {}).get("status") != "completed",
    f"confirm → {status}, status {(body or {}).get('status')}, "
    f"objectsRemoved {(body or {}).get('objectsRemoved')}, "
    f"household rows {sql(f'select count(*) from households where id = ' + chr(39) + ghost_hh + chr(39))}",
)

# Two objects, one real and one unreachable: the reachable one may go, but the
# erasure must not finish while the other is unaccounted for.
mixed_token, mixed_hh, mixed_keys = household_with_documents(
    "Blandat hushall", ["real", "bucket-som-inte-finns"]
)
real_key, real_bucket = mixed_keys[0]
_, mixed_request = call(
    "POST",
    "/privacy/delete-request",
    mixed_token,
    {"householdId": mixed_hh, "kind": "delete_household", "note": "audit"},
)
status, body = call(
    "POST",
    f"/privacy/requests/{mixed_request['id']}/confirm",
    mixed_token,
    {"householdName": "Blandat hushall"},
)
check(
    "IRA-302",
    "an erasure does not complete while one of two objects is unaccounted for",
    (body or {}).get("status") != "completed"
    and sql(f"select count(*) from households where id = '{mixed_hh}'") == "1",
    f"confirm → {status}, status {(body or {}).get('status')}, "
    f"household rows {sql(f'select count(*) from households where id = ' + chr(39) + mixed_hh + chr(39))}",
)

# Deleting the signed-in user erases the households only they can reach, and it
# uses the same object removal — so it must fail closed the same way.
self_token, self_email = register("invself")
_, self_household = call("POST", "/households", self_token, {"name": "Egen radering"})
self_hh = self_household["id"]
open_account(self_token, self_hh, "Lönekonto", "CHECKING", "100000")
call(
    "POST",
    "/documents/upload",
    self_token,
    {
        "householdId": self_hh,
        "title": "Kvitto",
        "filename": "kvitto.txt",
        "contentType": "text/plain",
        "contentBase64": base64.b64encode(MARKER.encode()).decode(),
    },
)
self_row = sql(
    f"select storage_key || '|' || bucket from documents where household_id = '{self_hh}' limit 1"
)
self_key, self_bucket = self_row.split("|")

stop_storage()
try:
    status, body = call("DELETE", "/privacy/me", self_token)
finally:
    start_storage()

user_rows = sql(f"select count(*) from users where email = '{self_email}'")
check(
    "IRA-303",
    "deleting a user during a storage outage fails closed rather than orphaning their documents",
    status >= 400 and user_rows == "1",
    f"DELETE /privacy/me → {status} {code_of(body)}, user rows {user_rows}",
)
check(
    "IRA-304",
    "the object and its locator survive the failed user deletion",
    minio_cmd(f'test -e "/data/{self_bucket}/{self_key}" && echo present || echo gone') == "present"
    and sql(f"select count(*) from documents where storage_key = '{self_key}'") == "1",
    f"object present, locator rows "
    f"{sql(f'select count(*) from documents where storage_key = ' + chr(39) + self_key + chr(39))}",
)

status, body = call("DELETE", "/privacy/me", self_token)
check(
    "IRA-305",
    "the same deletion succeeds once storage is back, and removes the object",
    status in (200, 201)
    and minio_cmd(f'test -e "/data/{self_bucket}/{self_key}" && echo present || echo gone') == "gone",
    f"retry → {status}, object "
    f"{minio_cmd(f'test -e /data/{self_bucket}/{self_key} && echo present || echo gone')}",
)

# A withdrawn request must stay withdrawn.
cancel_token, cancel_hh, _ = household_with_documents("Avbruten radering", [])
_, cancel_request = call(
    "POST",
    "/privacy/delete-request",
    cancel_token,
    {"householdId": cancel_hh, "kind": "delete_household", "note": "audit"},
)
call("POST", f"/privacy/requests/{cancel_request['id']}/cancel", cancel_token)
status, body = call(
    "POST",
    f"/privacy/requests/{cancel_request['id']}/confirm",
    cancel_token,
    {"householdName": "Avbruten radering"},
)
check(
    "IRA-306",
    "a cancelled erasure cannot be executed afterwards",
    status >= 400 and sql(f"select count(*) from households where id = '{cancel_hh}'") == "1",
    f"confirm after cancel → {status} {code_of(body)}, household rows "
    f"{sql(f'select count(*) from households where id = ' + chr(39) + cancel_hh + chr(39))}",
)

passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
sys.exit(0 if passed == len(RESULTS) else 1)
