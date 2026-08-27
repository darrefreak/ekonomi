import {
  accountsResponseSchema,
  accountDetailSchema,
  accountSchema,
  advisorBriefResponseSchema,
  advisorChatRequestSchema,
  advisorChatResponseSchema,
  assetsResponseSchema,
  featureFlagsResponseSchema,
  recommendationOutcomesResponseSchema,
  trackRecommendationOutcomeSchema,
  updateRecommendationOutcomeSchema,
  budgetResponseSchema,
  cashflowResponseSchema,
  categoriesResponseSchema,
  categorySchema,
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  merchantsResponseSchema,
  listMerchantsQuerySchema,
  merchantNormalizeQuerySchema,
  merchantNormalizeResponseSchema,
  verifyMerchantAliasSchema,
  verifyMerchantAliasResponseSchema,
  createVehicleSchema,
  updateVehicleSchema,
  createVehicleCandidateSchema,
  createVehicleCandidateFromListingSchema,
  updateVehicleCandidateSchema,
  inviteMemberSchema,
  acceptInviteSchema,
  updateMemberRoleSchema,
  invitationSchema,
  reviseClassificationSchema,
  contractsResponseSchema,
  coverageResponseSchema,
  dashboardResponseSchema,
  debtDetailResponseSchema,
  debtPayoffResponseSchema,
  debtResponseSchema,
  documentDetailSchema,
  documentsResponseSchema,
  updateDocumentSchema,
  uploadDocumentSchema,
  forecastBacktestResponseSchema,
  forecastResponseSchema,
  goalsResponseSchema,
  createSourceSchema,
  importsResponseSchema,
  insightsResponseSchema,
  anomaliesResponseSchema,
  dismissAnomalySchema,
  analysisRunsResponseSchema,
  auditLogsResponseSchema,
  updateRecurringStatusSchema,
  recurringOverviewResponseSchema,
  verifyRecurringStreamSchema,
  expectedTransactionsResponseSchema,
  type RecurringOverviewResponse,
  type VerifyRecurringStreamInput,
  type ExpectedTransactionsResponse,
  integrationsResponseSchema,
  reconnectSourceSchema,
  sourceSchema,
  syncResultSchema,
  updateSourceSchema,
  createCreditCardPurchaseSchema,
  createCreditCardPaymentSchema,
  createMortgagePaymentSchema,
  createInvestmentTransferSchema,
  createAssetPurchaseSchema,
  createFinancedAssetPurchaseSchema,
  investmentsResponseSchema,
  netWorthResponseSchema,
  opportunitiesResponseSchema,
  monthlyReportSchema,
  notificationsResponseSchema,
  calendarResponseSchema,
  smartBudgetResponseSchema,
  adoptSmartBudgetSchema,
  whatChangedResponseSchema,
  reportExploreResponseSchema,
  weeklyReviewSchema,
  type CalendarResponse,
  type SmartBudgetResponse,
  type AdoptSmartBudgetInput,
  type WhatChangedMode,
  type WhatChangedResponse,
  type ReportExploreQuery,
  type ReportExploreResponse,
  type WeeklyReview,
  resolveReviewSchema,
  reviewResponseSchema,
  clusterReviewResponseSchema,
  resolveClusterSchema,
  resolveClusterResponseSchema,
  aiDryRunReportSchema,
  aiStatusResponseSchema,
  financialBriefResponseSchema,
  familySummaryResponseSchema,
  decisionsCenterResponseSchema,
  classificationRulesResponseSchema,
  updateClassificationRuleSchema,
  riskResponseSchema,
  searchResponseSchema,
  settingsResponseSchema,
  updateSettingsSchema,
  yearlyReportSchema,
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
  type AdvisorChatInput,
  type AdvisorChatResponse,
  type AssetsResponse,
  type FeatureFlagsResponse,
  type RecommendationOutcomesResponse,
  type TrackRecommendationOutcomeInput,
  type UpdateRecommendationOutcomeInput,
  type BudgetResponse,
  type CashflowResponse,
  type CategoriesResponse,
  type CategoryDto,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type MerchantsResponse,
  type MerchantNormalizeResponse,
  type VerifyMerchantAliasInput,
  type CreateVehicleInput,
  type UpdateVehicleInput,
  type CreateVehicleCandidateInput,
  type CreateVehicleCandidateFromListingInput,
  type UpdateVehicleCandidateInput,
  type InviteMemberInput,
  type AcceptInviteInput,
  type UpdateMemberRoleInput,
  type CreateCashExpenseInput,
  type CreateCashIncomeInput,
  type ReviseClassificationInput,
  type ContractsResponse,
  type ContributeGoalInput,
  type ContributeSinkingFundInput,
  type CoverageResponse,
  type CreateAccountInput,
  type CreateGoalInput,
  type CreateScenarioInput,
  type CreateSinkingFundInput,
  type CreateCreditCardPurchaseInput,
  type CreateCreditCardPaymentInput,
  type CreateMortgagePaymentInput,
  type CreateInvestmentTransferInput,
  type CreateAssetPurchaseInput,
  type CreateFinancedAssetPurchaseInput,
  type DashboardResponse,
  type DebtDetailResponse,
  type DebtPayoffMethod,
  type DebtPayoffResponse,
  type DebtResponse,
  type DocumentDetailDto,
  type DocumentsResponse,
  type UpdateDocumentInput,
  type UploadDocumentInput,
  type ForecastBacktestResponse,
  type ForecastResponse,
  type GoalsResponse,
  type CreateSourceInput,
  type ImportsResponse,
  type InsightsResponse,
  type AnomaliesResponse,
  type DismissAnomalyInput,
  type AnalysisRunsResponse,
  type AuditLogsResponse,
  type UpdateRecurringStatusInput,
  type IntegrationsResponse,
  type ReconnectSourceInput,
  type SourceDto,
  type SyncResultDto,
  type UpdateSourceInput,
  type InvestmentsResponse,
  type LoginInput,
  type LogoutInput,
  type NetWorthResponse,
  type OpportunitiesResponse,
  type ErasureConfirmInput,
  type ErasureSummary,
  erasureSummarySchema,
  type PrivacyDeleteRequest,
  type PrivacyExportResponse,
  type PrivacyDeleteResponse,
  type RegisterInput,
  type MonthlyReport,
  type NotificationsResponse,
  type ResolveReviewInput,
  type ClusterReviewResponse,
  type ResolveClusterInput,
  type ResolveClusterResponse,
  type AiDryRunReport,
  type AiStatusResponse,
  type FinancialBriefResponse,
  type FamilySummaryResponse,
  type DecisionsCenterResponse,
  type ClassificationRulesResponse,
  type UpdateClassificationRuleInput,
  type ReviewResponse,
  type RiskResponse,
  type SearchResponse,
  type SettingsResponse,
  type UpdateSettingsInput,
  type YearlyReport,
  type ScenarioSimulationResponse,
  type ScenariosResponse,
  type SimulateScenarioInput,
  type SubscriptionsResponse,
  type TransactionDetailDto,
  type TransactionsResponse,
  type UpdateAccountInput,
  type CreateBudgetInput,
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
  /** Used to attempt a single silent refresh when a request fails with 401. */
  getRefreshToken?: () => string | null | undefined;
  /** Called with the new token pair immediately after a successful refresh. */
  onTokensRefreshed?: (tokens: AuthTokens) => void;
  /** Called when refresh itself fails (or no refresh token is available) after a 401. */
  onAuthFailure?: () => void;
  fetchImpl?: typeof fetch;
};

