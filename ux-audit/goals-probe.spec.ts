import { test } from "@playwright/test";

/** What actually happens when the goal form is submitted. */
test("goal creation, observed", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/") && r.method() !== "GET") calls.push(`→ ${r.method()} ${r.url()}`);
  });
  page.on("response", async (r) => {
    if (r.url().includes("/api/") && r.request().method() !== "GET") {
      calls.push(`← ${r.status()} ${r.url()} ${(await r.text().catch(() => "")).slice(0, 200)}`);
    }
  });

  await page.goto("/goals");
  await page.waitForTimeout(2500);

  // What does the create row actually contain?
  const fields = await page.evaluate(() => {
    const form = document.querySelector("form");
    return Array.from(form?.querySelectorAll("input, select") ?? []).map((el) => {
      const input = el as HTMLInputElement;
      return {
        tag: el.tagName.toLowerCase(),
        type: input.type,
        ariaLabel: el.getAttribute("aria-label"),
        placeholder: input.placeholder,
        required: input.required,
        value: input.value,
        labelText: el.closest("label")?.textContent?.trim().slice(0, 40) ?? null,
      };
    });
  });
  console.log("\n--- create-goal form fields ---");
  for (const f of fields) console.log(" ", JSON.stringify(f));

  await page.getByLabel(/namn på nytt mål/i).fill("Probe mål");
  const labelled = await page.getByLabel(/målbelopp/i).count();
  console.log(`\ngetByLabel(/målbelopp/i) matches: ${labelled}`);

  await page.getByRole("button", { name: /^skapa$/i }).first().click();
  await page.waitForTimeout(3000);

  console.log("\n--- network ---");
  for (const c of calls) console.log(" ", c);

  const alerts = await page.locator('[role="alert"], .text-negative').allTextContents();
  console.log("\n--- messages on screen ---", JSON.stringify(alerts.filter(Boolean)));
  const found = await page.getByText("Probe mål").count();
  console.log(`goal visible after submit: ${found > 0}`);
});
