import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyStorageError,
  isObjectAbsence,
  type StorageErrorKind,
} from "./storage-errors";

/**
 * The classifier, fed the shapes MinIO actually returns.
 *
 * Every fixture here was copied from `error-shapes.probe.ts` output rather than
 * imagined, because the whole defect was an assumption about what a 404 means
 * (FIR-001). The two `NotFound` cases are the important ones: they are
 * byte-identical, and only the question being asked tells them apart.
 */

/** HeadObject against an existing bucket with no such key. */
const headObjectMissingKey = {
  name: "NotFound",
  message: "UnknownError",
  $metadata: { httpStatusCode: 404 },
};

/** HeadObject against a bucket that does not exist — indistinguishable. */
const headObjectMissingBucket = {
  name: "NotFound",
  message: "UnknownError",
  $metadata: { httpStatusCode: 404 },
};

/** DeleteObject against a bucket that does not exist. */
const deleteMissingBucket = {
  name: "NoSuchBucket",
  Code: "NoSuchBucket",
  message: "The specified bucket does not exist",
  $metadata: { httpStatusCode: 404 },
};

const deleteBadCredentials = {
  name: "InvalidAccessKeyId",
  Code: "InvalidAccessKeyId",
  message: "The Access Key Id you provided does not exist in our records.",
  $metadata: { httpStatusCode: 403 },
};

const headBadCredentials = {
  name: "Unknown",
  message: "UnknownError",
  $metadata: { httpStatusCode: 403 },
};

function expect(kind: StorageErrorKind, actual: StorageErrorKind, why: string) {
  assert.equal(actual, kind, why);
}

test("a missing bucket is never read as a missing object", () => {
  expect(
    "BUCKET_NOT_FOUND",
    classifyStorageError(deleteMissingBucket, "object"),
    "NoSuchBucket says so explicitly, whatever was being asked",
  );
  expect(
    "BUCKET_NOT_FOUND",
    classifyStorageError(deleteMissingBucket, "bucket"),
    "and the same from a bucket-level request",
  );
  assert.equal(
    isObjectAbsence(classifyStorageError(deleteMissingBucket, "object")),
    false,
    "this is the conflation that let a document survive its own erasure",
  );
});

test("a bare 404 means whatever the request was about", () => {
  expect(
    "OBJECT_NOT_FOUND",
    classifyStorageError(headObjectMissingKey, "object"),
    "asked about a key, in a bucket the caller has already established",
  );
  expect(
    "BUCKET_NOT_FOUND",
    classifyStorageError(headObjectMissingBucket, "bucket"),
    "the identical error, asked about a bucket",
  );
});

test("NoSuchKey is object absence however it arrives", () => {
  expect(
    "OBJECT_NOT_FOUND",
    classifyStorageError(
      { name: "NoSuchKey", Code: "NoSuchKey", $metadata: { httpStatusCode: 404 } },
      "object",
    ),
    "the explicit code",
  );
  assert.equal(isObjectAbsence("OBJECT_NOT_FOUND"), true);
});

test("permission failures are never absence", () => {
  expect("ACCESS_DENIED", classifyStorageError(deleteBadCredentials, "object"), "explicit code");
  expect("ACCESS_DENIED", classifyStorageError(headBadCredentials, "object"), "bare 403");
  expect(
    "ACCESS_DENIED",
    classifyStorageError(
      { name: "AccessDenied", Code: "AccessDenied", $metadata: { httpStatusCode: 403 } },
      "object",
    ),
    "AccessDenied",
  );
  for (const kind of ["ACCESS_DENIED", "BUCKET_NOT_FOUND", "BACKEND_UNAVAILABLE", "TIMEOUT"] as const) {
    assert.equal(isObjectAbsence(kind), false, `${kind} must not read as absence`);
  }
});

test("transport failures are unavailability, not absence", () => {
  for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"]) {
    expect(
      "BACKEND_UNAVAILABLE",
      classifyStorageError({ name: "Error", code, message: `getaddrinfo ${code} minio` }, "object"),
      code,
    );
  }
  expect(
    "BACKEND_UNAVAILABLE",
    classifyStorageError(
      { name: "Error", message: "socket hang up", cause: { code: "ECONNRESET" } },
      "object",
    ),
    "a transport failure wrapped by the SDK",
  );
  expect(
    "BACKEND_UNAVAILABLE",
    classifyStorageError({ name: "Error", message: "boom" }, "object"),
    "no HTTP status at all means the request never reached a service",
  );
});

test("timeouts are their own class", () => {
  expect(
    "TIMEOUT",
    classifyStorageError({ name: "TimeoutError", message: "timed out" }, "object"),
    "named",
  );
  expect(
    "TIMEOUT",
    classifyStorageError({ name: "Error", message: "Request timed out" }, "object"),
    "described",
  );
  expect(
    "TIMEOUT",
    classifyStorageError({ name: "Error", $metadata: { httpStatusCode: 408 } }, "object"),
    "408",
  );
});

test("server errors are unavailability", () => {
  for (const status of [500, 502, 503]) {
    expect(
      "BACKEND_UNAVAILABLE",
      classifyStorageError({ name: "Error", $metadata: { httpStatusCode: status } }, "object"),
      String(status),
    );
  }
});

test("anything else is unknown, and unknown is not absence", () => {
  const kind = classifyStorageError(
    { name: "WeirdThing", $metadata: { httpStatusCode: 418 } },
    "object",
  );
  expect("UNKNOWN_STORAGE_ERROR", kind, "418");
  assert.equal(isObjectAbsence(kind), false);
});
