import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { gotoRoute } from "./helpers/route-identity";

/**
 * Recurring streams and subscriptions through the real product.
 *
 * The flow a household performs: a monthly charge is imported through the real
 * SEB importer, the analysis detects it as a recurring stream, the household
 * names the merchant once, and the subscriptions page then shows the
 * subscription with its price history (179 → 199 → 219), its next expected
 * window and the upcoming expectation — and the household's "not a
 * subscription" answer sticks. On mobile the entire path must work without
 * horizontal overflow (§55).
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3001";
const DEMO_EMAIL = "demo@ffos.local";
const DEMO_PASSWORD = "demo-password-123";

type Session = { token: string; householdId: string };

async function login(request: APIRequestContext): Promise<Session> {
  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { tokens: { accessToken: string } };
  const households = await request.get(`${API_URL}/api/v1/households`, {
    headers: { Authorization: `Bearer ${body.tokens.accessToken}` },
  });
  const list = (await households.json()) as Array<{ id: string }>;
  return { token: body.tokens.accessToken, householdId: list[0]!.id };
}

function toSebDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const value = Math.abs(minor);
  return `${sign}${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}0`;
}

/** Monthly dates on the 15th, ending July 2026 (the demo clock is 2026-08-01). */
function monthlyDates(count: number): string[] {
  const dates: string[] = [];
  let year = 2026;
  let month = 7;
  for (let i = 0; i < count; i += 1) {
    dates.unshift(`${year}-${String(month).padStart(2, "0")}-15`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return dates;
}

/**
 * Import a monthly charge with two price rises through the real importer, then
 * run the analysis. 179 kr × 4, 199 kr × 3, 219 kr × 3 — one stream, real
 * price history.
 */
async function importPriceRisingSubscription(
  request: APIRequestContext,
  session: Session,
  patternText: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${session.token}` };
  const account = await request.post(`${API_URL}/api/v1/accounts`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      householdId: session.householdId,
      name: `E2E abonnemangskonto ${Date.now()}`,
      accountType: "CHECKING",
      currency: "SEK",
      openingBalanceMinor: "0",
    },
  });
  expect(account.ok(), await account.text()).toBeTruthy();
  const accountId = ((await account.json()) as { id: string }).id;

  const amounts = [
    -17_900, -17_900, -17_900, -17_900, -19_900, -19_900, -19_900, -21_900, -21_900,
    -21_900,
  ];
  const dates = monthlyDates(amounts.length);
  const lines = ["Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo"];
  let balance = 0;
  for (let index = 0; index < amounts.length; index += 1) {
    balance += amounts[index]!;
    lines.push(
      `${dates[index]};${dates[index]};${880000 + index};${patternText};${toSebDecimal(amounts[index]!)};${toSebDecimal(balance)}`,
    );
  }
  const csv = `\ufeff${lines.join("\n")}\n`;

  const inspect = await request.post(`${API_URL}/api/v1/imports/statements/inspect`, {
    headers,
    data: {
      householdId: session.householdId,
      accountId,
      filename: "e2e-abonnemang.csv",
      contentBase64: Buffer.from(csv, "utf-8").toString("base64"),
    },
  });
  expect(inspect.ok(), await inspect.text()).toBeTruthy();
  const batchId = ((await inspect.json()) as { batchId: string }).batchId;
  await request.post(`${API_URL}/api/v1/imports/statements/commit`, {
    headers,
    data: { householdId: session.householdId, batchId },
  });
  await expect
    .poll(
      async () => {
        const batch = await request.get(
          `${API_URL}/api/v1/imports/batches/${batchId}?householdId=${session.householdId}`,
          { headers },
        );
        return ((await batch.json()) as { status: string }).status;
      },
      { timeout: 120_000 },
    )
    .toMatch(/COMPLETED/);

  const analyse = await request.post(
    `${API_URL}/api/v1/intelligence/analyse?householdId=${session.householdId}`,
    { headers },
  );
  expect(analyse.ok(), await analyse.text()).toBeTruthy();
}

/**
 * Name the imported pattern's cluster once, the way a person would in Needs
 * Review. The name contains a subscription keyword, so the recurring pipeline
 * can classify the stream's kind deterministically on the next run.
 */
async function nameCluster(
  request: APIRequestContext,
  session: Session,
  patternText: string,
  merchantName: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${session.token}` };
  const review = await request.get(
    `${API_URL}/api/v1/intelligence/review?householdId=${session.householdId}`,
    { headers },
  );
  const queue = (await review.json()) as {
    items: Array<{ id: string; representativeDescription: string }>;
  };
  const item = queue.items.find((candidate) =>
    candidate.representativeDescription.includes(patternText),
  );
  expect(item, "the imported pattern is in Needs Review").toBeTruthy();

  const resolve = await request.post(`${API_URL}/api/v1/intelligence/clusters/resolve`, {
    headers,
    data: {
      householdId: session.householdId,
      clusterId: item!.id,
      action: "correct",
      merchantName,
      rememberRule: true,
    },
  });
  expect(resolve.ok(), await resolve.text()).toBeTruthy();

  // Re-run so the recurring pipeline sees the named merchant.
  const analyse = await request.post(
    `${API_URL}/api/v1/intelligence/analyse?householdId=${session.householdId}`,
    { headers },
  );
  expect(analyse.ok(), await analyse.text()).toBeTruthy();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("a detected subscription shows price history and next window, and the household's answer sticks", async ({
  page,
  request,
}, testInfo) => {
  // Digits are stripped by the signature engine, so uniqueness is alphabetic.
  const stamp = String(Date.now())
    .split("")
    .map((digit) => "ABCDEFGHIJ"[Number(digit)])
    .join("");
  const patternText = `ZZE2E PREN ${stamp}`;
  const merchantName = `Spotify E2E ${stamp}`;
  const session = await login(request);

  await importPriceRisingSubscription(request, session, patternText);
  await nameCluster(request, session, patternText, merchantName);

  // The recurring surface shows the stream as a subscription.
  await gotoRoute(page, "/subscriptions");
  const card = page
    .getByTestId("subscription-card")
    .filter({ hasText: merchantName });
  await expect(card).toHaveCount(1, { timeout: 20_000 });
  await expect(card).toContainText("månadsvis");
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);

  // The price rise is visible: 199 → 219 with its date and annual impact.
  await expect(card.getByTestId("price-change")).toContainText("199");
  await expect(card.getByTestId("price-change")).toContainText("219");

  // Full price history on demand: 179 → 199 → 219.
  await card.getByRole("button", { name: "Visa prishistorik" }).click();
  const history = card.getByTestId("price-history");
  await expect(history).toContainText("179");
  await expect(history).toContainText("199");
  await expect(history).toContainText("219");
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);

  // The next charge is a projected window in the future.
  await expect(card.getByTestId("next-expected")).toContainText(/2026-08/);

  // The upcoming expectation is on the same surface, as a range.
  const upcoming = page
    .getByTestId("expected-upcoming")
    .filter({ hasText: merchantName });
  await expect(upcoming).toHaveCount(1);
  await expect(upcoming).toContainText("219");
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);

  // "Not a subscription" — the stream stays recurring but leaves the
  // subscription list, and the answer is the household's, not the detector's.
  await card.getByRole("button", { name: "Inte ett abonnemang" }).click();
  await expect(card).toHaveCount(0, { timeout: 20_000 });
  const row = page.getByTestId("recurring-row").filter({ hasText: merchantName });
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);
});
