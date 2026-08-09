#!/usr/bin/env python3
"""A production process must not start on a secret anyone can read (FPA-002).

`security-probe.py` checks the guard function and the running development
stack. This probe checks the thing that actually matters: whether a real
production-configured API process boots, and what it does with a forged token.

It boots the built image with `NODE_ENV=production` under a series of
configurations and records, for each, whether the process refused to start —
and then, on a correctly configured one, runs the token matrix from §14.
"""

import base64
import hashlib
import hmac
import json
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

RESULTS: list[tuple[str, bool, str, str]] = []
PLACEHOLDER = "dev-access-secret-change-me"
PORT = 3999
CONTAINER = "ffos-production-secret-probe"


def check(ident: str, claim: str, ok: bool, detail: str) -> None:
    RESULTS.append((ident, ok, claim, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {ident} {claim}: {detail}")


def compose_run(env: dict[str, str], timeout: int = 90):
    """Boot the API image once with the given environment; return (exit code, output)."""
    args = ["docker", "compose", "run", "--rm", "-T", "--no-deps"]
    for key, value in env.items():
        args += ["-e", f"{key}={value}"]
    args += ["api", "node", "apps/api/dist/main.js"]
    try:
        done = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return done.returncode, (done.stdout + done.stderr)
    except subprocess.TimeoutExpired as expired:
        out = (expired.stdout or b"") + (expired.stderr or b"")
        subprocess.run(["docker", "compose", "rm", "-f", "-s", "api"], capture_output=True)
        return None, out.decode(errors="replace") if isinstance(out, bytes) else str(out)


PRODUCTION_BASE = {
    "NODE_ENV": "production",
    "DATABASE_URL": "postgresql://ffos:ffos@postgres:5432/ffos_dev",
    "REDIS_URL": "redis://redis:6379",
    "CORS_ORIGIN": "https://app.example.se",
    "S3_ENDPOINT": "https://storage.example.se",
    "S3_ACCESS_KEY": "probe-access-key",
    "S3_SECRET_KEY": secrets.token_urlsafe(36),
    "S3_BUCKET": "ffos",
    "FFOS_RATE_LIMIT": "2000",
}


def refuses_to_start(ident: str, claim: str, overrides: dict[str, str], expect: str) -> None:
    env = dict(PRODUCTION_BASE)
    env.update(overrides)
    code, output = compose_run(env)
    refused = code is not None and code != 0
    mentions = expect.lower() in output.lower()
    leaked = PLACEHOLDER in output and "JWT_ACCESS_SECRET" not in output.split(PLACEHOLDER)[0][-80:]
    check(
        ident,
        claim,
        refused and mentions and not leaked,
        f"exit {code}, reason quoted: {mentions}, secret leaked into logs: {leaked}",
    )


# --- 1. Fail closed -----------------------------------------------------------

refuses_to_start(
    "PROD-001",
    "production refuses to start when the access secret is the published placeholder",
    {"JWT_ACCESS_SECRET": PLACEHOLDER},
    "known default",
)

refuses_to_start(
    "PROD-002",
    "production refuses to start when the access secret is missing",
    {"JWT_ACCESS_SECRET": ""},
    "not set",
)

refuses_to_start(
    "PROD-003",
    "production refuses to start when the access secret is too weak",
    {"JWT_ACCESS_SECRET": "short-secret"},
    "characters",
)

refuses_to_start(
    "PROD-004",
    "production refuses to start when the access secret is malformed",
    {"JWT_ACCESS_SECRET": f"  {secrets.token_urlsafe(40)}  "},
    "whitespace",
)

refuses_to_start(
    "PROD-005",
    "production refuses to start when a required service is unconfigured",
    {"JWT_ACCESS_SECRET": secrets.token_urlsafe(40), "DATABASE_URL": ""},
    "DATABASE_URL",
)

refuses_to_start(
    "PROD-006",
    "production refuses to start with destructive database resets enabled",
    {"JWT_ACCESS_SECRET": secrets.token_urlsafe(40), "FFOS_ALLOW_DB_RESET": "true"},
    "FFOS_ALLOW_DB_RESET",
)

# --- 2. A correctly configured production process ------------------------------

REAL_SECRET = secrets.token_urlsafe(48)


def start_production_api() -> bool:
    subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)
    env = dict(PRODUCTION_BASE)
    env.update({"JWT_ACCESS_SECRET": REAL_SECRET, "API_PORT": str(PORT), "CORS_ORIGIN": "https://app.example.se"})
    args = ["docker", "compose", "run", "-d", "--name", CONTAINER, "--no-deps", "-p", f"{PORT}:{PORT}"]
    for key, value in env.items():
        args += ["-e", f"{key}={value}"]
    args += ["api", "node", "apps/api/dist/main.js"]
    subprocess.run(args, capture_output=True, text=True)
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/health", timeout=5) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(2)
    return False


started = start_production_api()
check(
    "PROD-007",
    "a production process with a generated secret starts normally",
    started,
    "health endpoint answered" if started else "the process never became healthy",
)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def sign(payload: dict, secret: str, algorithm: str = "HS256") -> str:
    header = b64(json.dumps({"alg": algorithm, "typ": "JWT"}).encode())
    body = b64(json.dumps(payload).encode())
    signing_input = f"{header}.{body}".encode()
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{body}.{b64(signature)}"


def households_status(token: str) -> int:
    request = urllib.request.Request(
        f"http://localhost:{PORT}/api/v1/households", method="GET"
    )
    request.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:
        return 0


if started:
    now = int(time.time())
    claims = {
        "sub": str(uuid.uuid4()),
        "email": "attacker@example.com",
        "iat": now,
        "exp": now + 900,
    }

    forged = households_status(sign(claims, PLACEHOLDER))
    check(
        "PROD-008",
        "a token signed with the published placeholder is rejected",
        forged == 401,
        f"/households → {forged}",
    )

    wrong = households_status(sign(claims, secrets.token_urlsafe(48)))
    check(
        "PROD-009",
        "a token signed with some other strong secret is rejected",
        wrong == 401,
        f"/households → {wrong}",
    )

    valid = sign(claims, REAL_SECRET)
    head, body, signature = valid.split(".")
    tampered_payload = dict(claims)
    tampered_payload["sub"] = str(uuid.uuid4())
    tampered = households_status(
        f"{head}.{b64(json.dumps(tampered_payload).encode())}.{signature}"
    )
    check(
        "PROD-010",
        "a token whose payload was edited after signing is rejected",
        tampered == 401,
        f"/households → {tampered}",
    )

    expired = households_status(
        sign({**claims, "iat": now - 7200, "exp": now - 3600}, REAL_SECRET)
    )
    check(
        "PROD-011",
        "an expired token is rejected even though it is correctly signed",
        expired == 401,
        f"/households → {expired}",
    )

    none_alg = f"{b64(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())}.{b64(json.dumps(claims).encode())}."
    unsigned = households_status(none_alg)
    check(
        "PROD-012",
        'an unsigned "alg: none" token is rejected',
        unsigned == 401,
        f"/households → {unsigned}",
    )

    # A token the production instance issued itself, which is the only thing
    # that proves the configured secret is actually in use for real sessions.
    issued = ""
    try:
        request = urllib.request.Request(
            f"http://localhost:{PORT}/api/v1/auth/register",
            data=json.dumps(
                {
                    "email": f"prod-{uuid.uuid4().hex[:10]}@example.com",
                    "password": "ProductionSecret123!",
                    "displayName": "Prod",
                }
            ).encode(),
            method="POST",
        )
        request.add_header("content-type", "application/json")
        with urllib.request.urlopen(request, timeout=30) as response:
            issued = json.loads(response.read())["tokens"]["accessToken"]
    except Exception as error:  # noqa: BLE001 - reported as a failure below
        issued = ""
        print(f"       (registration against the production instance failed: {error})")

    accepted = households_status(issued) if issued else 0
    check(
        "PROD-013",
        "a session issued by the production-configured process works",
        accepted == 200,
        f"/households → {accepted}",
    )

    logs = subprocess.run(
        ["docker", "logs", CONTAINER], capture_output=True, text=True
    )
    output = logs.stdout + logs.stderr
    check(
        "PROD-014",
        "the running process never writes its signing secret to the logs",
        REAL_SECRET not in output,
        f"{len(output)} bytes of log inspected",
    )

subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)

passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
sys.exit(0 if passed == len(RESULTS) else 1)
