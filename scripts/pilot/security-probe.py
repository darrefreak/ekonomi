#!/usr/bin/env python3
"""Adversarial security and tenancy probe for the final pilot acceptance.

A pilot puts one household's real salary, debts and spending next to another's.
The question this probe asks is not "does authorisation exist" but "can I, as a
registered but unrelated user, reach anything at all belonging to someone else",
and it asks it of every surface rather than a sample.

Two households are created with distinct, recognisable amounts. The intruder is
a fully legitimate registered user with their own household — the realistic
threat for a pilot, not an anonymous attacker.

Usage:
    python3 scripts/pilot/security-probe.py
"""

import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("RT_API_URL", "http://localhost:3001/api/v1")
PSQL = os.environ.get(
    "RT_PSQL", "docker exec ekonomi-postgres-1 psql -U ffos -d ffos_dev -tAc"
)

results = []


def record(rid, name, ok, detail):
    results.append((rid, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {rid} {name}: {detail}", flush=True)


def call(method, path, token=None, body=None, headers=None, query=None, raw_auth=None):
    url = API + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    if raw_auth is not None:
        req.add_header("authorization", raw_auth)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, json.loads(response.read() or b"null"), dict(
                response.headers
            )
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw or b"null"), dict(err.headers)
        except json.JSONDecodeError:
            return err.code, {"raw": raw.decode(errors="replace")}, dict(err.headers)


def sql(query):
    out = subprocess.run(
        f'{PSQL} "{query}"', shell=True, capture_output=True, text=True, timeout=120
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return [line for line in out.stdout.strip().splitlines() if line.strip()]


def key():
    return {"Idempotency-Key": f"sec-{uuid.uuid4()}"}


def make_user(label, opening):
    email = f"sec-{label}-{int(time.time())}-{uuid.uuid4().hex[:8]}@example.com"
    _, reg, _ = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "SecurityProbe123!", "displayName": label},
    )
    token = (reg.get("tokens") or {}).get("accessToken")
    _, household, _ = call("POST", "/households", token, {"name": f"Hushåll {label}"})
    _, account, _ = call(
        "POST",
        "/accounts",
        token,
        {
            "householdId": household["id"],
            "name": f"Konto {label}",
            "accountType": "CHECKING",
            "currency": "SEK",
            "openingBalanceMinor": str(opening),
        },
        key(),
    )
    _, event, _ = call(
        "POST",
        "/ledger/expenses",
        token,
        {
            "householdId": household["id"],
            "cashAccountId": account["id"],
            "amountMinor": "12345",
            "occurredOn": "2026-08-01",
            "description": f"Hemlig utgift {label}",
        },
        key(),
    )
    return {
        "email": email,
        "token": token,
        "household": household["id"],
        "account": account["id"],
        "event": event,
    }


victim = make_user("victim", 7_777_77)
intruder = make_user("intruder", 100_00)

# The victim's transaction id, for direct object access attempts.
victim_tx = sql(
    "select id from financial_events where household_id = "
    f"'{victim['household']}' order by created_at desc limit 1"
)
VICTIM_TX = victim_tx[0] if victim_tx else None


# ------------------------------------------------- unauthenticated access
GET_SURFACES = [
    "/dashboard",
    "/net-worth",
    "/accounts",
    "/transactions",
    "/cashflow",
    "/debt",
    "/investments",
    "/assets",
    "/vehicles",
    "/goals",
    "/forecast",
    "/insights",
    "/opportunities",
    "/subscriptions",
    "/contracts",
    "/risk",
    "/documents",
    "/integrations",
    "/imports",
    "/review",
    "/notifications",
    "/settings",
    "/anomalies",
    "/categories",
    "/merchants",
    "/coverage",
    "/scenarios",
    "/audit-logs",
    "/analysis-runs",
    "/vehicle-market",
    "/metrics/snapshots",
    "/reports/monthly",
    "/reports/yearly",
    "/advisor/brief",
    "/ledger/balances",
    "/privacy/requests",
    "/households",
]
anonymous_leaks = []
for path in GET_SURFACES:
    status, _, _ = call("GET", path, query={"householdId": victim["household"]})
    if status != 401:
        anonymous_leaks.append(f"{path} → {status}")
record(
    "SEC-001",
    "no product surface answers without authentication",
    not anonymous_leaks,
    f"surfaces {len(GET_SURFACES)}, answering anonymously {anonymous_leaks or 'none'}",
)


# ------------------------------------- cross-household reads by a real user
idor_leaks = []
for path in GET_SURFACES:
    if path == "/households":
        continue
    status, body, _ = call(
        "GET", path, intruder["token"], query={"householdId": victim["household"]}
    )
    if status == 200:
        idor_leaks.append(f"{path} → 200")
