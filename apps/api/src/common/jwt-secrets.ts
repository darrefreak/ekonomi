/**
 * Signing-secret validation.
 *
 * The previous guard checked only length, and this repository publishes a
 * 27-character placeholder, so a production deployment could start with a
 * secret anyone can read on GitHub — and a token signed with it was accepted
 * (FPA-002). Length alone cannot tell a strong secret from a famous one, so
 * both are checked, and known strings are rejected however long they are.
 */

const MIN_PRODUCTION_LENGTH = 32;
const MIN_DISTINCT_CHARACTERS = 12;

/**
 * Strings that must never sign a production token. These are the values this
 * repository ships, its documentation quotes, and the ones people reach for
 * when filling in a blank. Matching is case-insensitive.
 */
const FORBIDDEN_SECRETS = new Set(
  [
    // Shipped in docker-compose.yml and .env.example.
    "dev-access-secret-change-me",
    "dev-refresh-secret-change-me",
    // Shipped in .env.test.
    "test-access-secret",
    "test-refresh-secret",
    // The usual blanks.
    "changeme",
    "change-me",
    "secret",
    "jwtsecret",
    "jwt-secret",
    "mysecret",
    "supersecret",
    "topsecret",
    "password",
    "insecure",
    "development",
    "production",
    "example",
    "placeholder",
    "your-secret-here",
    "your-secret-key",
    "s3cr3t",
  ].map((value) => value.toLowerCase()),
);

/**
 * Shapes that give a placeholder away even when the exact string differs — a
 * deployment that renamed the default rather than replacing it.
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /change[-_ ]?me/i, reason: 'it still says "change me"' },
  { pattern: /^dev[-_]/i, reason: "it is a development placeholder" },
  { pattern: /^test[-_]/i, reason: "it is a test placeholder" },
  { pattern: /^local[-_]/i, reason: "it is a local placeholder" },
  { pattern: /^(your|my|the)[-_]/i, reason: "it is a documentation example" },
  { pattern: /placeholder/i, reason: "it is labelled a placeholder" },
  { pattern: /example/i, reason: "it is a documentation example" },
  { pattern: /insecure/i, reason: "it is labelled insecure" },
  { pattern: /^x{4,}$/i, reason: "it is filler" },
  { pattern: /^(.)\1+$/, reason: "it is a single repeated character" },
];

export class InsecureSecretError extends Error {
  constructor(variableName: string, reason: string) {
    super(
      `${variableName} is not usable in production because ${reason}. ` +
        `Generate one with: openssl rand -base64 48`,
    );
    this.name = "InsecureSecretError";
  }
}

function distinctCharacterCount(value: string): number {
  return new Set(value).size;
}

/**
 * Validate a secret for production use. Throws with a reason that never
 * includes the secret itself, because this message reaches the logs.
 */
export function assertProductionSecret(
  variableName: string,
  value: string | undefined,
): asserts value is string {
  if (!value || value.length === 0) {
    throw new InsecureSecretError(variableName, "it is not set");
  }
  if (value !== value.trim() || /\s/.test(value)) {
    throw new InsecureSecretError(
      variableName,
      "it contains whitespace, which usually means the value was quoted or wrapped by mistake",
    );
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new InsecureSecretError(variableName, "it contains control characters");
  }

  const normalised = value.toLowerCase();
  if (FORBIDDEN_SECRETS.has(normalised)) {
    throw new InsecureSecretError(
      variableName,
      "it is a known default published in this repository or its documentation",
    );
  }
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) {
      throw new InsecureSecretError(variableName, reason);
    }
  }

  // Length and variety are checked after the known-value list, so a famous
  // secret is rejected for being famous rather than for being short.
  if (value.length < MIN_PRODUCTION_LENGTH) {
    throw new InsecureSecretError(
      variableName,
      `it is ${value.length} characters and at least ${MIN_PRODUCTION_LENGTH} are required`,
    );
  }
  if (distinctCharacterCount(value) < MIN_DISTINCT_CHARACTERS) {
    throw new InsecureSecretError(
      variableName,
      `it uses only ${distinctCharacterCount(value)} distinct characters, which is too ` +
        `predictable for a signing key`,
    );
  }
}

/** True when the secret would be accepted in production. Never throws. */
export function isProductionGradeSecret(value: string | undefined): boolean {
  try {
    assertProductionSecret("SECRET", value);
    return true;
  } catch {
    return false;
  }
}

const DEVELOPMENT_ACCESS_SECRET = "dev-access-secret-change-me";

export function requireAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (process.env.NODE_ENV === "production") {
    // Fail closed. No fallback to the development secret, and no silently
    // generated ephemeral one, which would sign tokens that die on restart.
    assertProductionSecret("JWT_ACCESS_SECRET", secret);
    return secret;
  }
  return secret && secret.length > 0 ? secret : DEVELOPMENT_ACCESS_SECRET;
}
