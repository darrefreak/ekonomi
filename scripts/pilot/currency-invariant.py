#!/usr/bin/env python3
"""One financial currency per household, tested through the API rather than the UI.

The adversarial matrix from the remediation brief. Every case is driven by
direct HTTP calls, because the previous fix was a change to one form and the
product went on accepting the same state one screen earlier (FPR-001), and went
on booking money onto an account no total would include (FPR-002).

The legacy rows these cases need cannot be created through the product any more,
which is the point, so they are forged straight into the database exactly as a
row created before the guard would look.

Usage:
    python3 scripts/pilot/currency-invariant.py
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
        with urllib.request.urlopen(req, timeout=90) as response:
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
        body={"email": email, "password": "CurrencyInvariant123!", "displayName": prefix},
    )
    return body["tokens"]["accessToken"]


def code_of(body) -> str:
    if not isinstance(body, dict):
        return ""
    error = body.get("error")
    if isinstance(error, dict):
        return str(error.get("code") or "")
    return str(body.get("code") or "")


SURFACES = [
    ("Dashboard", "/dashboard"),
    ("Net Worth", "/net-worth"),
    ("Forecast", "/forecast"),
    ("Insights", "/insights"),
    ("Metric Registry", "/metrics/snapshots"),
    ("Debt", "/debt"),
    ("Investments", "/investments"),
]


def failing_surfaces(token, household):
    out = []
    for label, path in SURFACES:
        status, _ = call("GET", path, token, query={"householdId": household})
        if status != 200:
            out.append(f"{label} → {status}")
    return out


def forge_account(household: str, name: str, currency: str, archived: bool = False) -> str:
    """A row exactly as it would look if it had been created before the guard."""
    account_id = str(uuid.uuid4())
    archived_at = "now()" if archived else "null"
    sql(
        "insert into accounts (id, household_id, name, account_type, currency, "
        "opening_balance_minor, current_balance_minor, is_shared, is_system, archived_at) values "
        f"('{account_id}', '{household}', '{name}', 'CHECKING', '{currency}', "
        f"500000, 500000, true, false, {archived_at})"
    )
    return account_id


def main() -> int:
    # --- the household boundary -------------------------------------------------
    token = register("curinv")
    for currency in ("EUR", "NOK", "USD", "DKK"):
        status, body = call(
            "POST", "/households", token, {"name": f"Hushall {currency}", "baseCurrency": currency}
        )
        check(
            f"CUR-00{['EUR', 'NOK', 'USD', 'DKK'].index(currency) + 1}",
            f"a household cannot be created in {currency}",
            status >= 400,
            f"POST /households baseCurrency={currency} → {status} {code_of(body)}",
        )

    status, household = call("POST", "/households", token, {"name": "Kronhushall"})
    hh = household["id"]
    check(
        "CUR-005",
        "a household in the supported currency is created normally",
        status in (200, 201) and household.get("baseCurrency") == "SEK",
        f"POST /households → {status}, base {household.get('baseCurrency')}",
    )

    # --- the account boundary ---------------------------------------------------
    status, account = call(
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
    cash = (account or {}).get("id")
    check(
        "CUR-006",
        "a matching account opens normally, so the guard is not refusing everything",
        status in (200, 201),
        f"POST /accounts SEK → {status}",
    )

    status, body = call(
        "POST",
        "/accounts",
        token,
        {
            "householdId": hh,
            "name": "Eurokonto",
            "accountType": "CHECKING",
            "currency": "EUR",
            "openingBalanceMinor": "100000",
        },
        headers=idem(),
    )
    check(
        "CUR-007",
        "an account in another currency is refused with a domain error",
        status == 422 and code_of(body) == "UNSUPPORTED_ACCOUNT_CURRENCY",
        f"POST /accounts EUR → {status} {code_of(body)}",
    )

    # --- the ledger boundary ----------------------------------------------------
    status, _ = call(
        "POST",
        "/ledger/income",
        token,
        {
            "householdId": hh,
            "cashAccountId": cash,
            "amountMinor": "250000",
            "occurredOn": "2026-08-05",
            "description": "Lön",
        },
        headers=idem(),
    )
    check(
        "CUR-008",
        "money books normally against a matching account",
        status in (200, 201),
        f"POST /ledger/income → {status}",
    )

    status, body = call(
        "POST",
        "/ledger/income",
        token,
        {
            "householdId": hh,
            "cashAccountId": cash,
            "amountMinor": "250000",
            "occurredOn": "2026-08-05",
            "description": "Lön i EUR",
            "currency": "EUR",
        },
        headers=idem(),
    )
    check(
        "CUR-009",
        "the API gives no way to name a posting currency of its own",
        status >= 400,
        f"POST /ledger/income with currency=EUR → {status} {code_of(body)}",
    )

    # --- legacy quarantine ------------------------------------------------------
    legacy = forge_account(hh, "Gammalt eurokonto", "EUR")
    baseline = call("GET", "/net-worth", token, query={"householdId": hh})[1]["current"][
        "amountMinor"
    ]

    for ident, path, payload in (
        (
            "CUR-010",
            "/ledger/income",
            {"cashAccountId": legacy, "amountMinor": "250000", "description": "Inkomst"},
        ),
        (
            "CUR-011",
            "/ledger/expenses",
            {"cashAccountId": legacy, "amountMinor": "100000", "description": "Utgift"},
        ),
    ):
        status, body = call(
            "POST",
            path,
            token,
            {"householdId": hh, "occurredOn": "2026-08-05", **payload},
            headers=idem(),
        )
        check(
            ident,
            f"{path.split('/')[-1]} onto a quarantined account is refused",
            status >= 400 and code_of(body) == "ACCOUNT_CURRENCY_QUARANTINED",
            f"{path} → {status} {code_of(body)}",
        )

    for ident, label, body_payload in (
        (
            "CUR-012",
            "supported → quarantined",
            {"fromAccountId": cash, "toAccountId": legacy},
        ),
        (
            "CUR-013",
            "quarantined → supported",
            {"fromAccountId": legacy, "toAccountId": cash},
        ),
    ):
        status, body = call(
            "POST",
            "/ledger/transfers/internal",
            token,
            {
                "householdId": hh,
                "amountMinor": "50000",
                "occurredOn": "2026-08-05",
                "description": "Överföring",
                **body_payload,
            },
            headers=idem(),
        )
        check(
            ident,
            f"a cross-currency transfer ({label}) is refused",
            status >= 400,
            f"transfer → {status} {code_of(body)}",
        )

    mismatched = sql(
        "select count(*) from ledger_postings lp join accounts a on a.id = lp.account_id "
        f"where lp.household_id = '{hh}' and lp.currency <> a.currency"
    )
    check(
        "CUR-014",
        "not one posting exists in a currency its account does not hold",
        mismatched == "0",
        f"mismatched postings in this household: {mismatched}",
    )

    after = call("GET", "/net-worth", token, query={"householdId": hh})[1]["current"][
        "amountMinor"
    ]
    check(
        "CUR-015",
        "net worth did not move, because nothing was allowed to be booked",
        after == baseline,
        f"net worth {baseline} → {after}",
    )

    failures = failing_surfaces(token, hh)
    check(
        "CUR-016",
        "the household keeps working with a quarantined account in place",
        not failures,
        "every aggregate surface answers" if not failures else str(failures),
    )

    # --- archived legacy account -------------------------------------------------
    archived = forge_account(hh, "Arkiverat eurokonto", "EUR", archived=True)
    status, body = call(
        "POST",
        "/ledger/income",
        token,
        {
            "householdId": hh,
            "cashAccountId": archived,
            "amountMinor": "1000",
            "occurredOn": "2026-08-05",
            "description": "Inkomst på arkiverat",
        },
        headers=idem(),
    )
    check(
        "CUR-017",
        "an archived mismatched account takes no money either",
        status >= 400,
        f"income onto an archived EUR account → {status} {code_of(body)}",
    )
    failures = failing_surfaces(token, hh)
    check(
        "CUR-018",
        "an archived mismatched account does not block the current figures",
        not failures,
        "every aggregate surface answers" if not failures else str(failures),
    )

    # --- remediation for a legacy household --------------------------------------
    legacy_token = register("curlegacy")
    legacy_hh = str(uuid.uuid4())
    legacy_email = sql(
        "select email from users order by created_at desc limit 1"
    )
    legacy_user = sql(f"select id from users where email = '{legacy_email}'")
    sql(
        "insert into households (id, name, base_currency) values "
        f"('{legacy_hh}', 'Gammalt eurohushall', 'EUR')"
    )
    sql(
        "insert into household_members (household_id, user_id, role, personal_data_policy) "
        f"values ('{legacy_hh}', '{legacy_user}', 'OWNER', 'FULL_DETAILS')"
    )

    status, body = call(
        "POST",
        "/accounts",
        legacy_token,
        {
            "householdId": legacy_hh,
            "name": "Konto",
            "accountType": "CHECKING",
            "currency": "SEK",
            "openingBalanceMinor": "1000",
        },
        headers=idem(),
    )
    check(
        "CUR-019",
        "a legacy household in an unsupported currency cannot grow new accounts",
        status >= 400,
        f"POST /accounts into a EUR household → {status} {code_of(body)}",
    )

    listed = call("GET", "/households", legacy_token)[1]
    entry = next((row for row in listed if row["id"] == legacy_hh), None)
    check(
        "CUR-020",
        "the product tells the participant the household's currency is unusable",
        entry is not None and entry.get("currencySupported") is False,
        f"currencySupported {entry.get('currencySupported') if entry else 'household missing'}",
    )

    status, body = call(
        "POST", f"/households/{legacy_hh}/base-currency", legacy_token, {"baseCurrency": "SEK"}
    )
    check(
        "CUR-021",
        "an empty legacy household can be migrated onto the supported currency",
        status in (200, 201) and sql(f"select base_currency from households where id = '{legacy_hh}'") == "SEK",
        f"migrate → {status}, base now "
        f"{sql(f'select base_currency from households where id = ' + chr(39) + legacy_hh + chr(39))}",
    )

    status, account = call(
        "POST",
        "/accounts",
        legacy_token,
        {
            "householdId": legacy_hh,
            "name": "Lönekonto",
            "accountType": "CHECKING",
            "currency": "SEK",
            "openingBalanceMinor": "100000",
        },
        headers=idem(),
    )
    check(
        "CUR-022",
        "after migration the household works like any other",
        status in (200, 201) and not failing_surfaces(legacy_token, legacy_hh),
        f"POST /accounts → {status}, surfaces answer",
    )

    # A household that holds money must not be re-denominated by relabelling.
    money_hh = str(uuid.uuid4())
    sql(
        "insert into households (id, name, base_currency) values "
        f"('{money_hh}', 'Eurohushall med pengar', 'EUR')"
    )
    sql(
        "insert into household_members (household_id, user_id, role, personal_data_policy) "
        f"values ('{money_hh}', '{legacy_user}', 'OWNER', 'FULL_DETAILS')"
    )
    forge_account(money_hh, "Eurokonto", "EUR")
    status, body = call(
        "POST", f"/households/{money_hh}/base-currency", legacy_token, {"baseCurrency": "SEK"}
    )
    check(
        "CUR-023",
        "a household holding money is not silently re-denominated",
        status >= 400
        and code_of(body) == "CURRENCY_MIGRATION_UNSAFE"
        and sql(f"select base_currency from households where id = '{money_hh}'") == "EUR",
        f"migrate → {status} {code_of(body)}, base still "
        f"{sql(f'select base_currency from households where id = ' + chr(39) + money_hh + chr(39))}",
    )

    passed = sum(1 for _, ok, _, _ in RESULTS if ok)
    print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
    for ident, ok, claim, detail in RESULTS:
        if not ok:
            print(f"  FAILED: {ident} {claim} — {detail}")
    return 0 if passed == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
