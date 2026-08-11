#!/usr/bin/env python3
"""OpenAI classification fallback + Financial Brief V2 — acceptance (§64).

Order of proof:
  A. deterministic baseline on an isolated household, built through the real
     SEB importer (no SQL writes anywhere in the flow under test);
  B. AI dry-run against that household: same eligibility maths, zero external
     calls, counts only;
  C. real provider calls happen ONLY if the environment explicitly enables
     them (AI_TRANSACTION_CLASSIFICATION_ENABLED + OPENAI_API_KEY). In every
     other case the verdict is NOT AUTHORIZED and nothing leaves the machine.
     Provider behaviour itself (structured output, taxonomy safety, UNKNOWN,
     failures, cache) is proven by the database-backed integration suite with
     a synthetic provider;
  D. Financial Brief V2 with AI OFF: the mandatory template pipeline;
  E. Brief V2 with mocked AI + numeric grounding: integration suite;
  F. full regression runs separately (build/lint/typecheck/tests/e2e/docker).

No real bank data is used. Aggregate figures only — no private descriptions
appear in this script's output or in any acceptance document.
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
    email = f"ai-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    status, body = call(
        "POST", "/auth/register",
        body={"email": email, "password": "AiAcceptance123!", "displayName": label},
    )
    if status >= 400:
        raise SystemExit(f"register failed: {status} {body}")
    token = body["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": f"AI {label}"})
    return token, household["id"]


# ---------------------------------------------------------- the statement

MERCHANT_MONTHLY = [
    ("LON ARBETSGIVARE AB", None),
]

OPENING_MINOR = 11_530_905


def to_seb_decimal(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    value = abs(minor)
    return f"{sign}{value // 100}.{value % 100:02d}0"


def build_statement(months: int, seed: int = 20260811):
    """The recurring-slice statement, plus two patterns this slice is about:
    an unknown-but-semantic monthly charge (AI-eligible) and an opaque
    reference-only pattern (never AI-eligible)."""
    import datetime
    import random

    rng = random.Random(seed)
    start = datetime.date(2023, 9, 1)
    entries = []

    for month_index in range(months):
        year = start.year + (start.month - 1 + month_index) // 12
        month = (start.month - 1 + month_index) % 12 + 1

        def day(d):
            return datetime.date(year, month, min(d, 28)).isoformat()

        entries.append((day(25), "LON ARBETSGIVARE AB", rng.randint(6_700_000, 6_900_000)))
        entries.append((day(27), "HYRA BOSTAD", -1_250_000))
        entries.append((day(4), "ELNAT AB", -rng.randint(90_000, 260_000)))
        entries.append((day(4), "NETFLIX", -(17_900 if month_index < 30 else 21_900)))
        entries.append((day(4), "SPOTIFY AB", -12_900))
        # Unknown but semantic: no system rule knows this name. AI-eligible.
        entries.append((day(9), "ZAPSTREAM MEDIA TJANST", -16_900))
        # Opaque: a bare payment reference. Never sent anywhere (§7, §28).
        entries.append((day(12), f"9048{rng.randint(10_000_000, 99_999_999)}", -rng.randint(20_000, 30_000)))
        if month == 1:
            entries.append((day(15), "LANSFORSAKRING", -1_200_000))
        for _ in range(rng.randint(6, 12)):
            name = ["ICA MAXI STORMARKNAD", "COOP FORUM", "RESTAURANG STHLM", "CIRCLE K"][rng.randrange(4)]
            entries.append((day(rng.randint(1, 28)), name, -rng.randint(4_000, 180_000)))

    rows = []
    balance = OPENING_MINOR
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


# ------------------------------------------------------- A. the baseline

MONTHS = 36
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
check(
    "AI-001", "the real importer produced the history under test",
    batch["status"] in {"COMPLETED", "COMPLETED_WITH_WARNINGS"} and batch["newRecords"] == len(rows),
    f"{batch['newRecords']} transactions, status {batch['status']}",
)

status, clustering = call("POST", "/intelligence/analyse", token, query={"householdId": household})
if status >= 400:
    raise SystemExit(f"analyse failed: {status} {json.dumps(clustering)[:400]}")
coverage = clustering["coverage"]
FACTS["transactionsAnalyzed"] = coverage["total"]
FACTS["clustersTotal"] = clustering["clusters"]
FACTS["deterministicMatch"] = coverage["deterministicMatch"]
FACTS["unknown"] = coverage["unknown"]
check(
    "AI-002", "the deterministic pipeline works with AI off — the baseline this slice must not disturb",
    clustering["clusters"] > 0 and coverage["deterministicMatch"] > 0,
    f"{coverage['total']} tx, {clustering['clusters']} clusters, "
    f"{coverage['deterministicMatch']} deterministic, {coverage['unknown']} unknown",
)

status, queue_before = call("GET", "/intelligence/review", token, query={"householdId": household})
FACTS["needsReviewBefore"] = queue_before["total"]
check(
    "AI-003", "Needs Review is available before any AI exists",
    status < 400 and queue_before["total"] > 0,
    f"{queue_before['total']} open review items",
)

# The ledger truth this run must not change.
oracle_before = sql(
    f"select count(*) || '|' || coalesce(sum(amount_minor), 0) from ledger_postings "
    f"where household_id = '{household}'"
)

# ------------------------------------------------------- AI status honesty

status, ai_status = call("GET", "/intelligence/ai/status", token, query={"householdId": household})
if status >= 400:
    raise SystemExit(f"ai status failed: {status} {json.dumps(ai_status)[:400]}")
FACTS["envEnabled"] = ai_status["envEnabled"]
FACTS["externalCallsAllowed"] = ai_status["externalCallsAllowed"]
check(
    "AI-010", "the status endpoint tells the truth about every gate",
    ai_status["externalCallsAllowed"] is False and ai_status["householdEnabled"] is False,
    f"env {ai_status['envEnabled']}, household {ai_status['householdEnabled']}, "
    f"dryRunForced {ai_status['dryRunForced']}, provider {ai_status['providerConfigured']}, "
    f"external {ai_status['externalCallsAllowed']}",
)
check(
    "AI-011", "cost observability starts at zero for a household that never used AI",
    ai_status["metrics"]["requests"] == 0 and ai_status["metrics"]["clustersSent"] == 0,
    json.dumps(ai_status["metrics"]),
)

# ------------------------------------------------------------ B. dry run

status, dry = call("GET", "/intelligence/ai/dry-run", token, query={"householdId": household})
if status >= 400:
    raise SystemExit(f"dry-run failed: {status} {json.dumps(dry)[:400]}")
FACTS["dryRun"] = dry
check(
    "AI-020", "the dry-run reports the real eligibility maths",
    dry["dryRun"] is True
    and dry["transactionsAnalyzed"] == coverage["total"]
    and dry["clustersTotal"] == clustering["clusters"]
    and dry["aiEligibleClusters"] > 0
    and dry["aiEligibleClusters"] <= dry["unresolvedClusters"],
    f"{dry['clustersTotal']} clusters: {dry['resolvedDeterministic']} deterministic, "
    f"{dry['unresolvedClusters']} unresolved, {dry['aiEligibleClusters']} AI-eligible, "
    f"{dry['opaqueExcluded']} opaque excluded",
)
check(
    "AI-021", "opaque reference-only clusters are excluded from what would be sent",
    dry["opaqueExcluded"] >= 1,
    f"{dry['opaqueExcluded']} opaque excluded",
)
check(
    "AI-022", "the dry-run estimates the external work without doing any",
    dry["providerCallsMade"] == 0 and dry["estimatedRequests"] >= 1 and dry["estimatedPayloadBytes"] > 0,
    f"{dry['estimatedRequests']} request(s), ~{dry['estimatedPayloadBytes']:,} bytes, 0 calls made",
)

ai_rows = int(sql(f"select count(*) from ai_classification_results where household_id = '{household}'"))
check(
    "AI-023", "a dry-run persists nothing to the AI cache",
    ai_rows == 0,
    f"{ai_rows} cache rows",
)

# ---------------------------------------------- C. real-call authorization

status, classify = call("POST", "/intelligence/ai/classify", token, query={"householdId": household})
check(
    "AI-030", "classify without full authorization degrades to the honest dry-run report",
    status < 400 and classify.get("dryRun") is True and classify.get("providerCallsMade", 0) == 0,
    f"dryRun {classify.get('dryRun')}, providerCallsMade {classify.get('providerCallsMade')}",
)

# Household consent alone must not open the gate: the environment still says no.
status, _ = call("PATCH", "/settings", token, {"householdId": household, "aiTransactionAnalysisEnabled": True})
check("AI-031", "the household can opt in through settings", status < 400, f"PATCH {status}")
status, ai_status2 = call("GET", "/intelligence/ai/status", token, query={"householdId": household})
check(
    "AI-032", "household consent alone does not authorize external calls",
    ai_status2["householdEnabled"] is True and ai_status2["externalCallsAllowed"] is False,
    f"household {ai_status2['householdEnabled']}, external {ai_status2['externalCallsAllowed']}",
)
status, classify2 = call("POST", "/intelligence/ai/classify", token, query={"householdId": household})
check(
    "AI-033", "classify with household consent but no environment enablement still sends nothing",
    status < 400 and classify2.get("dryRun") is True,
    f"dryRun {classify2.get('dryRun')}",
)
ai_rows = int(sql(f"select count(*) from ai_classification_results where household_id = '{household}'"))
audit_calls = int(sql(
    f"select count(*) from audit_logs where household_id = '{household}' "
    f"and action = 'intelligence.ai.provider_call'"
))
check(
    "AI-034", "no AI cache rows and no provider-call audit entries exist: nothing left the machine",
    ai_rows == 0 and audit_calls == 0,
    f"{ai_rows} cache rows, {audit_calls} provider-call audits",
)
FACTS["realCalls"] = "NOT AUTHORIZED"
# Restore the household default.
call("PATCH", "/settings", token, {"householdId": household, "aiTransactionAnalysisEnabled": False})

# ------------------------------------------------- D. Brief V2 with AI OFF

status, brief = call("GET", "/brief", token, query={"householdId": household})
if status >= 400:
    raise SystemExit(f"brief failed: {status} {json.dumps(brief)[:400]}")
FACTS["briefItems"] = len(brief["items"])
FACTS["briefGenerator"] = brief["generator"]
check(
    "AI-040", "the template brief works with AI off — headline plus 3–5 explained items",
    brief["generator"] == "TEMPLATE" and brief["model"] is None
    and len(brief["headline"]) > 5 and 0 < len(brief["items"]) <= 5,
    f"generator {brief['generator']}, {len(brief['items'])} items, headline present",
)
check(
    "AI-041", "every brief item explains itself and points into the product",
    all(i["explainRoute"].startswith("/") and len(i["explainLabel"]) > 0 and len(i["text"]) > 10 for i in brief["items"]),
    "; ".join(sorted({i["type"] for i in brief["items"]})),
)
check(
    "AI-042", "the AI status line is calm and honest, not an error",
    brief["aiStatus"]["enabled"] is False
    and "avstängd" in brief["aiStatus"]["message"]
    and "fungerar fortfarande" in brief["aiStatus"]["message"],
    brief["aiStatus"]["message"],
)
# The household has one checking account and nothing else: whole areas of its
# finances are missing, so the brief must say so rather than declare calm (§42).
check(
    "AI-043", "incomplete coverage is a visible finding, not silence",
    any(f["type"] == "DATA_COVERAGE_WARNING" for f in brief["findings"]),
    f"{sum(1 for f in brief['findings'] if f['type'] == 'DATA_COVERAGE_WARNING')} coverage warnings "
    f"among {len(brief['findings'])} findings",
)

status, brief2 = call("GET", "/brief", token, query={"householdId": household})
check(
    "AI-044", "unchanged inputs reuse the persisted snapshot (§45)",
    brief2["fromCache"] is True and brief2["briefId"] == brief["briefId"]
    and brief2["inputHash"] == brief["inputHash"],
    f"fromCache {brief2['fromCache']}, same briefId {brief2['briefId'] == brief['briefId']}",
)

snapshots = int(sql(f"select count(*) from financial_brief_snapshots where household_id = '{household}'"))
check(
    "AI-045", "one snapshot exists, versioned and hashed",
    snapshots == 1,
    f"{snapshots} snapshot rows",
)

# Every engine value behind an item is visible in its rendered sentence: the
# fragments were not lost or replaced on the way to the text. (The converse —
# that AI cannot introduce numbers absent from fragments/template — is the
# grounding rule proven by the engine and integration suites.)
import re

def number_tokens(text: str) -> set:
    compact = str(text).replace("\u00a0", "").replace(" ", "")
    return set(re.findall(r"\d+(?:[.,]\d+)?", compact))

for item in brief["items"]:
    finding = next(f for f in brief["findings"] if f["key"] == item["findingKey"])
    text_numbers = number_tokens(item["text"])
    missing = []
    for name, fragment in finding["fragments"].items():
        fragment_numbers = number_tokens(fragment)
        if fragment_numbers and not fragment_numbers <= text_numbers:
            missing.append(f"{name}={fragment}")
    if missing:
        check("AI-046", "the finding's numeric fragments appear verbatim in the rendered item", False,
              f"{item['findingKey']}: missing {missing}")
        break
else:
    check("AI-046", "the finding's numeric fragments appear verbatim in the rendered item", True,
          f"checked {len(brief['items'])} items")

# ------------------------------------------------------- financial oracle

oracle_after = sql(
    f"select count(*) || '|' || coalesce(sum(amount_minor), 0) from ledger_postings "
    f"where household_id = '{household}'"
)
check(
    "AI-050", "financial oracle: the AI surface changed no posting and no balance",
    oracle_before == oracle_after,
    f"postings before {oracle_before}, after {oracle_after}",
)

# ------------------------------------------------------------- isolation

iso_token, iso_household = register("Isolering")
status_a, _ = call("GET", "/intelligence/ai/status", iso_token, query={"householdId": household})
status_b, _ = call("GET", "/intelligence/ai/dry-run", iso_token, query={"householdId": household})
status_c, _ = call("GET", "/brief", iso_token, query={"householdId": household})
status_d, _ = call("POST", "/intelligence/ai/classify", iso_token, query={"householdId": household})
check(
    "AI-060", "another household can reach none of the AI surfaces",
    all(s in {403, 404} for s in (status_a, status_b, status_c, status_d)),
    f"status {status_a}, dry-run {status_b}, brief {status_c}, classify {status_d}",
)

# -------------------------------------------------------- erasure lifecycle

fk_rules = sql(
    "select string_agg(tc.table_name || ':' || rc.delete_rule, ',' order by tc.table_name) "
    "from information_schema.table_constraints tc "
    "join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name "
    "join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name "
    "where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'households' "
    "and tc.table_name in ('ai_classification_results', 'financial_brief_snapshots')"
)
check(
    "AI-070", "AI cache and brief snapshots die with the household (CASCADE)",
    "ai_classification_results:CASCADE" in fk_rules and "financial_brief_snapshots:CASCADE" in fk_rules,
    fk_rules,
)

# ---------------------------------------------------------------- summary

print("\n----------------------------------------------------------------")
failed = [r for r in RESULTS if not r[1]]
print(f"CHECKS: {len(RESULTS)} total, {len(RESULTS) - len(failed)} pass, {len(failed)} fail")
print("\nFACTS (aggregates only):")
dry = FACTS["dryRun"]
print(f"  transactions analyzed:  {FACTS['transactionsAnalyzed']}")
print(f"  clusters total:         {FACTS['clustersTotal']}")
print(f"  resolved before AI:     {dry['resolvedDeterministic'] + dry['resolvedLearnedRule'] + dry['resolvedUserVerified']}")
print(f"  unresolved clusters:    {dry['unresolvedClusters']}")
print(f"  AI eligible:            {dry['aiEligibleClusters']}")
print(f"  opaque excluded:        {dry['opaqueExcluded']}")
print(f"  estimated requests:     {dry['estimatedRequests']}")
print(f"  estimated payload:      {dry['estimatedPayloadBytes']:,} bytes")
print(f"  provider calls made:    0")
print(f"  needs review before AI: {FACTS['needsReviewBefore']}")
print(f"  AI real calls:          {FACTS['realCalls']}")
print(f"  brief generator:        {FACTS['briefGenerator']}, {FACTS['briefItems']} items")
sys.exit(1 if failed else 0)
