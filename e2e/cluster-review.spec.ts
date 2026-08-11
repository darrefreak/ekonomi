import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { gotoRoute } from "./helpers/route-identity";

/**
 * Needs Review at the cluster level, exercised through the real UI.
 *
 * The flow a household actually performs: an imported pattern the system cannot
 * name shows up as ONE review card, the user corrects it and asks the system to
 * remember, the card leaves the queue, and the taught rule is visible — and
 * removable — under Inställningar. Runs on desktop and mobile; on mobile the
 * whole path must work without horizontal overflow.
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
  const body = (await response.json()) as {
    tokens: { accessToken: string };
  };
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

/**
 * Import a small statement whose description no rule recognises, so the
 * pattern must land in Needs Review. Uses the real importer — no direct writes.
 */
async function importUnknownPattern(
  request: APIRequestContext,
  session: Session,
  patternText: string,
  count: number,
): Promise<void> {
  const headers = { Authorization: `Bearer ${session.token}` };
  const account = await request.post(`${API_URL}/api/v1/accounts`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      householdId: session.householdId,
      name: `E2E granskningskonto ${Date.now()}`,
      accountType: "CHECKING",
      currency: "SEK",
      openingBalanceMinor: "0",
    },
  });
  expect(account.ok(), await account.text()).toBeTruthy();
  const accountId = ((await account.json()) as { id: string }).id;

  const lines = ["Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo"];
  let balance = 0;
  for (let index = 0; index < count; index += 1) {
    const amount = -15_000 - index * 500;
    balance += amount;
    const month = String(1 + (index % 6)).padStart(2, "0");
    lines.push(
      `2026-${month}-10;2026-${month}-10;${770000 + index};${patternText};${toSebDecimal(amount)};${toSebDecimal(balance)}`,
    );
  }
  const csv = `\ufeff${lines.join("\n")}\n`;

  const inspect = await request.post(`${API_URL}/api/v1/imports/statements/inspect`, {
    headers,
    data: {
      householdId: session.householdId,
      accountId,
      filename: "e2e-granskning.csv",
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

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("review a cluster, teach a rule, and manage it in settings", async ({
  page,
  request,
}, testInfo) => {
  // The signature engine strips digits as noise, so uniqueness must be
  // alphabetic or every run would collapse into one already-answered cluster.
  const stamp = String(Date.now())
    .split("")
    .map((digit) => "ABCDEFGHIJ"[Number(digit)])
    .join("");
  const patternText = `ZZE2E VERKSTAD ${stamp}`;
  const merchantName = `E2E Verkstan ${stamp}`;
  const session = await login(request);
  await importUnknownPattern(request, session, patternText, 6);

  // The unresolved pattern is ONE card, showing the transaction count.
  await gotoRoute(page, "/review");
  const card = page.locator("li").filter({ hasText: patternText });
  await expect(card).toHaveCount(1, { timeout: 20_000 });
  await expect(card).toContainText("6 transaktioner");
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);

  // Correct it: name the merchant, keep "remember for the future" checked,
  // and the button says how many transactions the answer will touch.
  await card.getByRole("button", { name: "Rätta" }).click();
  await card.getByLabel(/mottagare/i).fill(merchantName);
  await expect(card.getByRole("checkbox")).toBeChecked();
  await expect(card).toContainText("kommer att kategorisera 6");
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);
  await card.getByRole("button", { name: "Använd på 6" }).click();

  // The answered question leaves the queue without a manual refresh.
  await expect(card).toHaveCount(0, { timeout: 20_000 });

  // The taught rule is visible under Inställningar, and can be removed.
  await gotoRoute(page, "/settings");
  const rulesSection = page
    .locator("section")
    .filter({ hasText: "Inlärda regler" });
  const ruleRow = rulesSection.locator("li").filter({ hasText: merchantName });
  await expect(ruleRow).toHaveCount(1, { timeout: 20_000 });
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);
  await ruleRow.getByRole("button", { name: "Ta bort" }).click();
  await expect(ruleRow).toHaveCount(0, { timeout: 20_000 });
});
