import { test, expect, type Page } from "@playwright/test";

/**
 * The SEB import flow, driven through the browser on desktop and mobile.
 *
 * The statement is synthetic and built in the test: no real bank data is used
 * anywhere in this repository. It is deliberately small — the scale case is
 * covered by the integration suite and the acceptance probe — because what this
 * test is for is the flow a person actually goes through.
 */

const HEADER =
  "Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo";

/** Öre to SEB's three-decimal form, so the fixture matches the real shape. */
function sebDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}0`;
}

/** A statement whose reported balance chains exactly. */
function buildStatement(rows: Array<{ date: string; text: string; minor: number }>) {
  let balance = 1_000_000;
  const lines = rows.map((row, index) => {
    balance += row.minor;
    return [
      row.date,
      row.date,
      String(500_001 + index),
      row.text,
      sebDecimal(row.minor),
      sebDecimal(balance),
    ].join(";");
  });
  return `\uFEFF${HEADER}\n${lines.join("\n")}\n`;
}

/**
 * Dated relative to today.
 *
 * The transaction list shows the most recent 80, so a statement from six months
 * ago imports correctly and still falls off the first page — which would make
 * this test about pagination rather than about the import showing up.
 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const STATEMENT = buildStatement([
  { date: daysAgo(5), text: "LÖN ARBETSGIVARE AB", minor: 3_600_000 },
  { date: daysAgo(4), text: "ICA MAXI STORMARKNAD", minor: -124_800 },
  { date: daysAgo(3), text: "APOTEKET AB", minor: -8_900 },
  { date: daysAgo(2), text: "SL BILJETT", minor: -3_900 },
  { date: daysAgo(1), text: "HYRA BOSTAD", minor: -1_250_000 },
]);

/** Attach a file to the flow's input without touching the filesystem. */
async function attachStatement(page: Page, name = "kontoutdrag.csv") {
  await page.getByLabel(/välj csv-fil/i).setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(STATEMENT, "utf8"),
  });
}

/** A statement import needs somewhere to go; make sure a SEK account exists. */
async function ensureImportableAccount(page: Page): Promise<string> {
  await page.goto("/accounts");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /nytt konto/i }).click();
  const name = `SEB Import ${Date.now().toString(36).slice(-5)}`;
  await page.getByLabel(/^namn$/i).first().fill(name);
  await page.getByRole("button", { name: /^skapa konto$/i }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  return name;
}

// Importing now flows into the real analysis pipeline, which needs more than
// the default 60 s budget on a household that accumulates data across runs.
test.describe.configure({ timeout: 180_000 });

test.describe("SEB statement import", () => {
  test("a statement is previewed before anything is booked, then imported", async ({ page }) => {
    const accountName = await ensureImportableAccount(page);

    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: /^importer$/i })).toBeVisible();
    await expect(
      page.getByText(/importera kontoutdrag från seb/i),
      "the import entry point is on the page",
    ).toBeVisible();

    await attachStatement(page);
    await page.getByLabel(/konto att importera till/i).selectOption({ label: accountName });
    await page.getByRole("button", { name: /granska innehållet/i }).click();

    // The preview states what the file contains, in the participant's terms.
    await expect(page.getByText(/seb kontoutdrag/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("kontoutdrag.csv").first()).toBeVisible();
    await expect(page.getByText(accountName).first()).toBeVisible();
    await expect(page.getByText(/kontoutdraget går ihop/i)).toBeVisible();

    // And confirmation is explicit: the button says what will happen.
    const confirm = page.getByRole("button", { name: /^importera 5 transaktioner$/i });
    await expect(confirm).toBeVisible();

    await confirm.click();

    // A successful import flows straight into the analysis experience: the
    // pipeline runs for real and ends in a summary, not a generic done screen.
    await expect(page.getByTestId("analysis-complete")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/din ekonomi är analyserad/i)).toBeVisible();
    await expect(page.getByText(/transaktioner analyserade/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /gå till översikten/i }),
    ).toBeVisible();

    // The transactions are visible without a manual reload.
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/transactions/);
    // Searched rather than scrolled: the list shows the most recent 80 and this
    // household accumulates data across runs, so searching is what makes the
    // assertion about the import rather than about pagination.
    await page.getByLabel(/sök transaktioner/i).fill("ICA MAXI STORMARKNAD");
    await expect(
      page.getByText(/ICA MAXI STORMARKNAD/i).first(),
    ).toBeAttached({ timeout: 20_000 });
  });

  test("importing the same file again offers nothing to import", async ({ page }) => {
    const accountName = await ensureImportableAccount(page);
    await page.goto("/imports");

    // First pass.
    await attachStatement(page);
    await page.getByLabel(/konto att importera till/i).selectOption({ label: accountName });
    await page.getByRole("button", { name: /granska innehållet/i }).click();
    await page.getByRole("button", { name: /^importera 5 transaktioner$/i }).click();
    await expect(page.getByTestId("analysis-complete")).toBeVisible({
      timeout: 120_000,
    });

    // Second pass, same bytes.
    await page.getByRole("button", { name: /importera en till fil/i }).click();
    await attachStatement(page);
    await page.getByLabel(/konto att importera till/i).selectOption({ label: accountName });
    await page.getByRole("button", { name: /granska innehållet/i }).click();

    await expect(page.getByText(/seb kontoutdrag/i)).toBeVisible({ timeout: 30_000 });
    const disabled = page.getByRole("button", { name: /inget nytt att importera/i });
    await expect(disabled, "the file is recognised as already imported").toBeVisible();
    await expect(disabled).toBeDisabled();
  });

  test("a file that is not a SEB statement is refused in plain Swedish", async ({ page }) => {
    const accountName = await ensureImportableAccount(page);
    await page.goto("/imports");

    await page.getByLabel(/välj csv-fil/i).setInputFiles({
      name: "nagot-annat.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Datum,Belopp\n2026-01-01,100\n", "utf8"),
    });
    await page.getByLabel(/konto att importera till/i).selectOption({ label: accountName });
    await page.getByRole("button", { name: /granska innehållet/i }).click();

    const alert = page.locator('section [role="alert"]');
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/känns inte igen/i);
    // No stack trace, no HTTP status as the message.
    await expect(alert).not.toContainText(/400|error|exception/i);
  });

  test("the import history records what happened", async ({ page }) => {
    const accountName = await ensureImportableAccount(page);
    await page.goto("/imports");
    await attachStatement(page);
    await page.getByLabel(/konto att importera till/i).selectOption({ label: accountName });
    await page.getByRole("button", { name: /granska innehållet/i }).click();
    await page.getByRole("button", { name: /^importera 5 transaktioner$/i }).click();
    await expect(page.getByTestId("analysis-complete")).toBeVisible({
      timeout: 120_000,
    });

    await page.reload();
    await expect(page.getByText(/tidigare importer/i)).toBeVisible();
    const entry = page.getByText(new RegExp(`SEB · ${accountName}`)).first();
    await expect(entry).toBeVisible({ timeout: 20_000 });
    // Period and counts, not developer vocabulary.
    await expect(page.getByText(/redan importerade/i).first()).toBeVisible();
    await expect(page.getByText(/saldona går ihop/i).first()).toBeVisible();
  });
});

test.describe("SEB import on a phone", () => {
  test("the whole flow is usable at mobile width without sideways scrolling", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile viewport only");

    const accountName = await ensureImportableAccount(page);
    await page.goto("/imports");

    await attachStatement(page);
    await page.getByLabel(/konto att importera till/i).selectOption({ label: accountName });
    await page.getByRole("button", { name: /granska innehållet/i }).click();
    await expect(page.getByText(/seb kontoutdrag/i)).toBeVisible({ timeout: 30_000 });

    // The desktop table is not what a phone gets: it stays in the DOM but hidden,
    // and the same rows are rendered as cards.
    await expect(page.locator("table")).toBeHidden();
    await expect(
      page.locator("li").filter({ hasText: /ICA MAXI STORMARKNAD/i }).first(),
      "the sample is rendered as cards on a phone",
    ).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the preview must not scroll sideways").toBeLessThanOrEqual(2);

    // The confirm button is reachable and big enough to hit.
    const confirm = page.getByRole("button", { name: /^importera 5 transaktioner$/i });
    await expect(confirm).toBeVisible();
    const box = await confirm.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await confirm.click();
    await expect(page.getByTestId("analysis-complete")).toBeVisible({
      timeout: 120_000,
    });
  });
});
