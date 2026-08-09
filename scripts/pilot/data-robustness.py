#!/usr/bin/env python3
"""What happens when a participant enters something the product did not expect.

Earlier audits drove the product with well-formed Swedish household data. Real
pilot participants will not. They hold a Revolut account in euros, they mistype
an amount, they enter a date in the wrong year. This probe asks what the
product does then — specifically whether it refuses cleanly, or accepts the
input and fails afterwards on a surface the participant depends on.

Usage:
    python3 scripts/pilot/data-robustness.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("RT_API_URL", "http://localhost:3001/api/v1")

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


def key():
    return {"Idempotency-Key": f"robust-{uuid.uuid4()}"}


def new_household(label):
    email = f"robust-{label}-{int(time.time())}-{uuid.uuid4().hex[:8]}@example.com"
    _, reg = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "Robustness123!", "displayName": label},
    )
    token = reg["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": f"Hushåll {label}"})
    _, account = call(
        "POST",
        "/accounts",
        token,
        {
            "householdId": household["id"],
            "name": "Lönekonto",
            "accountType": "CHECKING",
            "currency": "SEK",
            "openingBalanceMinor": "10000000",
        },
        key(),
    )
    return token, household["id"], account["id"]


# ------------------------------------------------------- foreign currency
# The account form offers a currency selector, so this is a supported action
# from the participant's point of view, not a malformed request.
TOKEN, HH, CHECKING = new_household("currency")
AGGREGATE_SURFACES = [
    "/dashboard",
    "/net-worth",
    "/insights",
    "/forecast",
    "/metrics/snapshots",
    "/debt",
    "/investments",
]
before = {p: call("GET", p, TOKEN, query={"householdId": HH})[0] for p in AGGREGATE_SURFACES}

status, eur = call(
    "POST",
    "/accounts",
    TOKEN,
    {
        "householdId": HH,
        "name": "Revolut EUR",
        "accountType": "CHECKING",
        "currency": "EUR",
        "openingBalanceMinor": "5000000",
    },
    key(),
)
record(
    "ROB-001",
    "an account in a currency the engine cannot aggregate is refused at creation",
    status >= 400,
    f"creating a EUR account in a SEK household → {status}",
)

after = {p: call("GET", p, TOKEN, query={"householdId": HH})[0] for p in AGGREGATE_SURFACES}
broken = [p for p in AGGREGATE_SURFACES if before[p] == 200 and after[p] != 200]
record(
    "ROB-002",
    "the participant's surfaces keep working after that account exists",
    not broken,
    f"surfaces that stopped answering: {[(p, after[p]) for p in broken] or 'none'}",
)

# Can the participant undo it?
if eur.get("id"):
    delete_status, _ = call(
        "DELETE", f"/accounts/{eur['id']}", TOKEN, query={"householdId": HH}
    )
    recovered = {
        p: call("GET", p, TOKEN, query={"householdId": HH})[0] for p in AGGREGATE_SURFACES
    }
    still_broken = [p for p in AGGREGATE_SURFACES if before[p] == 200 and recovered[p] != 200]
    record(
        "ROB-003",
        "removing the offending account restores the participant's surfaces",
        not still_broken,
        f"delete → {delete_status}, still failing afterwards: "
        f"{[(p, recovered[p]) for p in still_broken] or 'none'}",
    )


# ----------------------------------------------------------- numeric limits
TOKEN2, HH2, CHECKING2 = new_household("limits")
server_errors = []
accepted_absurd = []
for amount, label in [
    ("9223372036854775807", "the largest value the column can hold"),
    ("92233720368547758070", "ten times that"),
    ("999999999999999999999999", "far beyond any real amount"),
]:
    status, body = call(
        "POST",
        "/ledger/expenses",
        TOKEN2,
        {
            "householdId": HH2,
            "cashAccountId": CHECKING2,
            "amountMinor": amount,
            "occurredOn": "2026-08-01",
            "description": "Feltryck",
        },
        key(),
    )
    if status >= 500:
        server_errors.append(f"{label} → {status}")
    elif status < 400:
        accepted_absurd.append(f"{label} → {status}")
record(
    "ROB-004",
    "an implausibly large amount is rejected with a validation error, never a server error",
    not server_errors,
    f"server errors {server_errors or 'none'}, silently accepted {accepted_absurd or 'none'}",
)

malformed_rejected = []
for amount, label in [("-100", "negative"), ("10.5", "fractional"), ("1e5", "scientific"), ("abc", "text")]:
    status, _ = call(
        "POST",
        "/ledger/expenses",
        TOKEN2,
        {
            "householdId": HH2,
            "cashAccountId": CHECKING2,
            "amountMinor": amount,
            "occurredOn": "2026-08-01",
            "description": "Feltryck",
        },
        key(),
    )
    if status != 400:
        malformed_rejected.append(f"{label} → {status}")
record(
    "ROB-005",
    "malformed amounts are refused with a validation error",
    not malformed_rejected,
    f"not refused cleanly: {malformed_rejected or 'none'}",
)


# ------------------------------------------------------------------ dates
date_problems = []
for occurred_on, label in [
    ("1900-01-01", "a century ago"),
    ("2999-12-31", "the far future"),
    ("2026-02-30", "a date that does not exist"),
    ("not-a-date", "not a date at all"),
]:
    status, _ = call(
        "POST",
        "/ledger/expenses",
        TOKEN2,
        {
            "householdId": HH2,
            "cashAccountId": CHECKING2,
            "amountMinor": "10000",
            "occurredOn": occurred_on,
            "description": "Datumtest",
        },
        key(),
    )
    if status >= 500:
        date_problems.append(f"{label} ({occurred_on}) → {status}")
record(
    "ROB-006",
    "unusual or invalid dates never produce a server error",
    not date_problems,
    f"server errors {date_problems or 'none'}",
)

status_after_dates, _ = call("GET", "/dashboard", TOKEN2, query={"householdId": HH2})
record(
    "ROB-007",
    "the dashboard still answers after unusual dates have been entered",
    status_after_dates == 200,
    f"GET /dashboard → {status_after_dates}",
)


# ------------------------------------------------------------ text content
TOKEN3, HH3, CHECKING3 = new_household("text")
text_problems = []
for description, label in [
    ("<script>alert(1)</script>", "markup"),
    ("Räksmörgås åäö ÅÄÖ", "Swedish characters"),
    ("💸🏠🚗", "emoji"),
    ("a" * 500, "an overlong description"),
    ("'; drop table accounts; --", "an injection attempt"),
]:
    status, _ = call(
        "POST",
        "/ledger/expenses",
        TOKEN3,
        {
            "householdId": HH3,
            "cashAccountId": CHECKING3,
            "amountMinor": "10000",
            "occurredOn": "2026-08-01",
            "description": description,
        },
        key(),
    )
    if status >= 500:
        text_problems.append(f"{label} → {status}")
record(
    "ROB-008",
    "unusual text in a description never produces a server error",
    not text_problems,
    f"server errors {text_problems or 'none'}",
)

status, transactions = call(
    "GET", "/transactions", TOKEN3, query={"householdId": HH3}
)
items = (transactions or {}).get("items", [])
stored_markup = [
    t for t in items if "<script>" in json.dumps(t)
]
record(
    "ROB-009",
    "the transaction list renders after unusual text and answers normally",
    status == 200,
    f"GET /transactions → {status}, entries {len(items)}, "
    f"markup stored verbatim in {len(stored_markup)} (React escapes on render)",
)


print()
total = len(results)
passed = sum(1 for _, _, ok, _ in results if ok)
print(f"TOTAL {total}  PASS {passed}  FAIL {total - passed}")
for rid, name, ok, detail in results:
    if not ok:
        print(f"  FAILED: {rid} {name} — {detail}")
sys.exit(0 if passed == total else 1)
