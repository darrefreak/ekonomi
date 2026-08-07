import {
  accountsResponseSchema,
  accountDetailSchema,
  cashflowResponseSchema,
  coverageResponseSchema,
  dashboardResponseSchema,
  netWorthResponseSchema,
  reviewResponseSchema,
  transactionsResponseSchema,
  type AccountDetailDto,
  type AccountsResponse,
  type CashflowResponse,
  type CoverageResponse,
  type DashboardResponse,
  type LoginInput,
  type NetWorthResponse,
  type RegisterInput,
  type ReviewResponse,
  type TransactionsResponse,
} from "@ffos/schemas";

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  fetchImpl?: typeof fetch;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(
    path: string,
    init?: RequestInit & { skipAuth?: boolean },
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (!init?.skipAuth) {
      const token = options.getAccessToken?.();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const data = await parseJson(res);
    if (!res.ok) {
      const message =
        typeof data === "object" &&
        data &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data as T;
  }

  return {
    health: () => request<{ status: string }>("/health", { skipAuth: true }),
    register: (input: RegisterInput) =>
      request<{ user: AuthUser; tokens: AuthTokens }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
        skipAuth: true,
      }),
    login: (input: LoginInput) =>
      request<{ user: AuthUser; tokens: AuthTokens }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
        skipAuth: true,
      }),
    createHousehold: (input: { name: string; baseCurrency?: string }) =>
      request<{ id: string; name: string; baseCurrency: string }>(
        "/api/v1/households",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    listHouseholds: () =>
      request<Array<{ id: string; name: string; baseCurrency: string; role: string }>>(
        "/api/v1/households",
      ),
    getDashboard: async (householdId: string): Promise<DashboardResponse> => {
      const data = await request<unknown>(
        `/api/v1/dashboard?householdId=${encodeURIComponent(householdId)}`,
      );
      return dashboardResponseSchema.parse(data);
    },
    listAccounts: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/accounts?householdId=${encodeURIComponent(householdId)}`,
      );
      return accountsResponseSchema.parse(data) as AccountsResponse;
    },
    getAccount: async (householdId: string, accountId: string) => {
      const data = await request<unknown>(
        `/api/v1/accounts/${encodeURIComponent(accountId)}?householdId=${encodeURIComponent(householdId)}`,
      );
      return accountDetailSchema.parse(data) as AccountDetailDto;
    },
    listTransactions: async (
      householdId: string,
      opts?: { limit?: number; q?: string; accountId?: string; from?: string; to?: string },
    ) => {
      const params = new URLSearchParams({
        householdId,
        limit: String(opts?.limit ?? 50),
      });
      if (opts?.q) params.set("q", opts.q);
      if (opts?.accountId) params.set("accountId", opts.accountId);
      if (opts?.from) params.set("from", opts.from);
      if (opts?.to) params.set("to", opts.to);
      const data = await request<unknown>(`/api/v1/transactions?${params}`);
      return transactionsResponseSchema.parse(data) as TransactionsResponse;
    },
    getCashflow: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/cashflow?householdId=${encodeURIComponent(householdId)}`,
      );
      return cashflowResponseSchema.parse(data) as CashflowResponse;
    },
    getNetWorth: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/net-worth?householdId=${encodeURIComponent(householdId)}`,
      );
      return netWorthResponseSchema.parse(data) as NetWorthResponse;
    },
    getCoverage: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/coverage?householdId=${encodeURIComponent(householdId)}`,
      );
      return coverageResponseSchema.parse(data) as CoverageResponse;
    },
    getReview: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/review?householdId=${encodeURIComponent(householdId)}`,
      );
      return reviewResponseSchema.parse(data) as ReviewResponse;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
