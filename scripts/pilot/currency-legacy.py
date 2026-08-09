#!/usr/bin/env python3
"""Legacy foreign-currency accounts must not brick a household (FPA-001).

The door is now shut: `data-robustness.py` proves a EUR account cannot be
created in a SEK household. That leaves the rows created *before* the guard
existed. This probe forges one the only way it can still happen — straight into
the database — and then asks whether the household still works.

It checks the three things the remediation promised:

  1. every aggregate surface answers rather than returning 500,
  2. the totals exclude the account it cannot convert, and say so,
  3. archiving the account is a real remediation: the totals are unchanged and
     the warning goes away.
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
    result = subprocess.run(PG + [statement], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def idem():
    return {"Idempotency-Key": str(uuid.uuid4())}


AGGREGATE_SURFACES = [
    ("Dashboard", "/dashboard"),
    ("Net Worth", "/net-worth"),
    ("Forecast", "/forecast"),
    ("Insights", "/insights"),
    ("Metric Registry", "/metrics/snapshots"),
    ("Debt", "/debt"),
    ("Investments", "/investments"),
]


def surface_failures(token, household):
    failing = []
    for label, path in AGGREGATE_SURFACES:
        status, _ = call("GET", path, token, query={"householdId": household})
        if status != 200:
            failing.append(f"{label} → {status}")
    return failing


def net_worth(token, household):
    _, body = call("GET", "/net-worth", token, query={"householdId": household})
    return body["current"]["amountMinor"]


def main() -> int:
    email = f"legacy-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    _, registered = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "LegacyCurrency123!", "displayName": "Legacy"},
    )
    token = registered["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": "Valutatest"})
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

    baseline_failures = surface_failures(token, hh)
    baseline_nw = net_worth(token, hh) if not baseline_failures else None
    check(
        "LEG-001",
        "a SEK household with a SEK account answers on every aggregate surface",
        not baseline_failures,
        f"net worth {baseline_nw}" if not baseline_failures else str(baseline_failures),
    )

    # The forged row: exactly what an account created before the guard looks like.
    legacy_id = str(uuid.uuid4())
    sql(
        "insert into accounts (id, household_id, name, account_type, currency, "
        "opening_balance_minor, current_balance_minor, is_shared, is_system) values "
        f"('{legacy_id}', '{hh}', 'Gammalt eurokonto', 'CHECKING', 'EUR', "
        "500000, 500000, true, false)"
    )
    exists = sql(f"select count(*) from accounts where id = '{legacy_id}'")
    check(
        "LEG-002",
        "a foreign-currency row from before the guard is present in the database",
        exists == "1",
        f"rows {exists}, currency EUR, household base SEK",
    )

    failures = surface_failures(token, hh)
    check(
        "LEG-003",
        "the household keeps working with that row in place",
        not failures,
        "every aggregate surface answers" if not failures else str(failures),
    )

    after_nw = net_worth(token, hh) if not failures else None
    check(
        "LEG-004",
        "the totals leave out the account they cannot convert rather than guessing a rate",
        after_nw == baseline_nw,
        f"net worth before {baseline_nw}, after {after_nw}",
    )

    _, dashboard = call("GET", "/dashboard", token, query={"householdId": hh})
    warned = dashboard.get("excludedByCurrency") or []
    check(
        "LEG-005",
        "the participant is told which account is missing from the totals",
        len(warned) == 1
        and warned[0]["currency"] == "EUR"
        and warned[0]["archived"] is False,
        json.dumps(warned, ensure_ascii=False),
    )

    status, error_body = call(
        "POST",
        "/accounts",
        token,
        {
            "householdId": hh,
            "name": "Nytt eurokonto",
            "accountType": "SAVINGS",
            "currency": "EUR",
            "openingBalanceMinor": "1000",
        },
        headers=idem(),
    )
    message = json.dumps(error_body, ensure_ascii=False)
    check(
        "LEG-006",
        "creating another one is refused with a domain error, not a server error",
        status == 422 and "UNSUPPORTED_ACCOUNT_CURRENCY" in message,
        f"{status} {message[:160]}",
    )

    archive_status, _ = call("DELETE", f"/accounts/{legacy_id}", token, query={"householdId": hh})
    archived_at = sql(f"select archived_at is not null from accounts where id = '{legacy_id}'")
    check(
        "LEG-007",
        "the participant can archive the offending account through the product",
        archive_status in (200, 204) and archived_at == "t",
        f"DELETE → {archive_status}, archived {archived_at}",
    )

    failures = surface_failures(token, hh)
    check(
        "LEG-008",
        "the household is fully recovered after archiving",
        not failures,
        "every aggregate surface answers" if not failures else str(failures),
    )

    _, dashboard = call("GET", "/dashboard", token, query={"householdId": hh})
    warned = dashboard.get("excludedByCurrency") or []
    check(
        "LEG-009",
        "an archived account no longer warns, because nothing is left to act on",
        warned == [],
        json.dumps(warned, ensure_ascii=False),
    )

    final_nw = net_worth(token, hh)
    check(
        "LEG-010",
        "archiving did not move the household's reported net worth",
        final_nw == baseline_nw,
        f"net worth {final_nw}, baseline {baseline_nw}",
    )

    _, worth = call("GET", "/net-worth", token, query={"householdId": hh})
    history = worth.get("history") or []
    check(
        "LEG-011",
        "the net worth series still resolves and keeps its historical points",
        isinstance(history, list) and len(history) > 0,
        f"points {len(history)}",
    )

    passed = sum(1 for _, ok, _, _ in RESULTS if ok)
    print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
    return 0 if passed == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
