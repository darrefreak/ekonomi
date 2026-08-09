#!/usr/bin/env python3
"""An erasure request has to actually erase (FPA-004).

The product recorded deletion requests and never acted on them: the row sat at
status `requested` for ever while every account, transaction and document
stayed exactly where it was.

This probe builds a household with something of everything the audit listed —
accounts, ledger entries, a budget, a vehicle, a document with a real object in
storage, a raw import record and a second member — erases it, and then goes
looking for what survived.
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


def register(label: str):
    email = f"erase-{label}-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    _, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "ErasureProbe123!", "displayName": label},
    )
    return body["tokens"]["accessToken"], body["user"]["id"], email


# --- Build a household with something of everything ----------------------------

token, user_id, email = register("owner")
_, household = call("POST", "/households", token, {"name": "Raderingshushåll"})
hh = household["id"]

_, account = call(
    "POST",
    "/accounts",
    token,
    {
        "householdId": hh,
        "name": "Lönekonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": "9000000",
    },
    headers=idem(),
)
as_of = call("GET", "/dashboard", token, query={"householdId": hh})[1]["asOf"]
call(
    "POST",
    "/ledger/income",
    token,
    {
        "householdId": hh,
        "cashAccountId": account["id"],
        "amountMinor": "4200000",
        "occurredOn": as_of,
        "description": "Lön",
    },
    headers=idem(),
)
call(
    "POST",
    "/ledger/expenses",
    token,
    {
        "householdId": hh,
        "cashAccountId": account["id"],
        "amountMinor": "150000",
        "occurredOn": as_of,
        "description": "Känslig utgift",
    },
    headers=idem(),
)
call("POST", "/budget", token, {"householdId": hh}, headers=idem())
call(
    "POST",
    "/vehicles",
    token,
    {
        "householdId": hh,
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
    headers=idem(),
)
doc_status, document = call(
    "POST",
    "/documents/upload",
    token,
    {
        "householdId": hh,
        "title": "Kvitto",
        "filename": "kvitto.txt",
        "contentType": "text/plain",
        "contentBase64": base64.b64encode(
            "personnummer 19900101-1234 och kontonummer".encode()
        ).decode(),
    },
)

second_token, second_user, second_email = register("member")
call(
    "POST",
    "/households/invitations",
    token,
    {"householdId": hh, "email": second_email, "role": "MEMBER"},
)

storage_key = sql(
    f"select coalesce(max(storage_key), '') from documents where household_id = '{hh}'"
)
bucket = sql(f"select coalesce(max(bucket), '') from documents where household_id = '{hh}'")


def household_counts() -> dict[str, int]:
    tables = [
        "accounts",
        "financial_events",
        "ledger_entries",
        "ledger_postings",
        "source_transactions",
        "source_transaction_links",
        "raw_import_records",
        "documents",
        "vehicles",
        "budget_periods",
        "budget_lines",
        "metric_snapshots",
        "household_members",
        "categories",
        "notifications",
    ]
    selects = ", ".join(
        f"(select count(*) from {table} where household_id = '{hh}') as {table}"
        for table in tables
    )
    row = sql(f"select {selects}")
    return dict(zip(tables, (int(v) for v in row.split("|"))))

before = household_counts()
check(
    "ERA-001",
    "the household holds the data an erasure has to reach",
    before["accounts"] >= 1
    and before["ledger_postings"] >= 2
    and before["documents"] >= 1
    and before["vehicles"] >= 1
    and before["budget_periods"] >= 1,
    ", ".join(f"{k} {v}" for k, v in before.items() if v),
)
check(
    "ERA-002",
    "the document was actually stored as an object, not just a row",
    doc_status in (200, 201) and bool(storage_key),
    f"upload → {doc_status}, storage key {'present' if storage_key else 'missing'}",
)

# --- Asking is not doing --------------------------------------------------------

status, request = call(
    "POST",
    "/privacy/delete-request",
    token,
    {"householdId": hh, "kind": "delete_household", "note": "Radera allt"},
)
request_id = request.get("id")
still_there = household_counts()
check(
    "ERA-003",
    "requesting deletion does not erase anything on its own",
    status in (200, 201)
    and request.get("status") == "requested"
    and still_there["accounts"] == before["accounts"],
    f"status {request.get('status')}, accounts still {still_there['accounts']}",
)

wrong_status, wrong_body = call(
    "POST",
    f"/privacy/requests/{request_id}/confirm",
    token,
    {"householdName": "Fel Namn"},
)
check(
    "ERA-004",
    "confirming with the wrong name is refused",
    wrong_status in (400, 422)
    and household_counts()["accounts"] == before["accounts"],
    f"{wrong_status} {json.dumps(wrong_body, ensure_ascii=False)[:120]}",
)

outsider_status, _ = call(
    "POST",
    f"/privacy/requests/{request_id}/confirm",
    second_token,
    {"householdName": "Raderingshushåll"},
)
check(
    "ERA-005",
    "someone who does not own the household cannot confirm its erasure",
    outsider_status in (401, 403, 404)
    and household_counts()["accounts"] == before["accounts"],
    f"outsider confirm → {outsider_status}",
)

# --- Doing -----------------------------------------------------------------------

status, summary = call(
    "POST",
    f"/privacy/requests/{request_id}/confirm",
    token,
    {"householdName": "Raderingshushåll"},
)
check(
    "ERA-006",
    "the owner can execute the erasure by typing the household name",
    status in (200, 201) and summary.get("status") == "completed",
    f"{status}, status {summary.get('status')}, "
    f"{summary.get('objectsRemoved')} objects, "
    f"{sum((summary.get('rowsRemoved') or {}).values())} rows",
)

after = household_counts()
leftovers = {table: count for table, count in after.items() if count > 0}
check(
    "ERA-007",
    "no household-scoped row survives the erasure",
    not leftovers,
    "nothing left" if not leftovers else json.dumps(leftovers),
)

household_row = sql(f"select count(*) from households where id = '{hh}'")
check(
    "ERA-008",
    "the household itself is gone",
    household_row == "0",
    f"households rows {household_row}",
)

status, _ = call("GET", "/dashboard", token, query={"householdId": hh})
check(
    "ERA-009",
    "the household is no longer reachable through the product",
    status in (403, 404),
    f"GET /dashboard → {status}",
)

ai_status, ai_body = call(
    "POST",
    "/ai/chat",
    token,
    {"householdId": hh, "message": "Vad är min nettoförmögenhet?"},
)
check(
    "ERA-010",
    "the assistant cannot reach the erased household either",
    ai_status in (400, 403, 404),
    f"POST /ai/chat → {ai_status}",
)

search_status, search_body = call(
    "GET", "/search", token, query={"householdId": hh, "q": "Känslig"}
)
hits = (search_body or {}).get("items") or (search_body or {}).get("results") or []
check(
    "ERA-011",
    "search finds nothing from the erased household",
    search_status in (400, 403, 404) or len(hits) == 0,
    f"GET /search → {search_status}, hits {len(hits)}",
)

if storage_key:
    exists = subprocess.run(
        [
            "docker",
            "exec",
            "ekonomi-minio-1",
            "sh",
            "-lc",
            f"test -e /data/{bucket}/{storage_key} && echo present || echo gone",
        ],
        capture_output=True,
        text=True,
    ).stdout.strip()
    check(
        "ERA-012",
        "the stored object is removed from object storage, not only its row",
        exists == "gone",
        f"object in {bucket}: {exists}",
    )
else:
    check("ERA-012", "the stored object is removed from object storage", False, "no key")

raw = sql(
    f"select count(*) from raw_import_records where household_id = '{hh}'"
)
links = sql(
    f"select count(*) from source_transaction_links where household_id = '{hh}'"
)
check(
    "ERA-013",
    "raw source copies and their links go too, including the tables nothing cascades from",
    raw == "0" and links == "0",
    f"raw_import_records {raw}, source_transaction_links {links}",
)

orphans = sql(
    f"""select coalesce(string_agg(t || ':' || c, ', '), 'none') from (
      select 'ledger_postings' as t, count(*) as c from ledger_postings lp
        where not exists (select 1 from households h where h.id = lp.household_id)
      union all
      select 'financial_events', count(*) from financial_events fe
        where not exists (select 1 from households h where h.id = fe.household_id)
      union all
      select 'documents', count(*) from documents d
        where not exists (select 1 from households h where h.id = d.household_id)
      union all
      select 'household_members', count(*) from household_members hm
        where not exists (select 1 from households h where h.id = hm.household_id)
      union all
      select 'source_transaction_links', count(*) from source_transaction_links stl
        where not exists (select 1 from households h where h.id = stl.household_id)
    ) x where c > 0"""
)
check(
    "ERA-014",
    "the database is left without orphans pointing at a household that no longer exists",
    orphans == "none",
    orphans,
)

audit_rows = sql(
    f"select count(*) from audit_logs where household_id = '{hh}'"
)
kept = sql(
    "select count(*) from audit_logs where action = 'privacy.erasure_completed' "
    f"and entity_id = '{request_id}'"
)
personal = sql(
    f"""select count(*) from audit_logs
        where "after"::text like '%Känslig%' or "before"::text like '%Känslig%'"""
)
check(
    "ERA-015",
    "the audit keeps a non-personal record that an erasure happened, and nothing more",
    audit_rows == "0" and kept == "1" and personal == "0",
    f"rows still tied to the household {audit_rows}, erasure record {kept}, "
    f"rows quoting the household's data {personal}",
)

request_note = sql(
    f"select coalesce(note, 'null') || '|' || coalesce(household_id::text, 'null') "
    f"from privacy_requests where id = '{request_id}'"
)
check(
    "ERA-016",
    "the request that remains no longer carries the participant's words or a household link",
    request_note == "null|null",
    f"note|household_id = {request_note}",
)

# --- Retrying --------------------------------------------------------------------

retry_status, retry_body = call(
    "POST",
    f"/privacy/requests/{request_id}/confirm",
    token,
    {"householdName": "Raderingshushåll"},
)
check(
    "ERA-017",
    "running the erasure again is safe and resurrects nothing",
    retry_status in (200, 201, 404, 409)
    and sql(f"select count(*) from households where id = '{hh}'") == "0",
    f"second confirm → {retry_status}",
)

# --- Deleting a user ---------------------------------------------------------------

shared_token, shared_user, _ = register("shared")
_, shared_household = call("POST", "/households", shared_token, {"name": "Delat"})
shared_hh = shared_household["id"]
sql(
    "insert into household_members (household_id, user_id, role) "
    f"values ('{shared_hh}', '{second_user}', 'ADULT')"
)
status, body = call("DELETE", "/privacy/me", shared_token)
check(
    "ERA-018",
    "the sole owner of a shared household cannot delete themselves and strand it",
    status == 409 and "SOLE_OWNER" in json.dumps(body),
    f"{status} {json.dumps(body, ensure_ascii=False)[:120]}",
)

sql(f"update household_members set role = 'OWNER' where user_id = '{second_user}' and household_id = '{shared_hh}'")
status, body = call("DELETE", "/privacy/me", shared_token)
survives = sql(f"select count(*) from households where id = '{shared_hh}'")
check(
    "ERA-019",
    "with another owner in place the user can leave and the household survives",
    status in (200, 204) and survives == "1",
    f"{status}, household still there: {survives}",
)

lone_token, lone_user, _ = register("lone")
_, lone_household = call("POST", "/households", lone_token, {"name": "Ensam"})
lone_hh = lone_household["id"]
call(
    "POST",
    "/accounts",
    lone_token,
    {
        "householdId": lone_hh,
        "name": "Sparkonto",
        "accountType": "SAVINGS",
        "currency": "SEK",
        "openingBalanceMinor": "100000",
    },
    headers=idem(),
)
status, body = call("DELETE", "/privacy/me", lone_token)
gone = sql(f"select count(*) from households where id = '{lone_hh}'")
user_gone = sql(f"select count(*) from users where id = '{lone_user}'")
check(
    "ERA-020",
    "a household only that user could reach goes with them rather than being stranded",
    status in (200, 204) and gone == "0" and user_gone == "0",
    f"{status}, household rows {gone}, user rows {user_gone}",
)

# --- Protecting the demo -----------------------------------------------------------

demo_id = sql("select coalesce(max(id::text), '') from households where name = 'Familjen Demo'")
if demo_id:
    demo_owner = sql(
        f"select coalesce(max(user_id::text), '') from household_members "
        f"where household_id = '{demo_id}' and role = 'OWNER'"
    )
    demo_email = sql(f"select email from users where id = '{demo_owner}'")
    _, login = call(
        "POST", "/auth/login", body={"email": demo_email, "password": "demo-password-123"}
    )
    demo_token = (login or {}).get("tokens", {}).get("accessToken")
    if demo_token:
        _, demo_request = call(
            "POST",
            "/privacy/delete-request",
            demo_token,
            {"householdId": demo_id, "kind": "delete_household"},
        )
        status, _ = call(
            "POST",
            f"/privacy/requests/{demo_request['id']}/confirm",
            demo_token,
            {"householdName": "Familjen Demo"},
        )
        still = sql(f"select count(*) from households where id = '{demo_id}'")
        check(
            "ERA-021",
            "the seeded demo cannot be erased by accident outside production",
            status == 403 and still == "1",
            f"confirm → {status}, demo household rows {still}",
        )
    else:
        check(
            "ERA-021",
            "the seeded demo cannot be erased by accident outside production",
            False,
            "could not sign in as the demo owner",
        )

passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
sys.exit(0 if passed == len(RESULTS) else 1)
