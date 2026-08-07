import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  createAssetDepreciationSchema,
  createInternalTransferSchema,
  jobPayloadSchema,
  listTransactionsQuerySchema,
  vehicleWriteSchema,
} from "@ffos/schemas";
import { ZodValidationPipe } from "./zod-validation.pipe";
import { ValidationExceptionFilter } from "./validation-exception.filter";

test("ZodValidationPipe rejects malformed amountMinor with VALIDATION_ERROR", () => {
  const pipe = new ZodValidationPipe(createInternalTransferSchema);
  assert.throws(
    () =>
      pipe.transform({
        householdId: "11111111-1111-4111-8111-111111111111",
        fromAccountId: "11111111-1111-4111-8111-111111111112",
        toAccountId: "11111111-1111-4111-8111-111111111113",
        amountMinor: "1e6",
        occurredOn: "2026-08-01",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { code?: string; issues?: unknown[] };
      assert.equal(body.code, "VALIDATION_ERROR");
      assert.ok(Array.isArray(body.issues));
      return true;
    },
  );
});

test("ZodValidationPipe rejects unknown mass-assignment fields", () => {
  const pipe = new ZodValidationPipe(createAssetDepreciationSchema);
  assert.throws(() =>
    pipe.transform({
      householdId: "11111111-1111-4111-8111-111111111111",
      assetAccountId: "11111111-1111-4111-8111-111111111112",
      expenseAccountId: "11111111-1111-4111-8111-111111111113",
      amountMinor: "100",
      occurredOn: "2026-08-01",
      balanceOverride: "999999",
      isAdmin: true,
    }),
  );
});

test("ValidationExceptionFilter returns stable error envelope with fields", () => {
  const filter = new ValidationExceptionFilter();
  let statusCode = 0;
  let payload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return body;
    },
  };
  const req = { headers: { "x-request-id": "req-test-1" } };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  };

  filter.catch(
    new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Kontrollera uppgifterna och försök igen.",
      issues: [
        { path: ["amountMinor"], message: "Belopp måste vara ett heltalsvärde i öre" },
      ],
    }),
    host as never,
  );

  assert.equal(statusCode, 400);
  const body = payload as {
    error: {
      code: string;
      message: string;
      fields?: Record<string, string>;
      requestId?: string;
    };
  };
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.requestId, "req-test-1");
  assert.equal(
    body.error.fields?.amountMinor,
    "Belopp måste vara ett heltalsvärde i öre",
  );
});

test("pagination rejects negative and excessive limits", () => {
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      limit: "0",
    }).success,
    false,
  );
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      limit: "201",
    }).success,
    false,
  );
  assert.equal(
    listTransactionsQuerySchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      sort: "drop_table",
    }).success,
    false,
  );
});

test("job payload rejects malformed household for reconcile", () => {
  assert.equal(
    jobPayloadSchema.safeParse({
      type: "RECONCILE_ACCOUNT_BALANCES",
      householdId: "not-uuid",
    }).success,
    false,
  );
});

test("vehicle schema rejects lease end before start", () => {
  assert.equal(
    vehicleWriteSchema.safeParse({
      householdId: "11111111-1111-4111-8111-111111111111",
      name: "Leasebil",
      make: "Tesla",
      model: "Y",
      modelYear: 2024,
      fuelType: "ELECTRIC",
      ownershipType: "LEASED",
      leaseStartDate: "2026-08-01",
      leaseEndDate: "2025-01-01",
    }).success,
    false,
  );
});
