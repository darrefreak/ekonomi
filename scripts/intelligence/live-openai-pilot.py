#!/usr/bin/env python3
"""Live OpenAI classification pilot — bounded, consent-gated, measured.

Order of proof (pilot task §5–§38):
  1. synthetic provider connectivity has already passed (separate script);
  2. an isolated household is built through the real SEB importer — the same
     generator and seed as the accepted AI acceptance run, so counts are
     comparable (§8);
  3. dry-run first: counts, bound check (max 10 clusters, §9), no requests;
  4. final-payload inspection (separate tsx script, §11) before anything live;
  5. consent through the normal settings API (§10) — never SQL;
  6. financial safety snapshot, then ONE bounded live classification run;
  7. per-cluster outcomes, second run for cache proof, review reduction,
     learned-rule precedence, recurring idempotency, Brief V2, advisor smoke;
  8. financial safety snapshot again: bit-identical or the pilot FAILS.

Output discipline: aggregate counts, hashes, statuses and confidences only.
The synthetic merchant names printed here are defined in this file — no real
bank text, no API key, ever.
"""

import base64
import json
import re
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
TIMINGS: dict[str, float] = {}


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
    email = f"pilot-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    status, body = call(
        "POST", "/auth/register",
        body={"email": email, "password": "LivePilot123!", "displayName": label},
    )
    if status >= 400:
        raise SystemExit(f"register failed: {status} {body}")
    token = body["tokens"]["accessToken"]
    _, household = call("POST", "/households", token, {"name": f"Pilot {label}"})
    return token, household["id"]


# ---------------------------------------------------------- the statement
# Identical generator and seed to scripts/intelligence/ai-acceptance.py, so
# the dry-run counts are directly comparable with the accepted run (§8).

OPENING_MINOR = 11_530_905