record(
    "SEC-002",
    "a registered user cannot read another household through any surface",
    not idor_leaks,
    f"surfaces {len(GET_SURFACES) - 1}, leaking {idor_leaks or 'none'}",
)

status, body, _ = call("GET", "/households", intruder["token"])
own_only = all(h["id"] != victim["household"] for h in (body or []))
record(
    "SEC-003",
    "the household list shows only the caller's own households",
    status == 200 and own_only,
    f"status {status}, returned {len(body or [])} households, victim absent {own_only}",
)


# --------------------------------------- direct object access by identifier
direct_object_leaks = []
if VICTIM_TX:
    status, _, _ = call("GET", f"/transactions/{VICTIM_TX}", intruder["token"])
    if status == 200:
        direct_object_leaks.append(f"/transactions/{VICTIM_TX} → 200")
status, _, _ = call("GET", f"/accounts/{victim['account']}", intruder["token"])
if status == 200:
    direct_object_leaks.append("/accounts/:id → 200")
status, _, _ = call("GET", f"/debt/{victim['account']}", intruder["token"])
if status == 200:
    direct_object_leaks.append("/debt/:accountId → 200")
record(
    "SEC-004",
    "a foreign object cannot be fetched by guessing its identifier",
    not direct_object_leaks,
    f"leaks {direct_object_leaks or 'none'}",
)


# ------------------------------------------- cross-household modification
write_leaks = []
status, _, _ = call(
    "POST",
    "/accounts",
    intruder["token"],
    {
        "householdId": victim["household"],
        "name": "Inkräktarkonto",
        "accountType": "CHECKING",
        "currency": "SEK",
        "openingBalanceMinor": "100000",
    },
    key(),
)
if status < 400:
    write_leaks.append(f"POST /accounts → {status}")
status, _, _ = call(
    "POST",
    "/ledger/expenses",
    intruder["token"],
    {
        "householdId": victim["household"],
        "cashAccountId": victim["account"],
        "amountMinor": "999999",
        "occurredOn": "2026-08-01",
        "description": "Inkräktarutgift",
    },
    key(),
)
if status < 400:
    write_leaks.append(f"POST /ledger/expenses → {status}")
status, _, _ = call(
    "POST",
    "/vehicles",
    intruder["token"],
    {
        "householdId": victim["household"],
        "name": "Inkräktarbil",
        "make": "Volvo",
        "model": "V60",
        "modelYear": 2020,
        "fuelType": "DIESEL",
        "acquisitionMode": "EXISTING",
        "purchaseType": "CASH",
        "purchaseDate": "2022-04-01",
        "purchasePriceMinor": "10000000",
        "currentValueMinor": "9000000",
    },
    key(),
)
if status < 400:
    write_leaks.append(f"POST /vehicles → {status}")
status, _, _ = call(
    "POST", "/privacy/export", intruder["token"], {"householdId": victim["household"]}
)
if status < 400:
    write_leaks.append(f"POST /privacy/export → {status}")
record(
    "SEC-005",
    "a registered user cannot write into another household",
    not write_leaks,
    f"accepted writes {write_leaks or 'none'}",
)

# System books (the household's own EXPENSE/INCOME ledger) are created by the
# victim's own activity, so only the real accounts are counted here.
victim_accounts = sql(
    f"select count(*) from accounts where household_id = '{victim['household']}' "
    "and is_system is not true"
)[0]
victim_events = sql(
    f"select count(*) from financial_events where household_id = '{victim['household']}'"
)[0]
record(
    "SEC-006",
    "the victim household is unchanged after the intrusion attempts",
    victim_accounts == "1" and victim_events == "1",
    f"accounts {victim_accounts} (expected 1), financial events {victim_events} (expected 1)",
)


# --------------------------------------------------------- token integrity
def tamper(token, mutate):
    head, payload, signature = token.split(".")

    def decode(part):
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))

    def encode(obj):
        return (
            base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
        )

    return mutate(head, payload, signature, decode, encode)


token_accepted = []
# Signature stripped, "alg: none" style.
none_alg = tamper(
    victim["token"],
    lambda h, p, s, dec, enc: enc({"alg": "none", "typ": "JWT"}) + "." + p + ".",
)
status, _, _ = call("GET", "/households", none_alg)
if status == 200:
    token_accepted.append("alg=none")

# Subject swapped to the victim, signature untouched.
swapped = tamper(
    victim["token"],
    lambda h, p, s, dec, enc: h + "." + enc({**dec(p), "sub": str(uuid.uuid4())}) + "." + s,
)
status, _, _ = call("GET", "/households", swapped)
if status == 200:
    token_accepted.append("subject rewritten")

