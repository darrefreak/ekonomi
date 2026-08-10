/**
 * Telling storage failures apart.
 *
 * An erasure may only report success when the store that holds an object says
 * the object is gone. The previous code asked that question with "did we get a
 * 404?", and a 404 is what S3 returns both when the key is missing and when the
 * whole bucket is missing — so a household's documents survived an erasure that
 * reported `completed` (FIR-001).
 *
 * The shapes below were read off MinIO rather than assumed
 * (`error-shapes.probe.ts`), and one of them is the reason this module exists:
 *
 *   HeadObject, bucket exists, key absent  → name "NotFound",       404, no Code
 *   HeadObject, bucket absent              → name "NotFound",       404, no Code
 *   HeadObject, bad credentials            → name "Unknown",        403, no Code
 *   DeleteObject, bucket exists, key absent→ 204, no error at all
 *   DeleteObject, bucket absent            → name/Code "NoSuchBucket", 404
 *   DeleteObject, bad credentials          → Code "InvalidAccessKeyId", 403
 *
 * A HEAD response carries no body, so the S3 error code is not available and
 * the first two rows are indistinguishable. That is why absence of an object is
 * never concluded from a HEAD alone: the bucket is established first, with a
 * request whose 404 can only mean one thing.
 */

export type StorageErrorKind =
  | "OBJECT_NOT_FOUND"
  | "BUCKET_NOT_FOUND"
  | "ACCESS_DENIED"
  | "BACKEND_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN_STORAGE_ERROR";

/**
 * What the failing request was asking about. A 404 is only interpretable in
 * context: from a bucket-level request it means the bucket is gone; from an
 * object-level request it means the key is gone — and the caller must already
 * have established that the bucket exists before it may believe that.
 */
export type StorageProbeSubject = "bucket" | "object";

const ACCESS_DENIED_CODES = new Set([
  "AccessDenied",
  "AllAccessDisabled",
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "ExpiredToken",
  "InvalidToken",
  "AccountProblem",
  "CredentialsProviderError",
]);

const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "NetworkingError",
  "InternalError",
  "ServiceUnavailable",
  "SlowDown",
]);

const TIMEOUT_CODES = new Set([
  "TimeoutError",
  "RequestTimeout",
  "RequestTimeTooSkewed",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
]);

type SdkErrorish = {
  name?: string;
  message?: string;
  code?: string;
  Code?: string;
  $metadata?: { httpStatusCode?: number };
  cause?: unknown;
};

function fieldsOf(err: unknown): {
  name: string;
  code: string;
  status: number | undefined;
  message: string;
} {
  const error = (err ?? {}) as SdkErrorish;
  return {
    name: String(error.name ?? ""),
    // `Code` is the S3 error code from the response body; `code` is the Node
    // syscall code. Either may be present, never both.
    code: String(error.Code ?? error.code ?? ""),
    status: error.$metadata?.httpStatusCode,
    message: String(error.message ?? ""),
  };
}

/**
 * Classify a storage failure.
 *
 * Explicit codes win, because they come from the service and say exactly what
 * went wrong. Only when no code is available does the HTTP status get read, and
 * then strictly in the context of what was being asked.
 */
export function classifyStorageError(
  err: unknown,
  subject: StorageProbeSubject,
): StorageErrorKind {
  const { name, code, status, message } = fieldsOf(err);
  const named = code || name;

  if (named === "NoSuchBucket") return "BUCKET_NOT_FOUND";
  if (named === "NoSuchKey") return "OBJECT_NOT_FOUND";
  if (ACCESS_DENIED_CODES.has(named)) return "ACCESS_DENIED";
  if (TIMEOUT_CODES.has(named)) return "TIMEOUT";
  if (UNAVAILABLE_CODES.has(named)) return "BACKEND_UNAVAILABLE";

  // Nested transport failures: the SDK wraps the socket error.
  const cause = (err as SdkErrorish)?.cause;
  if (cause && cause !== err) {
    const nested = fieldsOf(cause);
    const nestedName = nested.code || nested.name;
    if (TIMEOUT_CODES.has(nestedName)) return "TIMEOUT";
    if (UNAVAILABLE_CODES.has(nestedName)) return "BACKEND_UNAVAILABLE";
  }

  if (status === 403) return "ACCESS_DENIED";
  if (status === 408) return "TIMEOUT";
  if (status !== undefined && status >= 500) return "BACKEND_UNAVAILABLE";

  if (status === 404 || name === "NotFound") {
    // The only place a bare 404 is allowed to mean anything, and it means
    // whatever the request was about.
    return subject === "bucket" ? "BUCKET_NOT_FOUND" : "OBJECT_NOT_FOUND";
  }

  // No HTTP status at all: the request never reached a service.
  if (status === undefined && /timeout|timed out/i.test(message)) return "TIMEOUT";
  if (status === undefined) return "BACKEND_UNAVAILABLE";

  return "UNKNOWN_STORAGE_ERROR";
}

/**
 * True only when the backend confirmed that *this key* is absent from a bucket
 * that exists. Every other failure — including a missing bucket — is false.
 */
export function isObjectAbsence(kind: StorageErrorKind): boolean {
  return kind === "OBJECT_NOT_FOUND";
}

export function describeStorageError(kind: StorageErrorKind): string {
  switch (kind) {
    case "OBJECT_NOT_FOUND":
      return "the object is not in the bucket";
    case "BUCKET_NOT_FOUND":
      return "the bucket recorded for this object does not exist";
    case "ACCESS_DENIED":
      return "the credentials are not allowed to read or delete it";
    case "BACKEND_UNAVAILABLE":
      return "the object store did not answer";
    case "TIMEOUT":
      return "the object store timed out";
    default:
      return "the object store returned an error that could not be classified";
  }
}