/** Options accepted by money-mutating client calls. */
export type MutationOptions = {
  /** Stable per-user-submission key; retries of the same intent must reuse it. */
  idempotencyKey?: string;
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

  /** Single-flight refresh: concurrent 401s share one in-flight refresh call. */
  let refreshInFlight: Promise<AuthTokens> | null = null;

  async function refresh(refreshToken: string): Promise<AuthTokens> {
    return request<AuthTokens>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      skipAuth: true,
    });
  }

  async function refreshTokensOnce(): Promise<AuthTokens> {
    if (!refreshInFlight) {
      const refreshToken = options.getRefreshToken?.();
      if (!refreshToken) {
        throw new Error("No refresh token available");
      }
      refreshInFlight = refresh(refreshToken).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function request<T>(
    path: string,
    init?: RequestInit & {
      skipAuth?: boolean;
      skipRefresh?: boolean;
      /**
       * Command identity for money mutations. Survives the silent 401 refresh
       * retry below, so one user intent produces one economic effect.
       */
      idempotencyKey?: string;
    },
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (init?.idempotencyKey) {
      headers.set("Idempotency-Key", init.idempotencyKey);
    }
    if (!init?.skipAuth) {
      const token = options.getAccessToken?.();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (
      res.status === 401 &&
      !init?.skipAuth &&
      !init?.skipRefresh
    ) {
      try {
        const tokens = await refreshTokensOnce();
        options.onTokensRefreshed?.(tokens);
      } catch {
        options.onAuthFailure?.();
        throw Object.assign(new Error("Session expired"), {
          status: 401,
          code: "AUTH_REFRESH_FAILED",
        });
      }
      return request<T>(path, { ...init, skipRefresh: true });
    }

    const data = await parseJson(res);
    if (!res.ok) {
      const envelope =
        typeof data === "object" && data && "error" in data
          ? (data as {
              error?: {
                message?: unknown;
                fields?: Record<string, string>;
                code?: string;
              };
            }).error
          : null;
      const fields =
        envelope?.fields && typeof envelope.fields === "object"
          ? envelope.fields
          : undefined;
      const fieldMessages = fields
        ? Object.values(fields).filter(Boolean).join(" ")
        : "";
      const message =
        (typeof envelope?.message === "string" && envelope.message) ||
        (typeof data === "object" &&
        data &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : null) ||
        `Request failed (${res.status})`;
      const err = new Error(
        fieldMessages ? `${message} ${fieldMessages}` : message,
      ) as Error & {
        code?: string;
        fields?: Record<string, string>;
        status?: number;
      };
      err.code =
        typeof envelope?.code === "string" ? envelope.code : undefined;
      err.fields = fields;
      err.status = res.status;
      throw err;
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
    refresh,
    logout: (input?: LogoutInput) =>
      request<{ ok: true }>("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      }),
    revokeAll: () =>
      request<{ ok: true }>("/api/v1/auth/revoke-all", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    exportPrivacyData: async (householdId: string) => {
      const data = await request<unknown>("/api/v1/privacy/export", {
        method: "POST",
        body: JSON.stringify({ householdId }),
      });
      return data as PrivacyExportResponse;
    },
    requestPrivacyDelete: async (input: PrivacyDeleteRequest) => {
      const data = await request<unknown>("/api/v1/privacy/delete-request", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return data as PrivacyDeleteResponse;
    },
    /** Households the signed-in user owns, and could therefore erase. */
    listErasableHouseholds: () =>
      request<{ items: Array<{ id: string; name: string; role: string }> }>(
        "/api/v1/privacy/erasable",
      ),
    /** Executes a deletion request; the name must match the household exactly. */
    confirmErasure: async (requestId: string, input: ErasureConfirmInput) => {
      const data = await request<unknown>(
        `/api/v1/privacy/requests/${encodeURIComponent(requestId)}/confirm`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return erasureSummarySchema.parse(data) as ErasureSummary;
    },
    cancelErasure: (requestId: string) =>
      request<{ id: string; status: string }>(
        `/api/v1/privacy/requests/${encodeURIComponent(requestId)}/cancel`,
        { method: "POST" },
      ),
    deleteOwnAccount: () =>
      request<{ deleted: true; householdsErased: number }>("/api/v1/privacy/me", {
        method: "DELETE",
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
      request<
        Array<{
          id: string;
          name: string;
          baseCurrency: string;
          role: string;
          currencySupported: boolean;
        }>
      >("/api/v1/households"),
    migrateHouseholdBaseCurrency: (householdId: string, baseCurrency: string) =>
      request<{ householdId: string; baseCurrency: string; changed: boolean }>(
        `/api/v1/households/${encodeURIComponent(householdId)}/base-currency`,
        { method: "POST", body: JSON.stringify({ baseCurrency }) },
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
    createAccount: async (input: CreateAccountInput, opts?: MutationOptions) => {
      const data = await request<unknown>("/api/v1/accounts", {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey: opts?.idempotencyKey,
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
    listCategories: async (
      householdId: string,
      opts?: { includeArchived?: boolean },
    ) => {
      const params = listCategoriesQuerySchema.parse({
        householdId,
        includeArchived: opts?.includeArchived ? "true" : undefined,
      });
      const qs = new URLSearchParams({ householdId: params.householdId });
      if (params.includeArchived) qs.set("includeArchived", params.includeArchived);
      const data = await request<unknown>(`/api/v1/categories?${qs}`);
      return categoriesResponseSchema.parse(data) as CategoriesResponse;
    },
    createCategory: async (input: CreateCategoryInput) => {
      const body = createCategorySchema.parse(input);
      const data = await request<unknown>("/api/v1/categories", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return categorySchema.parse(data) as CategoryDto;
    },
    updateCategory: async (categoryId: string, input: UpdateCategoryInput) => {
      const body = updateCategorySchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/categories/${encodeURIComponent(categoryId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      return categorySchema.parse(data) as CategoryDto;
    },
    archiveCategory: async (householdId: string, categoryId: string) => {
      const data = await request<unknown>(
        `/api/v1/categories/${encodeURIComponent(categoryId)}?householdId=${encodeURIComponent(householdId)}`,
        { method: "DELETE" },
      );
      return categorySchema.parse(data) as CategoryDto;
    },
    listMerchants: async (householdId: string, q?: string) => {
      const params = listMerchantsQuerySchema.parse({ householdId, q });
      const qs = new URLSearchParams({ householdId: params.householdId });
      if (params.q) qs.set("q", params.q);
      const data = await request<unknown>(`/api/v1/merchants?${qs}`);
      return merchantsResponseSchema.parse(data) as MerchantsResponse;
    },
    normalizeMerchant: async (householdId: string, raw: string) => {
      const params = merchantNormalizeQuerySchema.parse({ householdId, raw });
      const qs = new URLSearchParams({
        householdId: params.householdId,
        raw: params.raw,
      });
      const data = await request<unknown>(`/api/v1/merchants/normalize?${qs}`);
      return merchantNormalizeResponseSchema.parse(
        data,
      ) as MerchantNormalizeResponse;
    },
    verifyMerchantAlias: async (input: VerifyMerchantAliasInput) => {
      const body = verifyMerchantAliasSchema.parse(input);
      const data = await request<unknown>("/api/v1/merchants/verify-alias", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return verifyMerchantAliasResponseSchema.parse(data);
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
        categoryId?: string;
        merchantId?: string;
        merchantMissing?: boolean;
        direction?: "inflow" | "outflow";
        minAmountMinor?: string;
        maxAmountMinor?: string;
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
      if (opts?.categoryId) params.set("categoryId", opts.categoryId);
      if (opts?.merchantId) params.set("merchantId", opts.merchantId);
      if (opts?.merchantMissing) params.set("merchantMissing", "true");
      if (opts?.direction) params.set("direction", opts.direction);
      if (opts?.minAmountMinor) params.set("minAmountMinor", opts.minAmountMinor);
      if (opts?.maxAmountMinor) params.set("maxAmountMinor", opts.maxAmountMinor);
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
    createCashRefund: async (input: {
      householdId: string;
      cashAccountId: string;
      expenseAccountId?: string;
      amountMinor: string;
      occurredOn: string;
      description?: string;
      externalId?: string;
    }, opts?: MutationOptions) => {
      const data = await request<{
        id: string;
        eventType: string;
        status: string;
        expenseAmountMinor: string;
      }>("/api/v1/ledger/refunds", {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey: opts?.idempotencyKey,
      });
      return data;
    },
    createCashExpense: async (
      input: CreateCashExpenseInput,
      opts?: MutationOptions,
    ) => {
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/expenses",
        {
          method: "POST",
          body: JSON.stringify(input),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createCashIncome: async (
      input: CreateCashIncomeInput,
      opts?: MutationOptions,
    ) => {
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/income",
        {
          method: "POST",
          body: JSON.stringify(input),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createInternalTransfer: async (input: {
      householdId: string;
      fromAccountId: string;
      toAccountId: string;
      amountMinor: string;
      occurredOn: string;
      description?: string;
      externalId?: string;
    }, opts?: MutationOptions) => {
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/transfers/internal",
        {
          method: "POST",
          body: JSON.stringify(input),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createCreditCardPurchase: async (input: CreateCreditCardPurchaseInput, opts?: MutationOptions) => {
      const body = createCreditCardPurchaseSchema.parse(input);
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/credit-card/purchase",
        {
          method: "POST",
          body: JSON.stringify(body),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createCreditCardPayment: async (input: CreateCreditCardPaymentInput, opts?: MutationOptions) => {
      const body = createCreditCardPaymentSchema.parse(input);
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/credit-card/payment",
        {
          method: "POST",
          body: JSON.stringify(body),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createMortgagePayment: async (input: CreateMortgagePaymentInput, opts?: MutationOptions) => {
      const body = createMortgagePaymentSchema.parse(input);
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/mortgage/payment",
        {
          method: "POST",
          body: JSON.stringify(body),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createInvestmentTransfer: async (input: CreateInvestmentTransferInput, opts?: MutationOptions) => {
      const body = createInvestmentTransferSchema.parse(input);
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/investments/transfer",
        {
          method: "POST",
          body: JSON.stringify(body),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createAssetPurchase: async (input: CreateAssetPurchaseInput, opts?: MutationOptions) => {
      const body = createAssetPurchaseSchema.parse(input);
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/assets/purchase",
        {
          method: "POST",
          body: JSON.stringify(body),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    createFinancedAssetPurchase: async (
      input: CreateFinancedAssetPurchaseInput,
      opts?: MutationOptions,
    ) => {
      const body = createFinancedAssetPurchaseSchema.parse(input);
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/assets/financed-purchase",
        {
          method: "POST",
          body: JSON.stringify(body),
          idempotencyKey: opts?.idempotencyKey,
        },
      );
      return data;
    },
    replaceEventSplits: async (
      eventId: string,
      input: {
        householdId: string;
        sourceAmountMinor: string;
        splits: Array<{
          categoryId?: string;
          amountMinor: string;
          memo?: string;
        }>;
      },
    ) => {
      const data = await request<{ id: string; eventType: string; status: string }>(
        `/api/v1/ledger/events/${encodeURIComponent(eventId)}/splits`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return data;
    },
    reviseExpenseToTransfer: async (input: ReviseClassificationInput) => {
      const body = reviseClassificationSchema.parse(input);
      const data = await request<{
        id: string;
        eventType: string;
        status: string;
        expenseAmountMinor: string;
      }>("/api/v1/ledger/events/revise-classification", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return data;
    },
    reverseFinancialEvent: async (input: {
      householdId: string;
      financialEventId: string;
    }) => {
      const data = await request<{ id: string; eventType: string; status: string }>(
        "/api/v1/ledger/events/reverse",
        { method: "POST", body: JSON.stringify(input) },
      );
      return data;
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
    getDebtPayoff: async (
      householdId: string,
      opts?: { method?: DebtPayoffMethod; extraMonthlyMinor?: string },
    ) => {
      const params = new URLSearchParams({ householdId });
      if (opts?.method) params.set("method", opts.method);
      if (opts?.extraMonthlyMinor)
        params.set("extraMonthlyMinor", opts.extraMonthlyMinor);
      const data = await request<unknown>(`/api/v1/debt/payoff?${params.toString()}`);
      return debtPayoffResponseSchema.parse(data) as DebtPayoffResponse;
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
    resolveReview: async (input: ResolveReviewInput) => {
      const body = resolveReviewSchema.parse(input);
      const data = await request<unknown>("/api/v1/review/resolve", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return reviewResponseSchema.parse(data) as ReviewResponse;
    },
    getSettings: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/settings?householdId=${encodeURIComponent(householdId)}`,
      );
      return settingsResponseSchema.parse(data) as SettingsResponse;
    },
    updateSettings: async (input: UpdateSettingsInput) => {
      const body = updateSettingsSchema.parse(input);
      const data = await request<unknown>("/api/v1/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return settingsResponseSchema.parse(data) as SettingsResponse;
    },
    inviteMember: async (input: InviteMemberInput) => {
      const body = inviteMemberSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/households/${encodeURIComponent(body.householdId)}/invitations`,
        { method: "POST", body: JSON.stringify(body) },
      );
      return invitationSchema.parse(data);
    },
    acceptInvite: async (input: AcceptInviteInput) => {
      const body = acceptInviteSchema.parse(input);
      return request<{ householdId: string; memberId: string; role: string }>(
        "/api/v1/invitations/accept",
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    updateMemberRole: async (memberId: string, input: UpdateMemberRoleInput) => {
      const body = updateMemberRoleSchema.parse(input);
      return request<{ id: string; userId: string; role: string }>(
        `/api/v1/households/${encodeURIComponent(body.householdId)}/members/${encodeURIComponent(memberId)}/role`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    },
    removeMember: async (householdId: string, memberId: string) => {
      return request<{ ok: true }>(
        `/api/v1/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`,
        { method: "DELETE" },
      );
    },
    cancelInvitation: async (householdId: string, invitationId: string) => {
      return request<{ ok: true } | unknown>(
        `/api/v1/households/${encodeURIComponent(householdId)}/invitations/${encodeURIComponent(invitationId)}`,
        { method: "DELETE" },
      );
    },
    listPrivacyRequests: async (householdId: string) => {
      return request<{
        items: Array<{ id: string; kind: string; status: string; createdAt: string }>;
      }>(`/api/v1/privacy/requests?householdId=${encodeURIComponent(householdId)}`);
    },
    search: async (householdId: string, q: string) => {
      const data = await request<unknown>(
        `/api/v1/search?householdId=${encodeURIComponent(householdId)}&q=${encodeURIComponent(q)}`,
      );
      return searchResponseSchema.parse(data) as SearchResponse;
    },
    getNotifications: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/notifications?householdId=${encodeURIComponent(householdId)}`,
      );
      return notificationsResponseSchema.parse(data) as NotificationsResponse;
    },
    markNotificationRead: async (householdId: string, id: string) => {
      const data = await request<unknown>(
        `/api/v1/notifications/${encodeURIComponent(id)}/read?householdId=${encodeURIComponent(householdId)}`,
        { method: "POST" },
      );
      return notificationsResponseSchema.parse(data) as NotificationsResponse;
    },
    markAllNotificationsRead: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/notifications/read-all?householdId=${encodeURIComponent(householdId)}`,
        { method: "POST" },
      );
      return notificationsResponseSchema.parse(data) as NotificationsResponse;
    },
    getCalendar: async (householdId: string, days?: number) => {
      const qs = days != null ? `&days=${days}` : "";
      const data = await request<unknown>(
        `/api/v1/calendar?householdId=${encodeURIComponent(householdId)}${qs}`,
      );
      return calendarResponseSchema.parse(data) as CalendarResponse;
    },
    getSmartBudget: async (householdId: string, month?: string) => {
      const qs = month ? `&month=${encodeURIComponent(month)}` : "";
      const data = await request<unknown>(
        `/api/v1/smart-budget?householdId=${encodeURIComponent(householdId)}${qs}`,
      );
      return smartBudgetResponseSchema.parse(data) as SmartBudgetResponse;
    },
    adoptSmartBudget: async (input: AdoptSmartBudgetInput) => {
      const body = adoptSmartBudgetSchema.parse(input);
      const data = await request<unknown>(`/api/v1/smart-budget`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return smartBudgetResponseSchema.parse(data) as SmartBudgetResponse;
    },
    getWhatChanged: async (householdId: string, mode?: WhatChangedMode) => {
      const qs = mode ? `&mode=${encodeURIComponent(mode)}` : "";
      const data = await request<unknown>(
        `/api/v1/intelligence/what-changed?householdId=${encodeURIComponent(householdId)}${qs}`,
      );
      return whatChangedResponseSchema.parse(data) as WhatChangedResponse;
    },
    getReportExplore: async (query: {
      householdId: string;
      measure?: ReportExploreQuery["measure"];
      dimension?: ReportExploreQuery["dimension"];
      from?: string;
      to?: string;
      categoryId?: string;
      merchantId?: string;
      accountId?: string;
    }) => {
      const params = new URLSearchParams({ householdId: query.householdId });
      if (query.measure) params.set("measure", query.measure);
      if (query.dimension) params.set("dimension", query.dimension);
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.categoryId) params.set("categoryId", query.categoryId);
      if (query.merchantId) params.set("merchantId", query.merchantId);
      if (query.accountId) params.set("accountId", query.accountId);
      const data = await request<unknown>(`/api/v1/reports/explore?${params}`);
      return reportExploreResponseSchema.parse(data) as ReportExploreResponse;
    },
    getWeeklyReview: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/reports/weekly?householdId=${encodeURIComponent(householdId)}`,
      );
      return weeklyReviewSchema.parse(data) as WeeklyReview;
    },
    getMonthlyReport: async (householdId: string, period?: string) => {
      const qs = period
        ? `&period=${encodeURIComponent(period)}`
        : "";
      const data = await request<unknown>(
        `/api/v1/reports/monthly?householdId=${encodeURIComponent(householdId)}${qs}`,
      );
      return monthlyReportSchema.parse(data) as MonthlyReport;
    },
    getYearlyReport: async (householdId: string, year?: number) => {
      const qs = year != null ? `&year=${year}` : "";
      const data = await request<unknown>(
        `/api/v1/reports/yearly?householdId=${encodeURIComponent(householdId)}${qs}`,
      );
      return yearlyReportSchema.parse(data) as YearlyReport;
    },
    /* ------------------------------------------- bank statement imports */

    /**
     * Parse and preserve a statement, and return the preview.
     *
     * Writes no financial event: the household has confirmed nothing yet.
     */
    inspectStatementImport: async (input: {
      householdId: string;
      accountId: string;
      filename: string;
      contentBase64: string;
    }) => {
      return request<StatementImportPreview>("/api/v1/imports/statements/inspect", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    /** Confirm a previewed batch. Returns once queued; poll the batch for progress. */
    commitStatementImport: async (input: { householdId: string; batchId: string }) => {
      return request<{ batchId: string; status: string; queued: boolean }>(
        "/api/v1/imports/statements/commit",
        { method: "POST", body: JSON.stringify(input) },
      );
    },

    getImportHistory: async (householdId: string) => {
      return request<{ items: ImportHistoryItem[] }>(
        `/api/v1/imports/history?householdId=${encodeURIComponent(householdId)}`,
      );
    },

    getImportBatch: async (householdId: string, batchId: string) => {
      return request<ImportBatchDetail>(
        `/api/v1/imports/batches/${encodeURIComponent(batchId)}?householdId=${encodeURIComponent(householdId)}`,
      );
    },

    /* ------------------------------------------ financial intelligence */

    /** Unresolved merchant clusters: one review item per cluster, not per row. */
    getClusterReview: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/review?householdId=${encodeURIComponent(householdId)}`,
      );
      return clusterReviewResponseSchema.parse(data) as ClusterReviewResponse;
    },

    /** Answer one cluster: accept the candidate, correct it, or skip. */
    resolveCluster: async (input: ResolveClusterInput) => {
      const body = resolveClusterSchema.parse(input);
      const data = await request<unknown>("/api/v1/intelligence/clusters/resolve", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return resolveClusterResponseSchema.parse(data) as ResolveClusterResponse;
    },

    /** The classification rules the household has taught the system. */
    getClassificationRules: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/rules?householdId=${encodeURIComponent(householdId)}`,
      );
      return classificationRulesResponseSchema.parse(data) as ClassificationRulesResponse;
    },

    updateClassificationRule: async (
      ruleId: string,
      input: UpdateClassificationRuleInput,
    ) => {
      const body = updateClassificationRuleSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/intelligence/rules/${encodeURIComponent(ruleId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      return classificationRulesResponseSchema.parse(data) as ClassificationRulesResponse;
    },

    deleteClassificationRule: async (ruleId: string, householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/rules/${encodeURIComponent(ruleId)}?householdId=${encodeURIComponent(householdId)}`,
        { method: "DELETE" },
      );
      return classificationRulesResponseSchema.parse(data) as ClassificationRulesResponse;
    },

    /** Run the clustering/classification analysis for the household. */
    runIntelligenceAnalysis: async (householdId: string) => {
      return request<{
        transactionsConsidered: number;
        uniqueSignatures: number;
        clusters: number;
        merchantResolved: number;
        learnedRulesApplied: number;
        coverage: {
          total: number;
          userVerified: number;
          deterministicMatch: number;
          learnedRule: number;
          aiMatch: number;
          defaulted: number;
          unknown: number;
          meaningfullyClassified: number;
          meaningfullyClassifiedPercent: number;
        };
        recurring: {
          clustersConsidered: number;
          recurringStreams: number;
          subscriptions: number;
          recurringExpense: number;
          recurringIncome: number;
          priceChangesDetected: number;
          expectedGenerated: number;
          expectedMatched: number;
          missingExpected: number;
          reviewItems: number;
        };
      }>(
        `/api/v1/intelligence/analyse?householdId=${encodeURIComponent(householdId)}`,
        { method: "POST" },
      );
    },

    /** AI enablement + cost observability. Safe to call with AI disabled. */
    getAiStatus: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/ai/status?householdId=${encodeURIComponent(householdId)}`,
      );
      return aiStatusResponseSchema.parse(data) as AiStatusResponse;
    },

    /** AI classification dry-run: counts only, no external calls. */
    getAiDryRun: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/ai/dry-run?householdId=${encodeURIComponent(householdId)}`,
      );
      return aiDryRunReportSchema.parse(data) as AiDryRunReport;
    },

    /** Financial Brief V2: ranked deterministic findings, template or AI prose. */
    getFinancialBrief: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/brief?householdId=${encodeURIComponent(householdId)}`,
      );
      return financialBriefResponseSchema.parse(data) as FinancialBriefResponse;
    },

    /** Family summary: the three household questions, composed from the engines. */
    getFamilySummary: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/family-summary?householdId=${encodeURIComponent(householdId)}`,
      );
      return familySummaryResponseSchema.parse(data) as FamilySummaryResponse;
    },

    /** The Decision Center — one ranked list of concrete actions to take. */
    getDecisions: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/decisions/actions?householdId=${encodeURIComponent(householdId)}`,
      );
      return decisionsCenterResponseSchema.parse(data) as DecisionsCenterResponse;
    },

    /** All recurring streams, grouped, with totals, price insights and review. */
    getRecurringOverview: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/recurring?householdId=${encodeURIComponent(householdId)}`,
      );
      return recurringOverviewResponseSchema.parse(data) as RecurringOverviewResponse;
    },

    /** The household's answer: recurring or not, subscription or not. */
    verifyRecurringStream: async (
      recurringId: string,
      input: VerifyRecurringStreamInput,
    ) => {
      const body = verifyRecurringStreamSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/intelligence/recurring/${encodeURIComponent(recurringId)}/verify`,
        { method: "POST", body: JSON.stringify(body) },
      );
      return recurringOverviewResponseSchema.parse(data) as RecurringOverviewResponse;
    },

    /** Upcoming expected transactions and unresolved missing-expected notices. */
    getExpectedTransactions: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/intelligence/expected?householdId=${encodeURIComponent(householdId)}`,
      );
      return expectedTransactionsResponseSchema.parse(
        data,
      ) as ExpectedTransactionsResponse;
    },

    /** The household's liquidity requirement, derived from its own history. */
    getLiquidityRequirement: async (householdId: string) => {
      return request<LiquidityRequirementResponse>(
        `/api/v1/intelligence/liquidity?householdId=${encodeURIComponent(householdId)}`,
      );
    },

    getSpendingBaselines: async (householdId: string) => {
      return request<SpendingBaselinesResponse>(
        `/api/v1/intelligence/baselines?householdId=${encodeURIComponent(householdId)}`,
      );
    },

    getSavingsTarget: async (householdId: string) => {
      return request<SavingsTargetResponse>(
        `/api/v1/intelligence/savings-target?householdId=${encodeURIComponent(householdId)}`,
      );
    },

    getDemoInfo: async () => {
      return request<{
        email: string;
        passwordHint: string;
        asOf: string;
        reseedAllowed: boolean;
      }>("/api/v1/demo/info");
    },
    loadDemo: async () => {
      return request<{
        ok: boolean;
        householdId: string;
        email: string;
        asOf: string;
        message: string;
      }>("/api/v1/demo/load", { method: "POST" });
    },
    getBudget: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/budget?householdId=${encodeURIComponent(householdId)}`,
      );
      return budgetResponseSchema.parse(data) as BudgetResponse;
    },
    createBudget: async (input: CreateBudgetInput, options: MutationOptions = {}) => {
      const data = await request<unknown>("/api/v1/budget", {
        method: "POST",
        body: JSON.stringify(input),
        headers: options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : undefined,
      });
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
    updateRecurringStatus: async (
      recurringId: string,
      input: UpdateRecurringStatusInput,
    ) => {
      const data = await request<unknown>(
        `/api/v1/recurring/${encodeURIComponent(recurringId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(updateRecurringStatusSchema.parse(input)),
        },
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
    createVehicle: async (input: CreateVehicleInput, opts?: MutationOptions) => {
      const body = createVehicleSchema.parse(input);
      const data = await request<unknown>("/api/v1/vehicles", {
        method: "POST",
        body: JSON.stringify(body),
        idempotencyKey: opts?.idempotencyKey,
      });
      return vehicleDetailSchema.parse(data) as VehicleDetailDto;
    },
    updateVehicle: async (vehicleId: string, input: UpdateVehicleInput) => {
      const body = updateVehicleSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/vehicles/${encodeURIComponent(vehicleId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
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
    getAnomalies: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/anomalies?householdId=${encodeURIComponent(householdId)}`,
      );
      return anomaliesResponseSchema.parse(data) as AnomaliesResponse;
    },
    dismissAnomaly: async (anomalyId: string, input: DismissAnomalyInput) => {
      const data = await request<unknown>(
        `/api/v1/anomalies/${encodeURIComponent(anomalyId)}/dismiss`,
        {
          method: "POST",
          body: JSON.stringify(dismissAnomalySchema.parse(input)),
        },
      );
      return anomaliesResponseSchema.parse(data) as AnomaliesResponse;
    },
    getAnalysisRuns: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/analysis-runs?householdId=${encodeURIComponent(householdId)}`,
      );
      return analysisRunsResponseSchema.parse(data) as AnalysisRunsResponse;
    },
    getAuditLogs: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/audit-logs?householdId=${encodeURIComponent(householdId)}`,
      );
      return auditLogsResponseSchema.parse(data) as AuditLogsResponse;
    },
    getVehicleMarket: async (householdId: string, vehicleId?: string) => {
      const qs = new URLSearchParams({ householdId });
      if (vehicleId) qs.set("vehicleId", vehicleId);
      const data = await request<unknown>(`/api/v1/vehicle-market?${qs}`);
      return vehicleMarketResponseSchema.parse(data) as VehicleMarketResponse;
    },
    createVehicleCandidate: async (input: CreateVehicleCandidateInput) => {
      const body = createVehicleCandidateSchema.parse(input);
      const data = await request<unknown>("/api/v1/vehicle-candidates", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return data as { id: string; created: boolean };
    },
    createVehicleCandidateFromListing: async (
      input: CreateVehicleCandidateFromListingInput,
    ) => {
      const body = createVehicleCandidateFromListingSchema.parse(input);
      const data = await request<unknown>(
        "/api/v1/vehicle-candidates/from-listing",
        { method: "POST", body: JSON.stringify(body) },
      );
      return data as { id: string; created: boolean };
    },
    updateVehicleCandidate: async (
      candidateId: string,
      input: UpdateVehicleCandidateInput,
    ) => {
      const body = updateVehicleCandidateSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/vehicle-candidates/${encodeURIComponent(candidateId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      return data as { id: string; updated: boolean };
    },
    archiveVehicleCandidate: async (householdId: string, candidateId: string) => {
      const data = await request<unknown>(
        `/api/v1/vehicle-candidates/${encodeURIComponent(candidateId)}?householdId=${encodeURIComponent(householdId)}`,
        { method: "DELETE" },
      );
      return data as { id: string; archived: boolean };
    },
    getDocuments: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/documents?householdId=${encodeURIComponent(householdId)}`,
      );
      return documentsResponseSchema.parse(data) as DocumentsResponse;
    },
    getDocument: async (householdId: string, documentId: string) => {
      const data = await request<unknown>(
        `/api/v1/documents/${encodeURIComponent(documentId)}?householdId=${encodeURIComponent(householdId)}`,
      );
      return documentDetailSchema.parse(data) as DocumentDetailDto;
    },
    uploadDocument: async (input: UploadDocumentInput) => {
      const data = await request<unknown>("/api/v1/documents/upload", {
        method: "POST",
        body: JSON.stringify(uploadDocumentSchema.parse(input)),
      });
      return documentDetailSchema.parse(data) as DocumentDetailDto;
    },
    updateDocument: async (documentId: string, input: UpdateDocumentInput) => {
      const data = await request<unknown>(
        `/api/v1/documents/${encodeURIComponent(documentId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(updateDocumentSchema.parse(input)),
        },
      );
      return documentDetailSchema.parse(data) as DocumentDetailDto;
    },
    reextractDocument: async (householdId: string, documentId: string) => {
      const data = await request<unknown>(
        `/api/v1/documents/${encodeURIComponent(documentId)}/extract?householdId=${encodeURIComponent(householdId)}`,
        { method: "POST" },
      );
      return documentDetailSchema.parse(data) as DocumentDetailDto;
    },
    getIntegrations: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/integrations?householdId=${encodeURIComponent(householdId)}`,
      );
      return integrationsResponseSchema.parse(data) as IntegrationsResponse;
    },
    createSource: async (input: CreateSourceInput) => {
      const body = createSourceSchema.parse(input);
      const data = await request<unknown>("/api/v1/sources", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return sourceSchema.parse(data) as SourceDto;
    },
    updateSource: async (sourceId: string, input: UpdateSourceInput) => {
      const body = updateSourceSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/sources/${encodeURIComponent(sourceId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      return sourceSchema.parse(data) as SourceDto;
    },
    archiveSource: async (householdId: string, sourceId: string) => {
      const data = await request<unknown>(
        `/api/v1/sources/${encodeURIComponent(sourceId)}?householdId=${encodeURIComponent(householdId)}`,
        { method: "DELETE" },
      );
      return sourceSchema.parse(data) as SourceDto;
    },
    reconnectSource: async (sourceId: string, input: ReconnectSourceInput) => {
      const body = reconnectSourceSchema.parse(input);
      const data = await request<unknown>(
        `/api/v1/sources/${encodeURIComponent(sourceId)}/reconnect`,
        { method: "POST", body: JSON.stringify(body) },
      );
      return syncResultSchema.parse(data) as SyncResultDto;
    },
    syncSource: async (householdId: string, sourceId: string) => {
      const data = await request<unknown>(
        `/api/v1/sources/${encodeURIComponent(sourceId)}/sync`,
        {
          method: "POST",
          body: JSON.stringify({ householdId }),
        },
      );
      return syncResultSchema.parse(data) as SyncResultDto;
    },
    getImports: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/imports?householdId=${encodeURIComponent(householdId)}`,
      );
      return importsResponseSchema.parse(data) as ImportsResponse;
    },
    triggerFakeSync: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/integrations/sync?householdId=${encodeURIComponent(householdId)}`,
        { method: "POST" },
      );
      return syncResultSchema.parse(data) as SyncResultDto;
    },
    getFeatureFlags: async () => {
      const data = await request<unknown>("/api/v1/feature-flags");
      return featureFlagsResponseSchema.parse(data) as FeatureFlagsResponse;
    },
    getAdvisorBrief: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/advisor/brief?householdId=${encodeURIComponent(householdId)}`,
      );
      return advisorBriefResponseSchema.parse(data) as AdvisorBriefResponse;
    },
    advisorChat: async (input: AdvisorChatInput) => {
      const body = advisorChatRequestSchema.parse(input);
      const data = await request<unknown>("/api/v1/advisor/chat", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return advisorChatResponseSchema.parse(data) as AdvisorChatResponse;
    },
    getRecommendationOutcomes: async (householdId: string) => {
      const data = await request<unknown>(
        `/api/v1/advisor/outcomes?householdId=${encodeURIComponent(householdId)}`,
      );
      return recommendationOutcomesResponseSchema.parse(
        data,
      ) as RecommendationOutcomesResponse;
    },
    trackRecommendationOutcome: async (
      input: TrackRecommendationOutcomeInput,
    ) => {
      const data = await request<unknown>("/api/v1/advisor/outcomes", {
        method: "POST",
        body: JSON.stringify(trackRecommendationOutcomeSchema.parse(input)),
      });
      return data as { id: string; created: boolean };
    },
    updateRecommendationOutcome: async (
      outcomeId: string,
      input: UpdateRecommendationOutcomeInput,
    ) => {
      const data = await request<unknown>(
        `/api/v1/advisor/outcomes/${encodeURIComponent(outcomeId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(updateRecommendationOutcomeSchema.parse(input)),
        },
      );
      return recommendationOutcomesResponseSchema.parse(
        data,
      ) as RecommendationOutcomesResponse;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/* ----------------------------------------------- bank statement imports */

export type StatementBalanceChainStatus =
  | "RECONCILED"
  | "RECONCILED_WITH_WARNINGS"
  | "BROKEN"
  | "INSUFFICIENT_DATA";

export type StatementPreviewRow = {
  rowNumber: number;
  bookingDate: string;
  text: string;
  amountMinor: string | null;
  reportedBalanceMinor: string | null;
  status: "NEW" | "ALREADY_IMPORTED" | "INVALID";
  issue?: string;
  detail?: string;
};

export type StatementImportPreview = {
  batchId: string;
  provider: string;
  format: string;
  formatVersion: number;
  fileName: string;
  accountId: string;
  accountName: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalRows: number;
  newRows: number;
  existingRows: number;
  invalidRows: number;
  closingBalanceMinor: string | null;
  balanceChain: {
    status: StatementBalanceChainStatus;
    direction: "ASCENDING" | "DESCENDING" | "UNDETERMINED";
    rowsChecked: number;
    rowsReconciled: number;
    breakCount: number;
    breaks: Array<{
      rowNumber: number;
      bookingDate: string;
      expectedBalanceMinor: string;
      reportedBalanceMinor: string;
      differenceMinor: string;
    }>;
  };
  sample: StatementPreviewRow[];
  invalidSample: StatementPreviewRow[];
};

export type ImportHistoryItem = {
  id: string;
  provider: string | null;
  format: string | null;
  fileName: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  totalRecords: number;
  newRecords: number;
  existingRecords: number;
  reviewRecords: number;
  invalidRecords: number;
  failedCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  balanceChainStatus: string | null;
  closingBalanceMinor: string | null;
  accountName: string | null;
  accountId: string | null;
};

export type ImportBatchDetail = {
  id: string;
  provider: string | null;
  format: string | null;
  fileName: string | null;
  fileHash: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  accountId: string | null;
  accountName: string | null;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalRecords: number;
  newRecords: number;
  existingRecords: number;
  reviewRecords: number;
  invalidRecords: number;
  failedCount: number;
  balanceChainStatus: string | null;
  balanceChain: Record<string, unknown> | null;
  closingBalanceMinor: string | null;
  invalidRows: Array<{ rowNumber: number | null; detail: string; issue: string | null }>;
};

/* --------------------------------------------- financial intelligence */

export type LiquidityComponentKey =
  | "OPERATING_CASH"
  | "EMERGENCY_RESERVE"
  | "IRREGULAR_EXPENSE_RESERVE"
  | "EXPENSE_VOLATILITY_BUFFER"
  | "INCOME_RISK_BUFFER"
  | "UPCOMING_PLANNED_EXPENSES"
  | "SAFETY_MARGIN"
  | "SINKING_FUNDS";

export type LiquidityRequirementResponse = {
  asOf: string;
  currency: string;
  requirement: {
    minimumMinor: string;
    recommendedMinor: string;
    conservativeMinor: string;
    surplusMinor: string;
    shortfallMinor: string;
    confidence: "LOW" | "MODERATE" | "HIGH";
    confidenceReasons: string[];
    components: Array<{
      key: LiquidityComponentKey;
      amountMinor: string;
      reason: string;
    }>;
  };
  liquidCashMinor: string;
  policyComparison: {
    configuredEmergencyFundMinor: string;
    derivedEmergencyReserveMinor: string;
    differenceMinor: string;
  } | null;
  runway: {
    normalMonths: number | null;
    essentialOnlyMonths: number | null;
    incomeReducedMonths: number | null;
  };
  stress: Array<{
    key: string;
    label: string;
    remainingCashMinor: string;
    survives: boolean;
  }>;
  backtest: {
    monthsTested: number;
    monthsSurvived: number;
    breachCount: number;
    largestBreachMinor: string | null;
    breaches: Array<{ month: string; shortfallMinor: string }>;
  };
  resilience: {
    dimensions: Array<{
      key: string;
      label: string;
      level: "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";
      detail: string;
    }>;
  };
  basis: {
    monthsOfHistory: number;
    firstMonth: string | null;
    lastMonth: string | null;
    essentialMedianMinor: string | null;
    essentialP75Minor: string | null;
    essentialP90Minor: string | null;
    incomeVolatilityBps: number | null;
    expenseVolatilityBps: number | null;
    largestIncomeShareBps: number | null;
    coveragePercent: number;
    dataAgeDays: number;
    categorisedShareBps: number | null;
    unknownNecessityShareBps: number | null;
    emptyMonths: number;
  };
};

export type SpendingBaselineWindow = {
  window: string;
  monthsObserved: number;
  insufficient: boolean;
  medianMinor: string | null;
  trimmedMeanMinor: string | null;
  p25Minor: string | null;
  p75Minor: string | null;
  p90Minor: string | null;
};

export type SpendingBaselinesResponse = {
  asOf: string;
  currency: string;
  windows: Record<"3m" | "6m" | "12m" | "24m", SpendingBaselineWindow>;
  monthsOfHistory: number;
};

export type SavingsTargetResponse = {
  asOf: string;
  currency: string;
  normalMonthlySurplusMinor: string;
  cashflowNegative: boolean;
  totalAllocatedMinor: string;
  allocations: Array<{ key: string; label: string; amountMinor: string }>;
  notes: string[];
  availableSurplusMinor: string;
  shortfallMinor: string;
  confidence: "LOW" | "MODERATE" | "HIGH";
};
