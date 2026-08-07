import { z } from "zod";

/** V1 mock connector catalog — metadata only, no real open banking. */
export const mockProviderCatalog = [
  {
    providerId: "mock-seb",
    name: "SEB",
    domain: "BANKING",
    protocol: "OPEN_BANKING_MOCK",
    authenticationMethod: "BANKID_MOCK",
  },
  {
    providerId: "mock-sbab",
    name: "SBAB",
    domain: "BANKING",
    protocol: "OPEN_BANKING_MOCK",
    authenticationMethod: "BANKID_MOCK",
  },
  {
    providerId: "mock-avanza",
    name: "Avanza",
    domain: "INVESTMENTS",
    protocol: "API_MOCK",
    authenticationMethod: "OAUTH_MOCK",
  },
  {
    providerId: "mock-kivra",
    name: "Kivra",
    domain: "DOCUMENTS",
    protocol: "API_MOCK",
    authenticationMethod: "OAUTH_MOCK",
  },
  {
    providerId: "mock-skatteverket",
    name: "Skatteverket",
    domain: "TAX",
    protocol: "API_MOCK",
    authenticationMethod: "BANKID_MOCK",
  },
  {
    providerId: "mock-csn",
    name: "CSN",
    domain: "GOVERNMENT",
    protocol: "API_MOCK",
    authenticationMethod: "BANKID_MOCK",
  },
  {
    providerId: "mock-manual-csv",
    name: "Manuell CSV",
    domain: "OTHER",
    protocol: "FILE",
    authenticationMethod: "NONE",
  },
] as const;

export const mockProviderCatalogSchema = z.array(
  z.object({
    providerId: z.string(),
    name: z.string(),
    domain: z.string(),
    protocol: z.string(),
    authenticationMethod: z.string(),
  }),
);

export type MockProvider = (typeof mockProviderCatalog)[number];
