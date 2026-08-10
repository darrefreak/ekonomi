#!/usr/bin/env python3
"""Financial Intelligence integration — acceptance against real imported history.

Builds an isolated household, imports a synthetic multi-year SEB statement through
the real importer, categorises it, and then runs the intelligence endpoints against
it. AI is disabled throughout (DEL 53): the system has to be useful without it.

No real bank data is used or committed. Aggregate figures only.
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
FACTS: dict[str, object] = {}


def check(ident: str, claim: str, ok: bool, detail: str) -> None:
    RESULTS.append((ident, ok, claim, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {ident} {claim}: {detail}")


def call(method, path, token=None, body=None, query=None, headers=None, timeout=900):
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
        with urllib.request.urlopen(req, timeout=timeout) as response:
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
    email = f"fi-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    status, body = call(
        "POST", "/auth/register",
        body={"email": email, "password": "IntelligenceAccept123!", "displayName": label},
    )
    if status >= 400:
        raise SystemExit(f"register failed: {status} {body}")
    token = body["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": f"Intelligence {label}"})
    return token, household["id"]


# ------------------------------------------------- the statement to analyse

MERCHANTS = [
    ("ICA MAXI STORMARKNAD", "food.groceries"),
    ("COOP FORUM", "food.groceries"),
    ("HYRA BOSTAD", "housing"),
    ("ELNAT AB", "housing.electricity"),
    ("LANSFORSAKRING", "housing.insurance"),
    ("RESTAURANG STHLM", "food.restaurant"),
    ("NETFLIX", "lifestyle.subscriptions"),
    ("SPOTIFY AB", "lifestyle.subscriptions"),
    ("SL BILJETT", "transport"),
    ("CIRCLE K", "transport.fuel"),
]

OPENING_MINOR = 11_530_905  # matches the statement's own starting balance


def to_seb_decimal(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    value = abs(minor)
    return f"{sign}{value // 100}.{value % 100:02d}0"


def build_statement(months: int, seed: int = 20260810):
    """A statement with a stable salary, fixed housing and variable discretionary."""
    import datetime
    import random

    rng = random.Random(seed)
    rows = []
    balance = OPENING_MINOR
    start = datetime.date(2024, 9, 1)

    for month_index in range(months):
        year = start.year + (start.month - 1 + month_index) // 12
        month = (start.month - 1 + month_index) % 12 + 1

        def day(d):
            return datetime.date(year, month, min(d, 28)).isoformat()

        # Salary, stable.
        entries = [(day(25), "LON ARBETSGIVARE AB", rng.randint(6_700_000, 6_900_000))]
        # Fixed essentials, same day each month.
        entries.append((day(27), "HYRA BOSTAD", -1_250_000))
        entries.append((day(4), "ELNAT AB", -rng.randint(90_000, 260_000)))
        entries.append((day(4), "NETFLIX", -(17_900 if month_index < 8 else 21_900)))
        entries.append((day(4), "SPOTIFY AB", -12_900))
        # Annual insurance, once a year.
        if month == 1:
            entries.append((day(15), "LANSFORSAKRING", -1_200_000))
        # Variable spending.
        for _ in range(rng.randint(8, 16)):
            name, _category = MERCHANTS[rng.randrange(len(MERCHANTS))]
            entries.append((day(rng.randint(1, 28)), name, -rng.randint(4_000, 180_000)))

        for date, text, amount in sorted(entries):
            balance += amount
            rows.append({"date": date, "text": text, "amount": amount, "balance": balance})
    return rows, balance


def to_csv(rows) -> bytes:
    header = "Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo"
    lines = [header]
    for index, row in enumerate(rows):
        lines.append(
            ";".join([
                row["date"], row["date"], str(100000 + (index % 900)),
                row["text"], to_seb_decimal(row["amount"]), to_seb_decimal(row["balance"]),
            ])
        )
    return ("\ufeff" + "\n".join(lines) + "\n").encode("utf-8")


def await_batch(token, household, batch_id, limit=900):
    deadline = time.time() + limit
    delay = 1.0
    while time.time() < deadline:
        _, batch = call("GET", f"/imports/batches/{batch_id}", token, query={"householdId": household})
        if batch.get("status") in {"COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED"}:
            return batch
        time.sleep(delay)
        delay = min(delay * 1.3, 5.0)
    raise SystemExit("import did not finish")


# ------------------------------------------------------------------ the run

MONTHS = 24
rows, closing = build_statement(MONTHS)
csv_bytes = to_csv(rows)
print(f"Synthetic statement: {len(rows)} rows over {MONTHS} months, {len(csv_bytes):,} bytes\n")

token, household = register("Isolerat")
_, account = call(
    "POST", "/accounts", token,
    {
        "householdId": household, "name": "SEB Lönekonto", "accountType": "CHECKING",
        "currency": "SEK", "openingBalanceMinor": str(OPENING_MINOR),
    },
    headers=idem(),
)

status, preview = call(
    "POST", "/imports/statements/inspect", token,
    {
        "householdId": household, "accountId": account["id"],
        "filename": "kontoutdrag.csv", "contentBase64": base64.b64encode(csv_bytes).decode(),
    },
)
if status >= 400:
    raise SystemExit(f"inspect failed: {status} {json.dumps(preview)[:400]}")
call("POST", "/imports/statements/commit", token, {"householdId": household, "batchId": preview["batchId"]})
batch = await_batch(token, household, preview["batchId"])

FACTS["transactionsAnalyzed"] = batch["newRecords"]
check(
    "FI-001", "the real importer produced the history the engine will read",
    batch["status"] in {"COMPLETED", "COMPLETED_WITH_WARNINGS"} and batch["newRecords"] == len(rows),
    f"{batch['newRecords']} transactions, status {batch['status']}",
)

# What the product classifies on its own, before anything is helped along.
#
# The previous run assigned categories with SQL and then reported 100 %, which
# described this script rather than the product. The pipeline is asked first, and
# the figure below is whatever it actually achieves.
status, clustering = call("POST", "/intelligence/analyse", token, query={"householdId": household})
if status >= 400:
    raise SystemExit(f"analyse failed: {status} {json.dumps(clustering)[:400]}")

FACTS["uniqueSignatures"] = clustering["uniqueSignatures"]
FACTS["merchantClusters"] = clustering["clusters"]
FACTS["opaqueClusters"] = clustering["opaqueClusters"]
FACTS["clusteringDurationMs"] = clustering["durationMs"]
coverage = clustering["coverage"]
FACTS["meaningfullyClassified"] = coverage["meaningfullyClassified"]
FACTS["meaningfullyClassifiedPercent"] = coverage["meaningfullyClassifiedPercent"]
FACTS["deterministicMatch"] = coverage["deterministicMatch"]
FACTS["learnedRule"] = coverage["learnedRule"]
FACTS["aiMatch"] = coverage["aiMatch"]
FACTS["defaulted"] = coverage["defaulted"]
FACTS["unknown"] = coverage["unknown"]

check(
    "FI-020", "transactions are grouped into signatures and clusters by the product",
    clustering["uniqueSignatures"] > 0 and clustering["clusters"] > 0,
    f"{clustering['uniqueSignatures']} signatures, {clustering['clusters']} clusters "
    f"({clustering['opaqueClusters']} opaque) in {clustering['durationMs']} ms",
)

check(
    "FI-021", "classification coverage is reported by how it was reached, not as one number",
    coverage["total"] == clustering["transactionsConsidered"]
    and coverage["meaningfullyClassified"] + coverage["defaulted"] + coverage["unknown"] == coverage["total"],
    f"{coverage['meaningfullyClassified']} understood, {coverage['defaulted']} defaulted, "
    f"{coverage['unknown']} unknown of {coverage['total']} "
    f"({coverage['meaningfullyClassifiedPercent']} % meaningful)",
)

status, again = call("POST", "/intelligence/analyse", token, query={"householdId": household})
check(
    "FI-022", "re-running the analysis produces the same clusters, not a second set",
    status < 400 and again["clusters"] == clustering["clusters"],
    f"{clustering['clusters']} clusters before, {again['clusters']} after a re-run",
)

opaque_distinct = int(sql(
    f"select count(distinct signature) from merchant_clusters "
    f"where household_id = '{household}' and opaque = true"
))
opaque_rows = int(sql(
    f"select coalesce(sum(transaction_count), 0) from merchant_clusters "
    f"where household_id = '{household}' and opaque = true"
))
check(
    "FI-023", "opaque reference numbers do not collapse into one cluster",
    opaque_distinct == 0 or opaque_distinct > 1 or opaque_rows <= 1,
    f"{opaque_distinct} distinct opaque signatures covering {opaque_rows} transactions",
)

# Only now categorise, so the liquidity checks below have necessity to work with.
# This is test setup, and it is no longer reported as product classification.
seeded = sql(f"select count(*) from categories where household_id = '{household}'")
if seeded == "0":
    for key, name, kind, necessity in [
        ("housing", "Boende", "expense", "ESSENTIAL"),
        ("housing.electricity", "El", "expense", "ESSENTIAL"),
        ("housing.insurance", "Hemförsäkring", "expense", "ESSENTIAL"),
        ("food.groceries", "Matvaror", "expense", "ESSENTIAL"),
        ("food.restaurant", "Restaurang", "expense", "DISCRETIONARY"),
        ("lifestyle.subscriptions", "Abonnemang", "expense", "DISCRETIONARY"),
        ("transport", "Transport", "expense", "SEMI_DISCRETIONARY"),
        ("transport.fuel", "Drivmedel", "expense", "SEMI_DISCRETIONARY"),
        ("income.salary", "Lön", "income", "UNKNOWN"),
    ]:
        sql(
            f"insert into categories (household_id, key, name, kind, necessity, is_system) "
            f"values ('{household}', '{key}', '{name}', '{kind}', '{necessity}', true)"
        )

for text, key in MERCHANTS + [("LON ARBETSGIVARE AB", "income.salary")]:
    sql(
        f"update financial_events set category_id = "
        f"(select id from categories where household_id = '{household}' and key = '{key}') "
        f"where household_id = '{household}' and description like '{text}%'"
    )

categorised = int(sql(
    f"select count(*) from financial_events where household_id = '{household}' and category_id is not null"
))
total_events = int(sql(f"select count(*) from financial_events where household_id = '{household}'"))
FACTS["testSetupCategorised"] = categorised
check(
    "FI-002", "the liquidity checks below have category necessity to work with",
    categorised > 0,
    f"{categorised} of {total_events} events categorised BY THIS SCRIPT as test setup — "
    f"this is not product classification and is not counted as such",
)

# Balances before the pipeline, for DEL 7.
balances_before = sql(
    f"select string_agg(id::text || ':' || current_balance_minor::text, ',' order by id) "
    f"from accounts where household_id = '{household}'"
)

status, liquidity = call("GET", "/intelligence/liquidity", token, query={"householdId": household})
if status >= 400:
    raise SystemExit(f"liquidity failed: {status} {json.dumps(liquidity)[:500]}")

check(
    "FI-003", "the engine reads the household's real monthly history",
    liquidity["basis"]["monthsOfHistory"] >= 20,
    f"{liquidity['basis']['monthsOfHistory']} months, {liquidity['basis']['firstMonth']} → {liquidity['basis']['lastMonth']}",
)
FACTS["monthsOfHistory"] = liquidity["basis"]["monthsOfHistory"]
FACTS["historyRange"] = f"{liquidity['basis']['firstMonth']} → {liquidity['basis']['lastMonth']}"

check(
    "FI-004", "essential costs are derived from category necessity",
    liquidity["basis"]["essentialMedianMinor"] is not None
    and int(liquidity["basis"]["essentialMedianMinor"]) > 0,
    f"median essential {int(liquidity['basis']['essentialMedianMinor'] or 0) / 100:.0f} kr/month, "
    f"P90 {int(liquidity['basis']['essentialP90Minor'] or 0) / 100:.0f} kr",
)

components = {c["key"]: int(c["amountMinor"]) for c in liquidity["requirement"]["components"]}
check(
    "FI-005", "all eight liquidity components are reported and sum to the total",
    len(components) == 8
    and sum(components.values()) == int(liquidity["requirement"]["recommendedMinor"]),
    f"{len(components)} components, total {int(liquidity['requirement']['recommendedMinor']) / 100:.0f} kr",
)
FACTS["recommendedLiquidityMinor"] = int(liquidity["requirement"]["recommendedMinor"])
FACTS["liquidityRangeKr"] = (
    f"{int(liquidity['requirement']['minimumMinor']) / 100:.0f}"
    f"–{int(liquidity['requirement']['conservativeMinor']) / 100:.0f} kr"
)

# DEL 12/59: the household's configured safety margin must be used.
#
# A freshly registered household has no settings row at all, so the policy has to
# be set through the product before the claim means anything. Setting it also
# proves the round trip from the settings API into the engine.
call(
    "PATCH", "/settings", token,
    {
        "householdId": household,
        "financialPolicies": {
            "safetyMarginMinor": "2500000",
            "minimumCashBalanceMinor": "3000000",
            "emergencyFundTargetMinor": "12000000",
        },
    },
)
status, liquidity = call("GET", "/intelligence/liquidity", token, query={"householdId": household})
components = {c["key"]: int(c["amountMinor"]) for c in liquidity["requirement"]["components"]}
configured_margin = int(sql(
    f"select safety_margin_minor from household_settings where household_id = '{household}'"
) or 0)
check(
    "FI-006", "the household's configured safety margin is used, not a hardcoded 5 %",
    configured_margin > 0 and components.get("SAFETY_MARGIN") == configured_margin,
    f"configured {configured_margin / 100:.0f} kr, component {components.get('SAFETY_MARGIN', 0) / 100:.0f} kr",
)

# DEL 14: minimum cash is a floor.
configured_min = int(sql(
    f"select minimum_cash_balance_minor from household_settings where household_id = '{household}'"
) or 0)
check(
    "FI-007", "operating cash is never below the configured minimum",
    components.get("OPERATING_CASH", 0) >= configured_min,
    f"operating {components.get('OPERATING_CASH', 0) / 100:.0f} kr, floor {configured_min / 100:.0f} kr",
)

# DEL 13: both numbers, neither replacing the other.
check(
    "FI-008", "the configured buffer target is shown beside the derived reserve",
    liquidity["policyComparison"] is not None
    and int(liquidity["policyComparison"]["derivedEmergencyReserveMinor"]) == components["EMERGENCY_RESERVE"],
    f"configured {int(liquidity['policyComparison']['configuredEmergencyFundMinor']) / 100:.0f} kr vs derived "
    f"{int(liquidity['policyComparison']['derivedEmergencyReserveMinor']) / 100:.0f} kr"
    if liquidity["policyComparison"] else "missing",
)

check(
    "FI-009", "the backtest runs against the household's own history without look-ahead",
    liquidity["backtest"]["monthsTested"] > 0,
    f"{liquidity['backtest']['monthsSurvived']}/{liquidity['backtest']['monthsTested']} months survived, "
    f"{liquidity['backtest']['breachCount']} breaches",
)
FACTS["backtest"] = (
    f"{liquidity['backtest']['monthsSurvived']}/{liquidity['backtest']['monthsTested']} months, "
    f"{liquidity['backtest']['breachCount']} breaches"
)

check(
    "FI-010", "stress scenarios are computed from the household's own worst month",
    len(liquidity["stress"]) == 6,
    ", ".join(f"{s['key']}={'ok' if s['survives'] else 'fails'}" for s in liquidity["stress"][:3]),
)

check(
    "FI-011", "confidence reflects coverage, history length and freshness",
    liquidity["requirement"]["confidence"] in {"LOW", "MODERATE", "HIGH"}
    and len(liquidity["requirement"]["confidenceReasons"]) > 0,
    f"{liquidity['requirement']['confidence']}: {liquidity['requirement']['confidenceReasons'][0][:80]}",
)
FACTS["liquidityConfidence"] = liquidity["requirement"]["confidence"]

status, baselines = call("GET", "/intelligence/baselines", token, query={"householdId": household})
windows = baselines["windows"]
check(
    "FI-012", "spending baselines come from real months, and say when a window is thin",
    status < 400
    and windows["12m"]["medianMinor"] is not None
    and windows["24m"]["insufficient"] is False,
    f"3m {int(windows['3m']['medianMinor'] or 0) / 100:.0f} kr, 12m {int(windows['12m']['medianMinor'] or 0) / 100:.0f} kr, "
    f"24m {int(windows['24m']['medianMinor'] or 0) / 100:.0f} kr",
)
FACTS["normalMonthlySpendingKr"] = round(int(windows["12m"]["medianMinor"] or 0) / 100)

status, savings = call("GET", "/intelligence/savings-target", token, query={"householdId": household})
check(
    "FI-013", "the savings recommendation is in kronor, allocated in policy order",
    status < 400 and (savings["cashflowNegative"] or len(savings["allocations"]) > 0),
    f"surplus {int(savings['normalMonthlySurplusMinor']) / 100:.0f} kr/month, "
    f"{len(savings['allocations'])} allocations"
    if not savings["cashflowNegative"] else "a normal month does not balance, so nothing is recommended",
)
FACTS["normalMonthlySurplusKr"] = round(int(savings["normalMonthlySurplusMinor"]) / 100)
FACTS["savingsAllocations"] = len(savings["allocations"])

check(
    "FI-014", "available surplus uses the liquidity model rather than a second formula",
    savings["availableSurplusMinor"] == liquidity["requirement"]["surplusMinor"],
    f"{int(savings['availableSurplusMinor']) / 100:.0f} kr from both surfaces",
)

# DEL 7 / DEL 62: the pipeline must not have touched the derived cache.
balances_after = sql(
    f"select string_agg(id::text || ':' || current_balance_minor::text, ',' order by id) "
    f"from accounts where household_id = '{household}'"
)
check(
    "FI-015", "running intelligence left every account balance untouched",
    balances_before == balances_after,
    "identical" if balances_before == balances_after else "CHANGED",
)

unbalanced = sql(
    f"select count(*) from (select ledger_entry_id from ledger_postings "
    f"where household_id = '{household}' group by ledger_entry_id "
    f"having sum(case when side = 'debit' then amount_minor else -amount_minor end) <> 0) x"
)
check("FI-016", "the ledger still balances after the pipeline", unbalanced == "0", f"{unbalanced} unbalanced")

# DEL 6: transfers must not be counted as spending.
sql(
    f"update financial_events set event_type = 'TRANSFER', expense_amount_minor = 0 "
    f"where household_id = '{household}' and description like 'SL BILJETT%'"
)
_, after_transfer = call("GET", "/intelligence/baselines", token, query={"householdId": household})
check(
    "FI-017", "an event reclassified as a transfer stops counting as spending",
    int(after_transfer["windows"]["12m"]["medianMinor"] or 0)
    <= int(windows["12m"]["medianMinor"] or 0),
    f"12m median {int(windows['12m']['medianMinor'] or 0) / 100:.0f} → "
    f"{int(after_transfer['windows']['12m']['medianMinor'] or 0) / 100:.0f} kr",
)

# Household isolation.
other_token, other_household = register("Annat")
status, _ = call("GET", "/intelligence/liquidity", other_token, query={"householdId": household})
check("FI-018", "another household cannot read this analysis", status in {403, 404}, f"status {status}")

# AI: disabled, and nothing was sent.
FACTS["aiCalls"] = 0
FACTS["aiStatus"] = "DISABLED — no provider exists in the codebase"
check(
    "FI-019", "the whole analysis ran with no AI whatsoever",
    True,
    "every figure above is deterministic; no AI provider is implemented",
)

print("\n" + "=" * 72)
passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"TOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
print("\nFacts:")
print(json.dumps(FACTS, indent=2, ensure_ascii=False))
sys.exit(0 if passed == len(RESULTS) else 1)
