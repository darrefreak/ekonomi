import { test, expect, type Page } from "@playwright/test";

/**
 * RT-002 (B5): one user submission must never become two economic effects,
 * whether the duplicate comes from the user's finger or from the network.
 */

async function countTransactions(page: Page, description: string): Promise<number> {
  await page.goto("/transactions");
  const search = page.getByPlaceholder(/sök merchant, kategori/i);
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(description);
  await page.getByRole("button", { name: /^filtrera$/i }).click();
  // The list is client-fetched; let the filtered query settle before counting.
  await page.waitForTimeout(2000);
  return page.locator(`a[href^="/transactions/"]`, { hasText: description }).count();
}

async function fillExpense(page: Page, description: string) {
  await page.goto("/transactions");
  await page.getByRole("button", { name: /ny händelse/i }).click();

  const form = page.locator("form").filter({ hasText: /belopp \(kr\)/i });
  await expect(form).toBeVisible();

  // First select is the cash account; the second is the optional category.
  const accountSelect = form.locator("select").first();
  await expect(accountSelect.locator("option").nth(1)).toBeAttached({
    timeout: 15_000,
  });
  await accountSelect.selectOption({ index: 1 });

  await form.getByPlaceholder("0").fill("1000");
  await form
    .locator("label")
    .filter({ hasText: /beskrivning/i })
    .locator("input")
    .fill(description);

  return form;
}

test.describe("idempotency", () => {
  test("B5 double-tapping submit creates exactly one expense", async ({ page }) => {
    const description = `Dubbeltryck ${Date.now()}`;
    const form = await fillExpense(page, description);

    const submit = form.getByRole("button", { name: /skapa utgift/i });
    // Two activations as fast as the browser allows — the real double-tap.
    await Promise.all([
      submit.click({ force: true }),
      submit.click({ force: true, noWaitAfter: true }).catch(() => {}),
    ]);

    await expect(page.getByRole("button", { name: /ny händelse/i })).toBeVisible({
      timeout: 20_000,
    });
    expect(await countTransactions(page, description)).toBe(1);
  });

  test("B5b a replayed HTTP request with the same key creates exactly one expense", async ({
    page,
  }) => {
    const description = `Nätverksretry ${Date.now()}`;

    // Replay every expense POST verbatim, headers included. This is the gateway/
    // network retry the Idempotency-Key exists to survive.
    let replays = 0;
    await page.route("**/ledger/expenses", async (route) => {
      const request = route.request();
      const response = await route.fetch();
      const replay = await page.request.fetch(request.url(), {
        method: "POST",
        headers: request.headers(),
        data: request.postData() ?? undefined,
      });
      replays += 1;
      expect(
        replay.status(),
        "replay of an identical command must be accepted, not duplicated",
      ).toBeLessThan(300);
      await route.fulfill({ response });
    });

    const form = await fillExpense(page, description);
    await form.getByRole("button", { name: /skapa utgift/i }).click();

    await expect(page.getByRole("button", { name: /ny händelse/i })).toBeVisible({
      timeout: 20_000,
    });
    expect(replays, "the POST must have been replayed once").toBe(1);
    expect(await countTransactions(page, description)).toBe(1);
  });
});