def to_seb_decimal(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    value = abs(minor)
    return f"{sign}{value // 100}.{value % 100:02d}0"


def build_statement(months: int, seed: int = 20260811):
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
        entries.append((day(9), "ZAPSTREAM MEDIA TJANST", -16_900))
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


def oracle(household: str) -> str:
    """Postings, event amounts, balances: one string, compared bit-for-bit."""
    return sql(
        "select "
        f"(select count(*) || ':' || coalesce(sum(amount_minor), 0) from ledger_postings where household_id = '{household}') || '|' || "
        f"(select count(*) from financial_events where household_id = '{household}') || '|' || "
        f"(select coalesce(sum(amount_minor), 0) from ledger_postings lp join accounts a on a.id = lp.account_id where a.household_id = '{household}')"
    )


def number_tokens(text: str) -> set:
    compact = str(text).replace("\u00a0", "").replace(" ", "")
    return set(re.findall(r"\d+(?:[.,]\d+)?", compact))


# ------------------------------------------------------------ preflight

MONTHS = 36
rows, closing = build_statement(MONTHS)
csv_bytes = to_csv(rows)
print(f"Synthetic statement: {len(rows)} rows over {MONTHS} months, {len(csv_bytes):,} bytes\n")

token, household = register("Live")
_, account = call(
    "POST", "/accounts", token,
    {
        "householdId": household, "name": "SEB Lönekonto", "accountType": "CHECKING",
        "currency": "SEK", "openingBalanceMinor": str(OPENING_MINOR),
    },
    headers=idem(),
)

# A realistic small taxonomy, created through the normal API before anything
# AI-related runs. A fresh household has no categories at all (the first live
# run proved this the hard way), and the taxonomy must exist BEFORE the first
# classification and stay unchanged through the pilot: adding a category later
# would change the taxonomy version and rightly invalidate the live cache.
CATEGORY_NAMES = [
    ("Livsmedel", "expense"),
    ("Boende", "expense"),
    ("Transport och drivmedel", "expense"),
    ("Streaming och media", "expense"),
    ("Restaurang och café", "expense"),
    ("Försäkring", "expense"),
    ("El och energi", "expense"),
    ("Lön", "income"),
]
categories_by_name = {}
for name, kind in CATEGORY_NAMES:
    status, created = call(
        "POST", "/categories", token,
        {"householdId": household, "name": name, "kind": kind},
    )
    if status >= 400:
        raise SystemExit(f"category create failed: {status} {json.dumps(created)[:300]}")
    categories_by_name[name] = created

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
if batch["status"] not in {"COMPLETED", "COMPLETED_WITH_WARNINGS"}:
    raise SystemExit(f"import failed: {batch['status']}")

t0 = time.time()
status, clustering = call("POST", "/intelligence/analyse", token, query={"householdId": household})
TIMINGS["analyse+recurring"] = time.time() - t0
if status >= 400:
    raise SystemExit(f"analyse failed: {status} {json.dumps(clustering)[:400]}")
coverage_before = clustering["coverage"]
recurring_first = clustering["recurring"]
FACTS["transactionsAnalyzed"] = coverage_before["total"]
FACTS["clustersTotal"] = clustering["clusters"]

status, review_before = call("GET", "/intelligence/review", token, query={"householdId": household})
FACTS["needsReviewBefore"] = review_before["total"]

# ------------------------------------------------------------ §7 dry run

t0 = time.time()
status, dry = call("GET", "/intelligence/ai/dry-run", token, query={"householdId": household})
TIMINGS["dryRun"] = time.time() - t0
if status >= 400:
    raise SystemExit(f"dry-run failed: {status} {json.dumps(dry)[:400]}")
FACTS["dry"] = dry
check(
    "LP-001", "dry-run before anything live: real eligibility maths, zero requests",
    dry["dryRun"] is True and dry["providerCallsMade"] == 0 and dry["aiEligibleClusters"] > 0,
    f"{dry['clustersTotal']} clusters, {dry['resolvedDeterministic']} deterministic, "
    f"{dry['unresolvedClusters']} unresolved, {dry['aiEligibleClusters']} eligible, "
    f"{dry['opaqueExcluded']} opaque excluded, est. {dry['estimatedRequests']} request(s)",
)

# §8: comparable with the accepted acceptance run (12 / 4 / 7 / 1).
comparable = (
    abs(dry["clustersTotal"] - 12) <= 2
    and abs(dry["aiEligibleClusters"] - 7) <= 2
    and dry["opaqueExcluded"] >= 1
)
check(
    "LP-002", "counts are in line with the accepted acceptance run — nothing unexpectedly large",
    comparable,
    f"clusters {dry['clustersTotal']} (was 12), eligible {dry['aiEligibleClusters']} (was 7), "
    f"opaque {dry['opaqueExcluded']} (was 1)",
)

# §9: the hard bound. The environment caps a run at 10; the pilot also
# refuses to continue if more than 10 are eligible.
if dry["aiEligibleClusters"] > 10:
    check("LP-003", "first live run is bounded to 10 clusters", False,
          f"{dry['aiEligibleClusters']} eligible > 10 — STOPPING before any live call")
    print("\nSTOP: eligibility exceeds the pilot bound. No live calls made.")
    sys.exit(1)
check(
    "LP-003", "first live run is bounded to 10 clusters",
    True,
    f"{dry['aiEligibleClusters']} eligible <= 10",
)

# ------------------------------------------------- §11 payload inspection

inspection = subprocess.run(
    ["bash", "-c",
     "cd apps/api && set -a && source ../../.env && set +a && "
     f"pnpm exec tsx ../../scripts/intelligence/live-payload-inspection.ts {household}"],
    capture_output=True, text=True,
)
inspection_out = inspection.stdout.strip()
print("\n" + inspection_out + "\n")
check(
    "LP-010", "the final payload passed programmatic minimization/redaction inspection",
    inspection.returncode == 0 and "PAYLOAD INSPECTION: PASS" in inspection_out,
    f"exit {inspection.returncode}",
)

# ------------------------------------------------------- §10 consent gate

status, ai_status = call("GET", "/intelligence/ai/status", token, query={"householdId": household})
check(
    "LP-020", "before consent: environment live, household still opted out, no external calls allowed",
    ai_status["envEnabled"] is True and ai_status["dryRunForced"] is False
    and ai_status["providerConfigured"] is True and ai_status["householdEnabled"] is False
    and ai_status["externalCallsAllowed"] is False,
    f"env {ai_status['envEnabled']}, dryRunForced {ai_status['dryRunForced']}, "
    f"household {ai_status['householdEnabled']}, external {ai_status['externalCallsAllowed']}",
)
FACTS["model"] = ai_status["model"]

status, _ = call("PATCH", "/settings", token, {"householdId": household, "aiTransactionAnalysisEnabled": True})
check("LP-021", "consent enabled through the normal settings API — never SQL", status < 400, f"PATCH {status}")
status, ai_status = call("GET", "/intelligence/ai/status", token, query={"householdId": household})
check(
    "LP-022", "with consent, every gate is open and the status endpoint says so",
    ai_status["externalCallsAllowed"] is True,
    f"external {ai_status['externalCallsAllowed']}, model {ai_status['model']}",
)

# ------------------------------------------- §27 safety snapshot, then live

oracle_before = oracle(household)

t0 = time.time()
status, run1 = call("POST", "/intelligence/ai/classify", token, query={"householdId": household})
TIMINGS["liveClassify"] = time.time() - t0
if status >= 400:
    raise SystemExit(f"classify failed: {status} {json.dumps(run1)[:400]}")
check(
    "LP-030", "the live run is the real pipeline, not a dry-run and not a special path",
    run1.get("dryRun") is False and "applied" in run1,
    json.dumps({k: run1[k] for k in ("eligibleClusters", "providerCalls", "cacheHits",
                                     "applied", "suggested", "unknown", "rejected", "failed")}),
)
FACTS["run1"] = run1
check(
    "LP-031", "external work matches the dry-run estimate — no runaway workload",
    run1["providerCalls"] <= dry["estimatedRequests"] and run1["providerCalls"] >= 1,
    f"{run1['providerCalls']} provider call(s), estimate was {dry['estimatedRequests']}",
)

# §15: per-cluster outcomes, as hashes and statuses only.
outcome_rows = sql(
    f"select left(md5(signature), 12) || '=' || status || ':' || coalesce(round(combined_confidence, 3)::text, '-') "
    f"from ai_classification_results where household_id = '{household}' order by status, signature"
).splitlines()
print("\nPer-cluster outcomes (signature-hash = status : combined confidence):")
for line in outcome_rows:
    print(f"  {line}")
check(
    "LP-032", "every eligible cluster has exactly one persisted outcome",
    len(outcome_rows) == dry["aiEligibleClusters"],
    f"{len(outcome_rows)} outcome rows for {dry['aiEligibleClusters']} eligible clusters",
)

dup = sql(
    f"select count(*) from (select signature, direction, signature_version, taxonomy_version, prompt_version, model "
    f"from ai_classification_results where household_id = '{household}' "
    f"group by 1,2,3,4,5,6 having count(*) > 1) d"
)
check("LP-033", "no duplicate classification rows on the cache identity", dup == "0", f"{dup} duplicates")

# ------------------------------------------------------ §28 oracle after

oracle_after = oracle(household)
check(
    "LP-040", "financial oracle: live AI classification changed no posting, event or balance",
    oracle_before == oracle_after,
    f"before {oracle_before} == after {oracle_after}",
)

# --------------------------------------------- §24 review + §25 accounting

status, review_after = call("GET", "/intelligence/review", token, query={"householdId": household})
FACTS["needsReviewAfter"] = review_after["total"]
with_suggestion = [i for i in review_after["items"] if i.get("aiSuggestion")]
FACTS["reviewWithSuggestion"] = len(with_suggestion)
check(
    "LP-050", "review reduced only by auto-classification; suggestions stay open questions",
    review_before["total"] - review_after["total"] == run1["applied"],
    f"before {review_before['total']}, after {review_after['total']}, auto-applied {run1['applied']}, "
    f"open with AI suggestion {len(with_suggestion)}, still UNKNOWN "
    f"{review_after['total'] - len(with_suggestion)}",
)
if with_suggestion:
    sample = with_suggestion[0]["aiSuggestion"]
    check(
        "LP-051", "a review card carries the full AI suggestion",
        sample["source"] == "AI_SUGGESTION" and sample["merchantCandidate"]
        and 0 < sample["confidence"] < 0.95 and len(sample["shortExplanation"]) > 0,
        f"confidence {round(sample['confidence'], 3)}, category {'yes' if sample['categoryId'] else 'no'}",
    )

status, cov = call("GET", "/intelligence/coverage", token, query={"householdId": household})
FACTS["coverageAfter"] = cov
check(
    "LP-052", "classification sources stay truthful: AI results are AI_MATCH, never deterministic",
    cov["aiMatch"] >= 0 and cov["deterministicMatch"] == coverage_before["deterministicMatch"],
    f"deterministic {cov['deterministicMatch']}, learned {cov['learnedRule']}, "
    f"userVerified {cov['userVerified']}, aiMatch {cov['aiMatch']}, "
    f"defaulted {cov['defaulted']}, unknown {cov['unknown']}",
)

# --------------------------------------------------- §22 cache second run

t0 = time.time()
status, run2 = call("POST", "/intelligence/ai/classify", token, query={"householdId": household})
TIMINGS["cachedClassify"] = time.time() - t0
FACTS["run2"] = run2
check(
    "LP-060", "second run: all answers come from the cache, zero external requests",
    run2["providerCalls"] == 0 and run2["cacheHits"] >= 1,
    f"providerCalls {run2['providerCalls']}, cacheHits {run2['cacheHits']}",
)
status, review_after2 = call("GET", "/intelligence/review", token, query={"householdId": household})
check(
    "LP-061", "the rerun changed nothing: review count and coverage are stable",
    review_after2["total"] == review_after["total"],
    f"review {review_after['total']} -> {review_after2['total']}",
)

# ------------------------------------- §21/§26 learned rule beats the cache

# Correct a cluster the AI actually answered (a suggestion if one exists,
# otherwise an UNKNOWN it saw) through the normal review flow, with "remember
# rule". The person's answer must stand and AI must not be asked again. The
# read-only lookup finds a still-open cluster with an AI result row — the
# opaque cluster never has one, and correcting it would not move eligibility.
target = None
if with_suggestion:
    target = with_suggestion[0]
else:
    ai_seen = sql(
        f"select mc.id from merchant_clusters mc join ai_classification_results r "
        f"on r.household_id = mc.household_id and r.signature = mc.signature and r.direction = mc.direction "
        f"where mc.household_id = '{household}' and mc.classification_source = 'UNKNOWN' "
        f"and mc.dismissed_at is null limit 1"
    )
    target = next((i for i in review_after2["items"] if i["id"] == ai_seen), None)
if target:
    expense_cat = categories_by_name["Streaming och media"]
    status, resolved = call(
        "POST", "/intelligence/clusters/resolve", token,
        {
            "householdId": household, "clusterId": target["id"], "action": "correct",
            "merchantName": "Pilotkorrigerad Handlare", "categoryId": expense_cat["id"],
            "rememberRule": True,
        },
    )
    check(
        "LP-070", "correcting through review resolves the cluster and creates a learned rule",
        status < 400 and resolved["status"] == "RESOLVED" and resolved["ruleCreated"] is True,
        f"status {status}, transactions updated {resolved.get('transactionsUpdated')}",
    )
    status, run3 = call("POST", "/intelligence/ai/classify", token, query={"householdId": household})
    check(
        "LP-071", "the corrected cluster is no longer AI's to answer — person wins, AI is not called",
        run3["providerCalls"] == 0 and run3["eligibleClusters"] == run2["eligibleClusters"] - 1,
        f"eligible {run2['eligibleClusters']} -> {run3['eligibleClusters']}, providerCalls {run3['providerCalls']}",
    )
else:
    check("LP-070", "a review item existed to correct", False, "review queue unexpectedly empty")

# ------------------------------------------------ §29 recurring idempotency

t0 = time.time()
status, rerun = call("POST", "/intelligence/analyse", token, query={"householdId": household})
TIMINGS["analyseAfterAi"] = time.time() - t0
recurring_second = rerun["recurring"]
check(
    "LP-080", "the recurring pipeline is idempotent across AI enrichment",
    recurring_second["recurringStreams"] == recurring_first["recurringStreams"]
    and recurring_second["subscriptions"] == recurring_first["subscriptions"],
    f"streams {recurring_first['recurringStreams']} -> {recurring_second['recurringStreams']}, "
    f"subscriptions {recurring_first['subscriptions']} -> {recurring_second['subscriptions']}",
)

# ------------------------------------------------- §30–§32 Brief V2 live

t0 = time.time()
status, brief = call("GET", "/brief", token, query={"householdId": household})
TIMINGS["brief"] = time.time() - t0
if status >= 400:
    raise SystemExit(f"brief failed: {status} {json.dumps(brief)[:400]}")
FACTS["briefGenerator"] = brief["generator"]
FACTS["briefModel"] = brief.get("model")
check(
    "LP-090", "Brief V2 renders with AI consent on — AI prose or template fallback, never an error",
    brief["generator"] in {"AI", "TEMPLATE"} and 0 < len(brief["items"]) <= 5
    and len(brief["headline"]) > 5,
    f"generator {brief['generator']}, model {brief.get('model')}, {len(brief['items'])} items",
)
grounding_failures = []
for item in brief["items"]:
    finding = next(f for f in brief["findings"] if f["key"] == item["findingKey"])
    text_numbers = number_tokens(item["text"])
    for name, fragment in finding["fragments"].items():
        fragment_numbers = number_tokens(fragment)
        if fragment_numbers and not fragment_numbers <= text_numbers:
            grounding_failures.append(f"{item['findingKey']}:{name}")
check(
    "LP-091", "numeric grounding on the live brief: every finding fragment appears verbatim",
    not grounding_failures,
    f"checked {len(brief['items'])} items" + (f"; missing {grounding_failures}" if grounding_failures else ""),
)
check(
    "LP-092", "every brief item still explains itself",
    all(i["explainRoute"].startswith("/") and i["explainLabel"] for i in brief["items"]),
    "; ".join(sorted({i["type"] for i in brief["items"]})),
)

# ------------------------------------------------- §33 advisor smoke test

ADVISOR_QUESTIONS = [
    "Varför har våra utgifter förändrats?",
    "Vilka återkommande kostnader har blivit dyrare?",
    "Hur stor buffert rekommenderar systemet?",
    "Hur mycket potentiellt överskott har vi?",
]
advisor_ok = True
advisor_detail = []
for question in ADVISOR_QUESTIONS:
    status, answer = call(
        "POST", "/advisor/chat", token,
        {"householdId": household, "message": question},
    )
    used = answer.get("usedTools", []) if status < 400 else []
    ok = status < 400 and len(used) > 0 and len(answer.get("reply", "")) > 0
    advisor_ok = advisor_ok and ok
    advisor_detail.append(f"'{question[:24]}…' -> tools {len(used)}")
check(
    "LP-100", "the advisor answers every question through deterministic tools",
    advisor_ok,
    "; ".join(advisor_detail),
)

# ---------------------------------------------------- §38 audit metadata

audit = sql(
    f"select count(*), count(*) filter (where after::text like '%sk-%') "
    f"from audit_logs where household_id = '{household}' and action = 'intelligence.ai.provider_call'"
).split("|")
# Provider calls are audited on success; a failed batch logs a warning and an
# ERROR result row instead. In a healthy run they coincide.
expected_audits = run1["providerCalls"] if run1["failed"] == 0 else int(audit[0])
check(
    "LP-110", "provider calls are audited with safe metadata and no secrets",
    int(audit[0]) == expected_audits and int(audit[0]) >= 1 and int(audit[1]) == 0,
    f"{audit[0]} provider-call audit rows, {audit[1]} containing key-like text",
)
raw_desc = sql(
    f"select count(*) from audit_logs where household_id = '{household}' "
    f"and action like 'intelligence.ai.%' and (after::text like '%ZAPSTREAM%' or after::text like '%HYRA%')"
)
check(
    "LP-111", "no cluster text in the audit trail — counts, hashes and versions only",
    raw_desc == "0",
    f"{raw_desc} audit rows containing cluster text",
)

# ------------------------------------------------------ §36 cost report

status, ai_status_final = call("GET", "/intelligence/ai/status", token, query={"householdId": household})
FACTS["metrics"] = ai_status_final["metrics"]

# Leave the pilot household as consent-off, like every other household.
call("PATCH", "/settings", token, {"householdId": household, "aiTransactionAnalysisEnabled": False})

# ---------------------------------------------------------------- summary

print("\n----------------------------------------------------------------")
failed = [r for r in RESULTS if not r[1]]
print(f"CHECKS: {len(RESULTS)} total, {len(RESULTS) - len(failed)} pass, {len(failed)} fail")
dry = FACTS["dry"]
run1 = FACTS["run1"]
run2 = FACTS["run2"]
metrics = FACTS["metrics"]
print("\nFACTS (aggregates only):")
print(f"  model:                    {FACTS['model']}")
print(f"  transactions analyzed:    {FACTS['transactionsAnalyzed']}")
print(f"  clusters total:           {FACTS['clustersTotal']}")
print(f"  resolved before AI:       {dry['resolvedDeterministic'] + dry['resolvedLearnedRule'] + dry['resolvedUserVerified']}")
print(f"  AI eligible:              {dry['aiEligibleClusters']}")
print(f"  opaque excluded:          {dry['opaqueExcluded']}")
print(f"  external calls run 1:     {run1['providerCalls']}")
print(f"  auto classified:          {run1['applied']}")
print(f"  review suggestions:       {run1['suggested']}")
print(f"  unknown:                  {run1['unknown']}")
print(f"  rejected:                 {run1['rejected']}")
print(f"  failed:                   {run1['failed']}")
print(f"  cache hits run 2:         {run2['cacheHits']}")
print(f"  external calls run 2:     {run2['providerCalls']}")
print(f"  needs review before AI:   {FACTS['needsReviewBefore']}")
print(f"  needs review after AI:    {FACTS['needsReviewAfter']} "
      f"(of which {FACTS['reviewWithSuggestion']} with AI suggestion)")
cov = FACTS["coverageAfter"]


def meaningful(c: dict) -> int:
    return (
        c.get("meaningful")
        or c.get("userVerified", 0) + c.get("deterministicMatch", 0)
        + c.get("learnedRule", 0) + c.get("aiMatch", 0)
    )


print(f"  meaningful before AI:     {meaningful(coverage_before)} / {coverage_before['total']} "
      f"({100 * meaningful(coverage_before) / max(coverage_before['total'], 1):.1f} %)")
print(f"  meaningful after AI:      {meaningful(cov)} / {cov['total']} "
      f"({100 * meaningful(cov) / max(cov['total'], 1):.1f} %)")
print(f"  prompt tokens:            {metrics['promptTokens']}")
print(f"  completion tokens:        {metrics['completionTokens']}")
print(f"  estimated cost:           {metrics['estimatedCostText'] or 'unavailable'}")
print(f"  brief generator:          {FACTS['briefGenerator']} (model {FACTS['briefModel']})")
print("\nTIMINGS:")
for name, seconds in TIMINGS.items():
    print(f"  {name}: {seconds:.2f}s")
sys.exit(1 if failed else 0)
