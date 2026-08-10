import { test } from "@playwright/test";

/**
 * The eight controls the dead-control sweep flagged, opened one at a time.
 *
 * The sweep's test for "something happened" was a DOM delta over 40 characters,
 * which inline validation can fall under. Each candidate is clicked here with the
 * visible text captured before and after, so the conclusion is observed rather
 * than assumed.
 */
const CANDIDATES: Array<{ route: string; name: RegExp }> = [
  { route: "/accounts", name: /^skapa konto$/i },
  { route: "/transactions", name: /^utgift$/i },
  { route: "/goals", name: /^skapa mål$/i },
  { route: "/goals", name: /^skapa buffertpost$/i },
  { route: "/settings", name: /^bjud in$/i },
  { route: "/settings", name: /^redigera$/i },
  { route: "/settings", name: /^avbryt$/i },
  { route: "/settings", name: /^skapa$/i },
];

for (const { route, name } of CANDIDATES) {
  test(`control ${name.source} on ${route}`, async ({ page }) => {
    let requests = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/v1/")) requests += 1;
    });

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const button = page.getByRole("button", { name }).first();
    if ((await button.count()) === 0) {
      console.log(`  ${route} "${name.source}" → NOT PRESENT`);
      return;
    }
    const before = await page.locator("body").innerText();
    const beforeRequests = requests;
    await button.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const after = await page.locator("body").innerText();

    // What text appeared that was not there before?
    const beforeLines = new Set(before.split("\n").map((l) => l.trim()));
    const appeared = after
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !beforeLines.has(l))
      .slice(0, 4);

    console.log(
      `  ${route} "${name.source}" → requests ${requests - beforeRequests}, ` +
        `url ${new URL(page.url()).pathname}, appeared ${JSON.stringify(appeared)}`,
    );
  });
}

/** §20: Escape closes a dialog and focus returns to what opened it. */
test("dialog focus behaviour", async ({ page }) => {
  await page.goto("/vehicles", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const openers = page.getByRole("button", { name: /lägg till|nytt|ny |registrera/i });
  const count = await openers.count();
  console.log(`\n  dialog openers found on /vehicles: ${count}`);
  if (count === 0) return;

  const opener = openers.first();
  const openerName = (await opener.textContent())?.trim();
  await opener.click();
  await page.waitForTimeout(1200);

  const dialogs = await page.locator('[role="dialog"]:visible').count();
  const focusedAfterOpen = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: (document.activeElement as HTMLElement | null)?.innerText?.slice(0, 30),
  }));
  console.log(`  opened "${openerName}" → dialogs ${dialogs}, focus ${JSON.stringify(focusedAfterOpen)}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const dialogsAfter = await page.locator('[role="dialog"]:visible').count();
  const focusedAfterClose = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: (document.activeElement as HTMLElement | null)?.innerText?.slice(0, 30),
  }));
  console.log(
    `  Escape → dialogs ${dialogsAfter}, focus ${JSON.stringify(focusedAfterClose)} ` +
      `(returned to opener: ${focusedAfterClose.text?.trim() === openerName})`,
  );
});

/** §22/§23: what an empty or loading surface actually says. */
test("loading and empty surfaces", async ({ page }) => {
  for (const route of ["/documents", "/imports", "/opportunities", "/notifications"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Read immediately, before queries settle, to see the loading state.
    await page.waitForTimeout(250);
    const loading = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 120);
    await page.waitForTimeout(3000);
    const settled = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const zeroWhileLoading = /\b0 kr\b/.test(loading);
    console.log(`\n  ${route}`);
    console.log(`    while loading: "${loading}"`);
    console.log(`    shows 0 kr while loading: ${zeroWhileLoading}`);
    console.log(`    settled mentions an action: ${/skapa|lägg till|ladda upp|koppla|importera/i.test(settled)}`);
  }
});
