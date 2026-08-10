import { assertProductionSecret, InsecureSecretError } from "./jwt-secrets";

/**
 * The configuration contract a production process must satisfy before it will
 * serve a single request.
 *
 * The point is to fail at boot, loudly, rather than at the first request that
 * happens to need the missing piece — or worse, to keep running on a default
 * that was only ever meant for a laptop (FPA-002).
 */

type RequiredVariable = {
  name: string;
  describe: string;
  /** Returns a reason string when the value is unusable, otherwise null. */
  validate?: (value: string) => string | null;
};

function looksLikeUrl(schemes: string[]) {
  return (value: string): string | null => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return "it is not a valid URL";
    }
    const scheme = parsed.protocol.replace(":", "");
    if (!schemes.includes(scheme)) {
      return `it uses the "${scheme}" scheme, expected one of ${schemes.join(", ")}`;
    }
    return null;
  };
}

function rejectLocalhost(value: string): string | null {
  const host = (() => {
    try {
      return new URL(value).hostname;
    } catch {
      return "";
    }
  })();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "it points at localhost, which is not a production address";
  }
  return null;
}

const REQUIRED_IN_PRODUCTION: RequiredVariable[] = [
  {
    name: "DATABASE_URL",
    describe: "PostgreSQL connection string",
    validate: (value) => looksLikeUrl(["postgres", "postgresql"])(value),
  },
  {
    name: "REDIS_URL",
    describe: "Redis connection string, used by the background job queues",
    validate: looksLikeUrl(["redis", "rediss"]),
  },
  {
    name: "CORS_ORIGIN",
    describe: "comma-separated list of browser origins allowed to call the API",
    validate: (value) => {
      const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      if (origins.length === 0) return "it is empty";
      if (origins.includes("*")) {
        return "it allows every origin, which defeats the purpose in production";
      }
      for (const origin of origins) {
        const invalid = looksLikeUrl(["http", "https"])(origin);
        if (invalid) return `${origin} is not a usable origin: ${invalid}`;
        const local = rejectLocalhost(origin);
        if (local) return `${origin}: ${local}`;
      }
      return null;
    },
  },
  { name: "S3_ENDPOINT", describe: "object storage endpoint for documents", validate: looksLikeUrl(["http", "https"]) },
  { name: "S3_ACCESS_KEY", describe: "object storage access key" },
  { name: "S3_SECRET_KEY", describe: "object storage secret key" },
  { name: "S3_BUCKET", describe: "object storage bucket holding uploaded documents" },
];

export class ProductionConfigurationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      "Refusing to start in production. Fix the configuration and restart:\n" +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
    this.name = "ProductionConfigurationError";
    this.problems = problems;
  }
}

/**
 * Validate the environment against the contract. Collects every problem so an
 * operator sees the whole list at once rather than one per restart.
 *
 * No value is ever included in a message; only the variable name and the reason.
 */
export function checkProductionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const problems: string[] = [];

  try {
    assertProductionSecret("JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET);
  } catch (error) {
    problems.push(
      error instanceof InsecureSecretError ? error.message : String(error),
    );
  }

  // Refresh tokens are opaque random strings stored and revoked in the
  // database (ADR-0003); nothing signs them, so no refresh secret is required.
  // If one is configured anyway it must not be a published placeholder, so an
  // unused weak value cannot quietly become a used one later.
  if (env.JWT_REFRESH_SECRET) {
    try {
      assertProductionSecret("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET);
    } catch (error) {
      problems.push(
        error instanceof InsecureSecretError ? error.message : String(error),
      );
    }
  }

  for (const variable of REQUIRED_IN_PRODUCTION) {
    const value = env[variable.name];
    if (!value || value.trim().length === 0) {
      problems.push(`${variable.name} is not set (${variable.describe})`);
      continue;
    }
    const reason = variable.validate?.(value.trim());
    if (reason) {
      problems.push(`${variable.name} is unusable because ${reason}`);
    }
  }

  if (env.FFOS_ALLOW_DB_RESET === "true") {
    problems.push(
      "FFOS_ALLOW_DB_RESET is enabled, which permits destructive schema resets",
    );
  }

  return problems;
}

/** Fail closed: in production, an invalid environment stops the process. */
export function assertProductionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  const problems = checkProductionConfiguration(env);
  if (problems.length > 0) {
    throw new ProductionConfigurationError(problems);
  }
}
