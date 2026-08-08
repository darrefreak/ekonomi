/** Resolve product asOf: query override → DEMO_AS_OF_DATE → demo default. */
export function resolveAsOf(asOf?: string | null): string {
  return asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
}
