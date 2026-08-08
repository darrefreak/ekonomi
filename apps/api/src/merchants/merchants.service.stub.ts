import type { MerchantsService } from "../merchants/merchants.service";

/** Lightweight MerchantsService stub for unit/integration tests. */
export function stubMerchantsService(
  overrides?: Partial<MerchantsService>,
): MerchantsService {
  return {
    normalizePreview: async (_userId, _householdId, raw) => ({
      rawDescription: raw,
      normalizedText: raw.toUpperCase(),
      tokens: raw.toUpperCase().split(/\s+/).filter(Boolean),
      match: null,
      needsReview: true,
      stagesApplied: ["casing"],
    }),
    resolveMerchantId: async () => undefined,
    verifyAlias: async () => ({
      merchantId: "00000000-0000-4000-8000-000000000001",
      canonicalName: "Stub",
      aliasAdded: "STUB",
      userVerified: true as const,
    }),
    ...overrides,
  } as MerchantsService;
}
