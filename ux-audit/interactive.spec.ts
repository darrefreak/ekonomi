import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * The interactive audit.
 *
 * The passive sweep can only see a rendered page. Everything a user complains
 * about — a button that does nothing, a list that needs a refresh, a login that
 * loses what you typed — only shows up if something actually clicks and types.
 *
 * These tests deliberately do not assert much either. They drive the product and
 * write down what happened.
 */

type Observation = { kind: string; where: string; viewport: string; detail: string };
const observations: Observation[] = [];
const outFile = path.join(__dirname, "interactive.json");

function note(kind: string, where: string, viewport: string, detail: string) {
  observations.push({ kind, where, viewport, detail });
  console.log(`  [${kind}] ${where} — ${detail}`);
}

test.afterAll(() => {
  const existing: Observation[] = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, "utf8"))
    : [];
  fs.writeFileSync(outFile, JSON.stringify([...existing, ...observations], null, 2));
});

const DEMO = { email: "demo@ffos.local", password: "demo-password-123" };

async function clearSession(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/* ------------------------------------------------------------------ auth */

test.describe("authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login experience", async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    await clearSession(page);
    await page.goto("/login");

    // §4 form quality, inspected on the real page.
    const email = page.locator('input[type="email"], input[name="email"]').first();
    const password = page.locator('input[type="password"]').first();

    const emailAttrs = await email.evaluate((el: HTMLInputElement) => ({
      type: el.type,
      name: el.name,
      id: el.id,
      autocomplete: el.getAttribute("autocomplete"),
      inputmode: el.getAttribute("inputmode"),
      labelled: Boolean(
        (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
          el.closest("label") ||
          el.getAttribute("aria-label"),
      ),
      fontSize: getComputedStyle(el).fontSize,
    }));
    const passwordAttrs = await password.evaluate((el: HTMLInputElement) => ({
      type: el.type,
      autocomplete: el.getAttribute("autocomplete"),
      labelled: Boolean(
        (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
          el.closest("label") ||
          el.getAttribute("aria-label"),
      ),
      fontSize: getComputedStyle(el).fontSize,
    }));
    note("auth-form", "/login", vp, `email ${JSON.stringify(emailAttrs)}`);
    note("auth-form", "/login", vp, `password ${JSON.stringify(passwordAttrs)}`);

    const showHide = await page
      .locator('button[aria-label*="lösenord" i], button:has-text("Visa"), button:has-text("Dölj")')
      .count();
    note("auth-form", "/login", vp, `show/hide password control present: ${showHide > 0}`);

    // Empty submit.
    const submit = page.getByRole("button", { name: /logga in|sign in/i }).first();
    await submit.click();
    await page.waitForTimeout(800);
    note(
      "auth-empty-submit",
      "/login",
      vp,
      `url=${new URL(page.url()).pathname} visible error: ${(await page.locator('[role="alert"], .text-negative, .text-warning').first().textContent().catch(() => "")) || "none"}`,
    );

    // Wrong password: what is shown, and is the email preserved?
    await email.fill(DEMO.email);
    await password.fill("definitely-wrong-password");
    await submit.click();
    await page.waitForTimeout(1500);
    const errorText = (await page.locator('[role="alert"], .text-negative, .text-warning').first().textContent().catch(() => "")) ?? "";
    note(
      "auth-wrong-password",
      "/login",
      vp,
      `error="${errorText.trim().slice(0, 120)}" emailPreserved=${(await email.inputValue()) === DEMO.email} passwordCleared=${(await password.inputValue()) === ""}`,
    );

    // Enter key submits.
    await password.fill("still-wrong");
    await password.press("Enter");
    await page.waitForTimeout(1200);
    note("auth-enter-key", "/login", vp, `still on login: ${new URL(page.url()).pathname === "/login"}`);

    // Valid login.
    await password.fill(DEMO.password);
    const beforeClick = Date.now();
    await submit.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }).catch(() => {});
    note(
      "auth-valid-login",
      "/login",
      vp,
      `landed on ${new URL(page.url()).pathname} after ${Date.now() - beforeClick}ms`,
    );

    // Refresh keeps the session.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    note("auth-refresh", "/", vp, `after reload path=${new URL(page.url()).pathname}`);

    // A protected URL while logged out.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/accounts", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    note(
      "auth-protected-while-logged-out",
      "/accounts",
      vp,
      `path=${new URL(page.url()).pathname} bodyStart="${(await page.locator("body").innerText()).slice(0, 90).replace(/\n/g, " ")}"`,
    );
  });

  test("logout", async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    await clearSession(page);
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(DEMO.email);
    await page.locator('input[type="password"]').first().fill(DEMO.password);
    await page.getByRole("button", { name: /logga in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }).catch(() => {});

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const logout = page.getByRole("button", { name: /logga ut|logout/i }).first();
    const found = (await logout.count()) > 0;
    note("logout-control", "/settings", vp, `logout control found: ${found}`);
    if (found) {
      await logout.click();
      await page.waitForTimeout(2500);
      note("logout-result", "/settings", vp, `path=${new URL(page.url()).pathname}`);
      await page.goto("/accounts", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      note("logout-then-protected", "/accounts", vp, `path=${new URL(page.url()).pathname}`);
    }
  });
});

