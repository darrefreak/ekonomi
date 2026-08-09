#!/usr/bin/env python3
"""Erasure completes only after the owning store confirms the object is gone.

`reacceptance-adversarial.py` proved the old behaviour was false success: with
MinIO stopped the erasure said `completed`, removed the row holding the storage
key, and left the document in the bucket forever (FPR-003).

RA-404/RA-405 there test the outage in isolation and never retry, so they cannot
express the whole invariant. This probe does the full cycle the remediation
brief asks for:

    storage down   → erasure fails, object remains, locator remains, retryable
    storage back   → retry deletes the object and completes exactly once
    after success  → the sensitive marker is not in the bucket

The marker is the same personnummer pattern the re-acceptance used, searched for
in the authoritative bucket rather than through the product.

Usage:
    python3 scripts/pilot/erasure-invariant.py
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
from concurrent.futures import ThreadPoolExecutor

API = "http://localhost:3001/api/v1"
PG = ["docker", "exec", "ekonomi-postgres-1", "psql", "-U", "ffos", "-d", "ffos_dev", "-tAc"]
MINIO = "ekonomi-minio-1"
MARKER = "personnummer 19900101-1234"

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


def register(prefix: str):
    email = f"{prefix}-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
    _, body = call(
        "POST",
        "/auth/register",
        body={"email": email, "password": "ErasureInvariant123!", "displayName": prefix},
    )
    return body["tokens"]["accessToken"]


def minio(*args: str) -> str:
    return subprocess.run(
        ["docker", "exec", MINIO, "sh", "-lc", " ".join(args)],
        capture_output=True,
        text=True,
    ).stdout.strip()


def object_present(bucket: str, key: str) -> bool:
    return minio(f'test -e "/data/{bucket}/{key}" && echo present || echo gone') == "present"


def marker_present(bucket: str, key: str) -> bool:
    """Read the object's own bytes out of MinIO, not the product's view of it."""
    dumped = subprocess.run(
        ["docker", "exec", MINIO, "sh", "-lc", f'cat "/data/{bucket}/{key}/xl.meta" 2>/dev/null'],
        capture_output=True,
    ).stdout
    return MARKER.encode() in dumped


def stop_storage() -> None:
    subprocess.run(["docker", "stop", MINIO], capture_output=True)


def start_storage() -> None:
    subprocess.run(["docker", "start", MINIO], capture_output=True)
    for _ in range(40):
        health = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Health.Status}}", MINIO],
            capture_output=True,
            text=True,
        ).stdout.strip()
        if health == "healthy":
            return
        time.sleep(2)


def build_household(name: str):
    token = register("erasureinv")
    _, household = call("POST", "/households", token, {"name": name})
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
            "openingBalanceMinor": "1000000",
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    status, _ = call(
        "POST",
        "/documents/upload",
        token,
        {
            "householdId": hh,
            "title": "Kvitto",
            "filename": "kvitto.txt",
            "contentType": "text/plain",
            "contentBase64": base64.b64encode(MARKER.encode()).decode(),
        },
    )
    row = sql(
        "select coalesce(max(storage_key), '') || '|' || coalesce(max(bucket), '') "
        f"from documents where household_id = '{hh}'"
    )
    key, bucket = row.split("|")
    return token, hh, key, bucket, status


def main() -> int:
    name = "Raderingsinvariant"
    token, hh, key, bucket, upload_status = build_household(name)
    check(
        "ERI-001",
        "the household holds a document stored in the authoritative bucket",
        upload_status in (200, 201) and bucket != "" and object_present(bucket, key),
        f"upload → {upload_status}, bucket {bucket or 'none'}, object present: {object_present(bucket, key)}",
    )
    check(
        "ERI-002",
        "the stored object really contains the sensitive marker",
        marker_present(bucket, key),
        f"marker found in /data/{bucket}/{key}",
    )

    _, request = call(
        "POST",
        "/privacy/delete-request",
        token,
        {"householdId": hh, "kind": "delete_household", "note": "invariant"},
    )
    rid = request["id"]

    # --- storage down -----------------------------------------------------------
    stop_storage()
    try:
        status, body = call(
            "POST", f"/privacy/requests/{rid}/confirm", token, {"householdName": name}
        )
    finally:
        start_storage()

    reported = (body or {}).get("status") or ((body or {}).get("error") or {}).get("code")
    check(
        "ERI-003",
        "an erasure that cannot reach object storage refuses rather than reporting success",
        status >= 400 and (body or {}).get("status") != "completed",
        f"confirm → {status}, reported {reported}",
    )
    check(
        "ERI-004",
        "the request is left in a retryable state, not completed",
        sql(f"select status from privacy_requests where id = '{rid}'") == "failed",
        f"request status {sql(f'select status from privacy_requests where id = ' + chr(39) + rid + chr(39))}",
    )
    locator = sql(f"select count(*) from documents where storage_key = '{key}'")
    household_rows = sql(f"select count(*) from households where id = '{hh}'")
    check(
        "ERI-005",
        "the locator and the household survive a failed erasure, so a retry knows what to remove",
        locator == "1" and household_rows == "1",
        f"documents rows {locator}, household rows {household_rows}",
    )
    check(
        "ERI-006",
        "the object is still there — which is honest, because the erasure said it failed",
        object_present(bucket, key),
        f"object in {bucket}: {'present' if object_present(bucket, key) else 'gone'}",
    )
    check(
        "ERI-007",
        "a failed erasure removed no household data on its way out",
        sql(f"select count(*) from accounts where household_id = '{hh}'") != "0",
        f"accounts still present: {sql(f'select count(*) from accounts where household_id = ' + chr(39) + hh + chr(39))}",
    )

    # --- storage back -----------------------------------------------------------
    retry_status, retry_body = call(
        "POST", f"/privacy/requests/{rid}/confirm", token, {"householdName": name}
    )
    check(
        "ERI-008",
        "the retry after storage recovers completes the erasure",
        retry_status in (200, 201) and (retry_body or {}).get("status") == "completed",
        f"retry → {retry_status}, status {(retry_body or {}).get('status')}, "
        f"objectsRemoved {(retry_body or {}).get('objectsRemoved')}",
    )
    check(
        "ERI-009",
        "the retry counts one object because one object was confirmed gone",
        (retry_body or {}).get("objectsRemoved") == 1,
        f"objectsRemoved {(retry_body or {}).get('objectsRemoved')}",
    )
    check(
        "ERI-010",
        "the object is removed from the authoritative bucket",
        not object_present(bucket, key),
        f"object in {bucket}: {'present' if object_present(bucket, key) else 'gone'}",
    )
    check(
        "ERI-011",
        "the sensitive marker cannot be found in object storage afterwards",
        not marker_present(bucket, key),
        "marker absent from the bucket",
    )
    check(
        "ERI-012",
        "the household and its rows are gone once the erasure truly completed",
        sql(f"select count(*) from households where id = '{hh}'") == "0"
        and sql(f"select count(*) from documents where storage_key = '{key}'") == "0",
        "household rows 0, documents rows 0",
    )

    # --- concurrency on retry ----------------------------------------------------
    name2 = "Raderingsinvariant samtidig"
    token2, hh2, key2, bucket2, _ = build_household(name2)
    _, request2 = call(
        "POST",
        "/privacy/delete-request",
        token2,
        {"householdId": hh2, "kind": "delete_household", "note": "invariant"},
    )
    rid2 = request2["id"]
    stop_storage()
    try:
        call("POST", f"/privacy/requests/{rid2}/confirm", token2, {"householdName": name2})
    finally:
        start_storage()

    def retry(_):
        status, body = call(
            "POST", f"/privacy/requests/{rid2}/confirm", token2, {"householdName": name2}
        )
        return status, (body or {}).get("status")

    with ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(retry, range(6)))
    completed = [status for status, state in outcomes if state == "completed"]
    check(
        "ERI-013",
        "six simultaneous retries erase once and none of them invents a second object",
        sql(f"select count(*) from households where id = '{hh2}'") == "0"
        and not object_present(bucket2, key2)
        and len(completed) >= 1,
        f"outcomes {outcomes}, household rows "
        f"{sql(f'select count(*) from households where id = ' + chr(39) + hh2 + chr(39))}, "
        f"object {'present' if object_present(bucket2, key2) else 'gone'}",
    )
    check(
        "ERI-014",
        "exactly one completed erasure record remains for the retried request",
        sql(f"select count(*) from privacy_requests where id = '{rid2}'") == "1"
        and sql(f"select status from privacy_requests where id = '{rid2}'") == "completed",
        f"requests 1, status {sql(f'select status from privacy_requests where id = ' + chr(39) + rid2 + chr(39))}",
    )

    passed = sum(1 for _, ok, _, _ in RESULTS if ok)
    print(f"\nTOTAL {len(RESULTS)}  PASS {passed}  FAIL {len(RESULTS) - passed}")
    for ident, ok, claim, detail in RESULTS:
        if not ok:
            print(f"  FAILED: {ident} {claim} — {detail}")
    return 0 if passed == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