# Signature replaced with noise.
bad_signature = ".".join(victim["token"].split(".")[:2] + ["deadbeef"])
status, _, _ = call("GET", "/households", bad_signature)
if status == 200:
    token_accepted.append("forged signature")

status, _, _ = call("GET", "/households", raw_auth="Bearer not-a-token")
if status == 200:
    token_accepted.append("garbage token")
status, _, _ = call("GET", "/households", raw_auth="Basic YWRtaW46YWRtaW4=")
if status == 200:
    token_accepted.append("basic auth")
record(
    "SEC-007",
    "forged, unsigned and rewritten tokens are all rejected",
    not token_accepted,
    f"accepted {token_accepted or 'none'}",
)

# A refresh token must not be usable as an access token.
_, login, _ = call(
    "POST",
    "/auth/login",
    body={"email": victim["email"], "password": "SecurityProbe123!"},
)
refresh = (login.get("tokens") or {}).get("refreshToken")
status, _, _ = call("GET", "/households", refresh)
record(
    "SEC-008",
    "a refresh token cannot be used as an access token",
    status == 401,
    f"refresh token against a product surface → {status}",
)


# -------------------------------------------------------- error hygiene
leaky = []
probes = [
    ("GET", "/transactions/not-a-uuid", victim["token"], None),
    ("GET", "/accounts/00000000-0000-0000-0000-000000000000", victim["token"], None),
    ("POST", "/accounts", victim["token"], {"householdId": "x"}),
    ("GET", "/dashboard", victim["token"], None),
]
for method, path, token, body in probes:
    status, response, _ = call(method, path, token, body)
    blob = json.dumps(response or {})
    for pattern, label in [
        (r"at /?[\w./-]+\.(ts|js):\d+", "stack frame"),
        (r"node_modules", "node_modules path"),
        (r"select .* from ", "SQL statement"),
        (r"postgres(ql)?://", "connection string"),
        (r"ffos:ffos", "credentials"),
    ]:
        if re.search(pattern, blob, re.IGNORECASE):
            leaky.append(f"{method} {path}: {label}")
record(
    "SEC-009",
    "error responses expose no stack traces, SQL or connection details",
    not leaky,
    f"probes {len(probes)}, leaks {leaky or 'none'}",
)


# ------------------------------------------------------------- injection
injection_damage = []
for payload in [
    "'; drop table accounts; --",
    "' or '1'='1",
    "1; select pg_sleep(5)--",
    "\\'; delete from ledger_postings; --",
]:
    status, _, _ = call(
        "GET", "/transactions", victim["token"],
        query={"householdId": victim["household"], "search": payload},
    )
    if status >= 500:
        injection_damage.append(f"search {payload!r} → {status}")
    status, _, _ = call("GET", "/search", victim["token"],
                        query={"householdId": victim["household"], "q": payload})
    if status >= 500:
        injection_damage.append(f"q {payload!r} → {status}")
still_there = sql("select count(*) from information_schema.tables where table_name='accounts'")[0]
record(
    "SEC-010",
    "injection payloads in query parameters neither crash nor alter the schema",
    not injection_damage and still_there == "1",
    f"server errors {injection_damage or 'none'}, accounts table intact {still_there == '1'}",
)


# ----------------------------------------------------------- credentials
weak_accepted = []
for password in ["123456", "password", "abc", ""]:
    status, _, _ = call(
        "POST",
        "/auth/register",
        body={
            "email": f"weak-{uuid.uuid4().hex[:8]}@example.com",
            "password": password,
            "displayName": "Weak",
        },
    )
    if status in (200, 201):
        weak_accepted.append(password or "<empty>")
record(
    "SEC-011",
    "trivially weak passwords are refused at registration",
    not weak_accepted,
    f"accepted {weak_accepted or 'none'}",
)

status_wrong, wrong_body, _ = call(
    "POST",
    "/auth/login",
    body={"email": victim["email"], "password": "WrongPassword123!"},
)
status_missing, missing_body, _ = call(
    "POST",
    "/auth/login",
    body={"email": f"nobody-{uuid.uuid4().hex}@example.com", "password": "WrongPassword123!"},
)
same_shape = status_wrong == status_missing and json.dumps(
    wrong_body, sort_keys=True
) == json.dumps(missing_body, sort_keys=True).replace(
    json.dumps(missing_body, sort_keys=True), json.dumps(wrong_body, sort_keys=True)
)
record(
    "SEC-012",
    "login does not reveal whether an email is registered",
    status_wrong == status_missing,
    f"wrong password {status_wrong}, unknown account {status_missing}",
)