/* ---------------------------------------------------- dead control sweep */

const DEAD_SWEEP_ROUTES = ["/", "/accounts", "/transactions", "/budget", "/goals", "/vehicles", "/settings", "/insights", "/documents", "/integrations"];
const DESTRUCTIVE = /radera|ta bort|arkiv|logga ut|erase|delete|avbryt pilot/i;

test.describe("dead controls", () => {
  for (const route of DEAD_SWEEP_ROUTES) {
    test(`controls on ${route}`, async ({ page }, testInfo) => {
      const vp = testInfo.project.name;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);

      const buttons = page.locator("button:visible");
      const count = await buttons.count();
      for (let i = 0; i < Math.min(count, 25); i++) {
        const button = buttons.nth(i);
        const name = ((await button.textContent().catch(() => "")) ?? "").trim().slice(0, 40) ||
          (await button.getAttribute("aria-label").catch(() => "")) || "(unnamed)";
        if (DESTRUCTIVE.test(name)) continue;
        if (await button.isDisabled().catch(() => true)) continue;

        const before = {
          url: page.url(),
          html: (await page.locator("body").innerHTML().catch(() => "")).length,
          dialogs: await page.locator('[role="dialog"]:visible').count(),
        };
        let requests = 0;
        const onRequest = () => { requests += 1; };
        page.on("request", onRequest);
        await button.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(700);
        page.off("request", onRequest);

        const after = {
          url: page.url(),
          html: (await page.locator("body").innerHTML().catch(() => "")).length,
          dialogs: await page.locator('[role="dialog"]:visible').count(),
        };
        const changed =
          before.url !== after.url ||
          Math.abs(before.html - after.html) > 40 ||
          before.dialogs !== after.dialogs ||
          requests > 0;
        if (!changed) {
          note("dead-control", route, vp, `"${name}" produced no navigation, no request and no DOM change`);
        }
        // Get back to a known state.
        if (before.url !== after.url) {
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
        } else if (after.dialogs > before.dialogs) {
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      expect(true).toBe(true);
    });
  }
});

/* --------------------------------------------- mutation freshness (§17/18) */

test("creating an account updates the list and the dashboard without a refresh", async ({ page }, testInfo) => {
  const vp = testInfo.project.name;
  await page.goto("/accounts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const name = `UX-audit ${Date.now().toString(36)}`;
  const nameField = page.getByLabel(/namn/i).first();
  if ((await nameField.count()) === 0) {
    note("mutation-freshness", "/accounts", vp, "could not find a labelled name field on the create form");
    return;
  }
  await nameField.fill(name);
  const opening = page.getByLabel(/öppningssaldo/i).first();
  if ((await opening.count()) > 0) await opening.fill("1234,56");

  const submit = page.getByRole("button", { name: /skapa konto/i }).first();
  await submit.click();
  await page.waitForTimeout(2500);

  const appearsWithoutReload = await page.getByText(name, { exact: false }).count();
  note("mutation-freshness", "/accounts", vp, `new account visible without reload: ${appearsWithoutReload > 0}`);

  const formCleared = (await nameField.inputValue().catch(() => "")) === "";
  note("mutation-feedback", "/accounts", vp, `form cleared after save: ${formCleared}`);

  const feedback = await page.locator('[role="status"], [role="alert"], .toast, [data-sonner-toast]').count();
  note("mutation-feedback", "/accounts", vp, `visible confirmation element: ${feedback > 0}`);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  note("mutation-freshness", "/", vp, "dashboard revisited after account creation (values compared manually in the report)");
});
