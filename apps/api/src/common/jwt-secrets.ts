export function requireAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_ACCESS_SECRET must be set (min 16 chars) in production",
    );
  }
  return secret && secret.length > 0 ? secret : "dev-access-secret-change-me";
}