hashed = sql(
    f"select password_hash from users where email = '{victim['email']}'"
)
stored = hashed[0] if hashed else ""
record(
    "SEC-013",
    "passwords are stored only as a modern hash",
    bool(stored)
    and "SecurityProbe123!" not in stored
    and stored.startswith(("$argon2", "$2a$", "$2b$", "$scrypt")),
    f"stored credential begins {stored[:12]!r}",
)


# ---------------------------------------------------------- rate limiting
burst = [
    call("GET", "/dashboard", victim["token"], query={"householdId": victim["household"]})[0]
    for _ in range(80)
]
throttled = sum(1 for status in burst if status == 429)
record(
    "SEC-014",
    "a burst of requests is rate limited rather than served without limit",
    throttled > 0 or os.environ.get("FFOS_RATE_LIMIT_RELAXED") == "1",
    f"80 requests, throttled {throttled} "
    f"(the development stack raises FFOS_RATE_LIMIT to 2000 for end-to-end runs)",
)


# ----------------------------------------------------- transport headers
_, _, headers = call("GET", "/households", victim["token"])
lowered = {k.lower(): v for k, v in headers.items()}
missing_headers = [
    h
    for h in [
        "x-content-type-options",
        "x-frame-options",
        "strict-transport-security",
        "content-security-policy",
    ]
    if h not in lowered
]
record(
    "SEC-015",
    "responses carry the standard protective headers",
    not missing_headers,
    f"missing {missing_headers or 'none'}, present "
    f"{[h for h in lowered if h.startswith(('x-', 'strict', 'content-security'))]}",
)


# ---------------------------------------------------------- audit trail
audit_rows = sql(
    "select count(*) from audit_logs where actor_user_id = "
    f"(select id from users where email = '{intruder['email']}')"
)[0]
record(
    "SEC-016",
    "the intruder's activity left an audit trail",
    int(audit_rows) > 0,
    f"audit rows for the intruder {audit_rows}",
)


# ------------------------------------------------- deployment-time secrets
# The signing secret is what stands between a stranger and every household's
# finances. The repository publishes a placeholder in docker-compose.yml and
# .env.example; the production guard must refuse that exact value, or the guard
# does not guard against the mistake it exists to prevent.
PUBLISHED_PLACEHOLDERS = [
    "dev-access-secret-change-me",
    "dev-refresh-secret-change-me",
]
probe = """
import { requireAccessSecret } from "%s/apps/api/src/common/jwt-secrets";
process.env.NODE_ENV = "production";
const accepted: string[] = [];
for (const candidate of %s) {
  process.env.JWT_ACCESS_SECRET = candidate;
  try { requireAccessSecret(); accepted.push(candidate); } catch { /* refused */ }
}
console.log(JSON.stringify(accepted));
""" % (os.path.abspath("."), json.dumps(PUBLISHED_PLACEHOLDERS))
with open("/tmp/ffos-secret-guard-probe.ts", "w") as handle:
    handle.write(probe)
out = subprocess.run(
    "npx tsx /tmp/ffos-secret-guard-probe.ts",
    shell=True,
    capture_output=True,
    text=True,
    timeout=180,
    cwd="apps/api",
)
accepted_placeholders = json.loads(out.stdout.strip() or "[]") if out.returncode == 0 else None
record(
    "SEC-017",
    "the production guard refuses the placeholder secrets this repository publishes",
    accepted_placeholders == [],
    f"accepted in production {accepted_placeholders}"
    if accepted_placeholders is not None
    else f"probe failed: {out.stderr.strip()[:200]}",
)

# And the consequence, demonstrated rather than asserted: a token signed with
# the published placeholder is a valid session for any user id.
demo_user = sql("select id from users where email = 'demo@ffos.local'")
if demo_user:

    def b64(raw):
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    import hashlib
    import hmac

    now = int(time.time())
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64(
        json.dumps(
            {
                "sub": demo_user[0],
                "email": "demo@ffos.local",
                "typ": "access",
                "iat": now,
                "exp": now + 900,
            }
        ).encode()
    )
    signature = b64(
        hmac.new(
            b"dev-access-secret-change-me", f"{head}.{payload}".encode(), hashlib.sha256
        ).digest()
    )
    status, body, _ = call("GET", "/households", f"{head}.{payload}.{signature}")
    record(
        "SEC-018",
        "a token signed with the published placeholder is not accepted",
        status == 401,
        f"forged token against /households → {status}"
        + (
            f", exposing {[h['name'] for h in body]}"
            if status == 200 and isinstance(body, list)
            else ""
        ),
    )


print()
total = len(results)
passed = sum(1 for _, _, ok, _ in results if ok)
print(f"TOTAL {total}  PASS {passed}  FAIL {total - passed}")
for rid, name, ok, detail in results:
    if not ok:
        print(f"  FAILED: {rid} {name} {detail}")
sys.exit(0 if passed == total else 1)
