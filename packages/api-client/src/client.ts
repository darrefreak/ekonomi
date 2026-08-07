import {
  accountsResponseSchema,
  accountDetailSchema,
  accountSchema,
  advisorBriefResponseSchema,
  assetsResponseSchema,
  budgetResponseSchema,
  cashflowResponseSchema,
  categoriesResponseSchema,
  contractsResponseSchema,
  coverageResponseSchema,
  dashboardResponseSchema,
  debtDetailResponseSchema,
  debtResponseSchema,
  documentsResponseSchema,
  forecastBacktestResponseSchema,
  forecastResponseSchema,
  goalsResponseSchema,
  importsResponseSchema,
  insightsResponseSchema,
  integrationsResponseSchema,
  investmentsResponseSchema,
  netWorthResponseSchema,
  opportunitiesResponseSchema,
  reviewResponseSchema,
  riskResponseSchema,
  scenarioSimulationResponseSchema,
  scenariosResponseSchema,
  subscriptionsResponseSchema,
  transactionDetailSchema,
  transactionsResponseSchema,
  vehicleDetailSchema,
  vehicleMarketResponseSchema,
  vehiclesResponseSchema,
  type AccountDetailDto,
  type AccountDto,
  type AccountsResponse,
  type AdvisorBriefResponse,
  type AssetsResponse,
  type BudgetResponse,
  type CashflowResponse,
  type CategoriesResponse,
  type ContractsResponse,
  type ContributeGoalInput,
  type ContributeSinkingFundInput,
  type CoverageResponse,
  type CreateAccountInput,
  type CreateGoalInput,
  type CreateScenarioInput,
  type CreateSinkingFundInput,
  type DashboardResponse,
  type DebtDetailResponse,
  type DebtResponse,
  type DocumentsResponse,
  type ForecastBacktestResponse,
  type ForecastResponse,
  type GoalsResponse,
  type ImportsResponse,
  type InsightsResponse,
  type IntegrationsResponse,
  type InvestmentsResponse,
  type LoginInput,
  type NetWorthResponse,
  type OpportunitiesResponse,
  type RegisterInput,
  type ReviewResponse,
  type RiskResponse,
  type ScenarioSimulationResponse,
  type ScenariosResponse,
  type SimulateScenarioInput,
  type SubscriptionsResponse,
  type TransactionDetailDto,
  type TransactionsResponse,
  type UpdateAccountInput,
  type UpdateBudgetLineInput,
  type UpdateGoalInput,
  type UpdateSinkingFundInput,
  type UpdateTransactionInput,
  type VehicleDetailDto,
  type VehicleMarketResponse,
  type VehiclesResponse,
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
    listAccounts: async (
      householdId: string,
      opts?: { includeArchived?: boolean },
    ) => {
      const params = new URLSearchParams({ householdId });
      if (opts?.includeArchived) params.set("includeArchived", "true");
      const data = await request<unknown>(`/api/v1/accounts?${params}`);
      return accountsResponseSchema.parse(data) as AccountsResponse;
    },
    createAccount: async (input: CreateAccountInput) => {
      const data = await request<unknown>("/api/v1/accounts", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return accountSchema.parse(data) as AccountDto;
    },
    updateAccount: async (accountId: string, input: UpdateAccountInput) => {
      const data = await request<unknown>(
        `/api/v1/accounts/${encodeURIComponent(accountId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      return accountSchema.parse(data) as AccountDto;
    },
    archiveAccount: async (householdId: string, accountId: string) => {
      const data = await request<unknown>(
        `/api/v1/accounts/${encodeURIComponent(accountId)}?householdId=${encodeURIComponent(householdId)}`,
        { method: "DELETE" },
      );
      return accountSchema.parse(data) as AccountDto;
    },
    getAccount: async (householdId: string, accountId: string) => {
      const data = await request<unknown>(
        `/api/v1/accounts/${encodeURIComponent(accountId)}?householdId=${encodeURIComponent(householdId)}`,
      );
      return accountDetailSchema.parse(data) as AccountDetailDto;
    },
    listCategories: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/categories?householdId=${encodeURIComponent(householdId)}`,
      );
      return categoriesResponseSchema.parse(data) as CategoriesResponse;
    },
    listTransactions: async (
      householdId: string,
      opts?: {
        limit?: number;
        q?: string;
        accountId?: string;
        from?: string;
        to?: string;
        includeExcluded?: boolean;
      },
    ) => {
      const params = new URLSearchParams({
        householdId,
        limit: String(opts?.limit ?? 50),
      });
      if (opts?.q) params.set("q", opts.q);
      if (opts?.accountId) params.set("accountId", opts.accountId);
      if (opts?.from) params.set("from", opts.from);
      if (opts?.to) params.set("to", opts.to);
      if (opts?.includeExcluded) params.set("includeExcluded", "true");
      const data = await request<unknown>(`/api/v1/transactions?${params}`);
      return transactionsResponseSchema.parse(data) as TransactionsResponse;
    },
    getTransaction: async (householdId: string, transactionId: string) => {
      const data = await request<unknown>(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}?householdId=${encodeURIComponent(householdId)}`,
      );
      return transactionDetailSchema.parse(data) as TransactionDetailDto;
    },
    updateTransaction: async (
      transactionId: string,
      input: UpdateTransactionInput,
    ) => {
      const data = await request<unknown>(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      return transactionDetailSchema.parse(data) as TransactionDetailDto;
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
    getInvestments: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/investments?householdId=${encodeURIComponent(householdId)}`,
      );
      return investmentsResponseSchema.parse(data) as InvestmentsResponse;
    },
    getAssets: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/assets?householdId=${encodeURIComponent(householdId)}`,
      );
      return assetsResponseSchema.parse(data) as AssetsResponse;
    },
    getDebt: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/debt?householdId=${encodeURIComponent(householdId)}`,
      );
      return debtResponseSchema.parse(data) as DebtResponse;
    },
    getDebtDetail: async (householdId: string, accountId: string) => {
      const data = await request<unknown>(
        `/api/v1/debt/${encodeURIComponent(accountId)}?householdId=${encodeURIComponent(householdId)}`,
      );
      return debtDetailResponseSchema.parse(data) as DebtDetailResponse;
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
    getBudget: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/budget?householdId=${encodeURIComponent(householdId)}`,
      );
      return budgetResponseSchema.parse(data) as BudgetResponse;
    },
    updateBudgetLine: async (lineId: string, input: UpdateBudgetLineInput) => {
      const data = await request<unknown>(
        `/api/v1/budget/lines/${encodeURIComponent(lineId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      return budgetResponseSchema.parse(data) as BudgetResponse;
    },
    getSubscriptions: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/subscriptions?householdId=${encodeURIComponent(householdId)}`,
      );
      return subscriptionsResponseSchema.parse(data) as SubscriptionsResponse;
    },
    getContracts: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/contracts?householdId=${encodeURIComponent(householdId)}`,
      );
      return contractsResponseSchema.parse(data) as ContractsResponse;
    },
    getGoals: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/goals?householdId=${encodeURIComponent(householdId)}`,
      );
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    createGoal: async (input: CreateGoalInput) => {
      const data = await request<unknown>("/api/v1/goals", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    updateGoal: async (goalId: string, input: UpdateGoalInput) => {
      const data = await request<unknown>(
        `/api/v1/goals/${encodeURIComponent(goalId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    contributeGoal: async (goalId: string, input: ContributeGoalInput) => {
      const data = await request<unknown>(
        `/api/v1/goals/${encodeURIComponent(goalId)}/contributions`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    createSinkingFund: async (input: CreateSinkingFundInput) => {
      const data = await request<unknown>("/api/v1/sinking-funds", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    updateSinkingFund: async (fundId: string, input: UpdateSinkingFundInput) => {
      const data = await request<unknown>(
        `/api/v1/sinking-funds/${encodeURIComponent(fundId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    contributeSinkingFund: async (
      fundId: string,
      input: ContributeSinkingFundInput,
    ) => {
      const data = await request<unknown>(
        `/api/v1/sinking-funds/${encodeURIComponent(fundId)}/contributions`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      return goalsResponseSchema.parse(data) as GoalsResponse;
    },
    listVehicles: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/vehicles?householdId=${encodeURIComponent(householdId)}`,
      );
      return vehiclesResponseSchema.parse(data) as VehiclesResponse;
    },
    getVehicle: async (householdId: string, vehicleId: string) => {
      const data = await request<unknown>(
        `/api/v1/vehicles/${encodeURIComponent(vehicleId)}?householdId=${encodeURIComponent(householdId)}`,
      );
      return vehicleDetailSchema.parse(data) as VehicleDetailDto;
    },
    getForecast: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/forecast?householdId=${encodeURIComponent(householdId)}`,
      );
      return forecastResponseSchema.parse(data) as ForecastResponse;
    },
    getForecastBacktest: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/forecast/backtest?householdId=${encodeURIComponent(householdId)}`,
      );
      return forecastBacktestResponseSchema.parse(data) as ForecastBacktestResponse;
    },
    getOpportunities: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/opportunities?householdId=${encodeURIComponent(householdId)}`,
      );
      return opportunitiesResponseSchema.parse(data) as OpportunitiesResponse;
    },
    getRisk: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/risk?householdId=${encodeURIComponent(householdId)}`,
      );
      return riskResponseSchema.parse(data) as RiskResponse;
    },
    getScenarios: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/scenarios?householdId=${encodeURIComponent(householdId)}`,
      );
      return scenariosResponseSchema.parse(data) as ScenariosResponse;
    },
    createScenario: async (input: CreateScenarioInput) => {
      const data = await request<unknown>("/api/v1/scenarios", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return scenariosResponseSchema.parse(data) as ScenariosResponse;
    },
    simulateScenario: async (
      scenarioId: string,
      input: SimulateScenarioInput,
    ) => {
      const data = await request<unknown>(
        `/api/v1/scenarios/${encodeURIComponent(scenarioId)}/simulate`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      return scenarioSimulationResponseSchema.parse(
        data,
      ) as ScenarioSimulationResponse;
    },
    getInsights: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/insights?householdId=${encodeURIComponent(householdId)}`,
      );
      return insightsResponseSchema.parse(data) as InsightsResponse;
    },
    getVehicleMarket: async (householdId: string, vehicleId?: string) => {
      const qs = new URLSearchParams({ householdId });
      if (vehicleId) qs.set("vehicleId", vehicleId);
      const data = await request<unknown>(`/api/v1/vehicle-market?${qs}`);
      return vehicleMarketResponseSchema.parse(data) as VehicleMarketResponse;
    },
    getDocuments: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/documents?householdId=${encodeURIComponent(householdId)}`,
      );
      return documentsResponseSchema.parse(data) as DocumentsResponse;
    },
    getIntegrations: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/integrations?householdId=${encodeURIComponent(householdId)}`,
      );
      return integrationsResponseSchema.parse(data) as IntegrationsResponse;
    },
    getImports: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/imports?householdId=${encodeURIComponent(householdId)}`,
      );
      return importsResponseSchema.parse(data) as ImportsResponse;
    },
    triggerFakeSync: async (householdId: string) => {
      return request<{ ok: boolean; syncRunId: string }>(
        `/api/v1/integrations/sync?householdId=${encodeURIComponent(householdId)}`,
        { method: "POST" },
      );
    },
    getAdvisorBrief: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/advisor/brief?householdId=${encodeURIComponent(householdId)}`,
      );
      return advisorBriefResponseSchema.parse(data) as AdvisorBriefResponse;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
