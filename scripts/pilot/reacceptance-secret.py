#!/usr/bin/env python3
"""Final targeted pilot re-acceptance: attacking the production secret guard.

`production-secret.py` feeds the guard the exact placeholder the repository
publishes. A deployment that is careless rather than malicious will not use that
exact string — it will rename it, upper-case it, pad it, or reach for something
long but predictable. This probe boots a real production process for each of
those, and also checks the two "should start" cases so the guard is not merely
refusing everything.

Usage:
    python3 scripts/pilot/reacceptance-secret.py
"""

import secrets
import subprocess
import sys
import uuid

RESULTS: list[tuple[str, bool, str, str]] = []


def check(ident: str, claim: str, ok: bool, detail: str) -> None:
    RESULTS.append((ident, ok, claim, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {ident} {claim}: {detail}")


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
    # Stated rather than inherited: Compose interpolates from the calling shell
    # first, so a shell that has sourced `.env.test` would supply a placeholder
    # here and every "should start" case would fail for the wrong reason.
    "JWT_REFRESH_SECRET": secrets.token_urlsafe(48),
}


def boot(env: dict[str, str], timeout: int = 90):
    """Boot the API image once and report (exit code, output).

    The throwaway container carries its own name so that cleaning it up cannot
    touch the development stack's own `api` container — `docker compose rm api`
    would stop the service the rest of this suite is talking to.
    """
    name = f"ffos-reacceptance-secret-{uuid.uuid4().hex[:8]}"
    args = ["docker", "compose", "run", "--rm", "-T", "--no-deps", "--name", name]
    for key, value in env.items():
        args += ["-e", f"{key}={value}"]
    args += ["api", "node", "apps/api/dist/main.js"]
    try:
        done = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return done.returncode, done.stdout + done.stderr
    except subprocess.TimeoutExpired as expired:
        raw = (expired.stdout or b"") + (expired.stderr or b"")
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        # Still running when the clock ran out means it started, which is the
        # outcome under test for the "should start" cases.
        return 0, raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)


def must_refuse(ident: str, claim: str, secret: str, note: str) -> None:
    env = dict(PRODUCTION_BASE)
    env["JWT_ACCESS_SECRET"] = secret
    code, output = boot(env)
    refused = code != 0
    leaked = secret in output
    check(
        ident,
        claim,
        refused and not leaked,
        f"{note} → exit {code}, secret echoed into logs: {leaked}",
    )


# --- Variants of the published placeholder ------------------------------------

must_refuse(
    "RA-201",
    "an upper-cased copy of the published placeholder is still refused",
    "DEV-ACCESS-SECRET-CHANGE-ME",
    "DEV-ACCESS-SECRET-CHANGE-ME",
)

must_refuse(
    "RA-202",
    "the published placeholder with a production suffix is still refused",
    "dev-access-secret-change-me-production-2026",
    "dev-access-secret-change-me-production-2026",
)

must_refuse(
    "RA-203",
    "a renamed default that still says what it is gets refused",
    "ffos-access-secret-changeme-abcdefghijklmnop",
    "ffos-access-secret-changeme-…",
)

# --- Long but predictable ------------------------------------------------------

must_refuse(
    "RA-204",
    "a long single-character secret is refused however long it is",
    "a" * 64,
    "64 × 'a'",
)

must_refuse(
    "RA-205",
    "a long low-variety secret is refused",
    "abab" * 16,
    "'abab' × 16",
)

must_refuse(
    "RA-206",
    "a long run of digits is refused",
    "0123456789" * 4,
    "'0123456789' × 4",
)

must_refuse(
    "RA-207",
    "a secret that is only the word production repeated is refused",
    "production" * 5,
    "'production' × 5",
)

# --- The refresh secret, which is configured in the same place -----------------

env = dict(PRODUCTION_BASE)
env["JWT_ACCESS_SECRET"] = secrets.token_urlsafe(48)
env["JWT_REFRESH_SECRET"] = "dev-refresh-secret-change-me"
code, output = boot(env)
check(
    "RA-208",
    "a placeholder refresh secret is refused even though nothing signs with it",
    code != 0 and "JWT_REFRESH_SECRET" in output,
    f"exit {code}, refresh secret named in the refusal: {'JWT_REFRESH_SECRET' in output}",
)

# --- The guard must not simply refuse everything -------------------------------

env = dict(PRODUCTION_BASE)
env["JWT_ACCESS_SECRET"] = secrets.token_urlsafe(48)
code, output = boot(env, timeout=40)
check(
    "RA-209",
    "a generated secret is accepted, so the guard is discriminating rather than blanket",
    code == 0,
    f"openssl-grade random secret → exit {code}",
)

env = dict(PRODUCTION_BASE)
env["JWT_ACCESS_SECRET"] = subprocess.run(
    ["openssl", "rand", "-base64", "48"], capture_output=True, text=True
).stdout.strip()
code, output = boot(env, timeout=40)
check(
    "RA-210",
    "the exact command the documentation recommends produces an accepted secret",
    code == 0,
    f"openssl rand -base64 48 → exit {code}",
)

passed = sum(1 for _, ok, _, _ in RESULTS if ok)
print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
for ident, ok, claim, detail in RESULTS:
    if not ok:
        print(f"  FAILED: {ident} {claim} — {detail}")
sys.exit(0 if passed == len(RESULTS) else 1)
