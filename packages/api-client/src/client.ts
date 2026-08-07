import {
  accountsResponseSchema,
  dashboardResponseSchema,
  transactionsResponseSchema,
  type AccountsResponse,
  type DashboardResponse,
  type LoginInput,
  type RegisterInput,
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
    listTransactions: async (householdId: string, limit = 50) => {
      const data = await request<unknown>(
        `/api/v1/transactions?householdId=${encodeURIComponent(householdId)}&limit=${limit}`,
      );
      return transactionsResponseSchema.parse(data) as TransactionsResponse;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
