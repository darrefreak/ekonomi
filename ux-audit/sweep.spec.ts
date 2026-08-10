import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * The passive sweep.
 *
 * Visits every route the navigation offers, in each viewport, and records what
 * the browser itself reports: console errors, failed requests, controls without
 * accessible names, inputs without labels, tap targets too small to hit, fonts
 * small enough to make iOS Safari zoom, horizontal overflow, and English copy
 * inside a Swedish product.
 *
 * It asserts almost nothing. Its job is to produce evidence for
 * `docs/ux/UX_FUNCTIONAL_AUDIT.md`, so a finding is something observed rather
 * than something suspected.
 */

const ROUTES = [
  "/", "/accounts", "/transactions", "/budget", "/goals", "/net-worth",
  "/forecast", "/cashflow", "/insights", "/opportunities", "/review",
  "/vehicles", "/debt", "/investments", "/assets", "/documents", "/imports",
  "/integrations", "/contracts", "/subscriptions", "/reports", "/risk",
  "/scenarios", "/advisor", "/notifications", "/settings", "/more",
];

/** Words that should not appear in a Swedish product surface. */
const ENGLISH = [
  "Loading", "Save", "Cancel", "Delete", "Edit", "Search", "Something went wrong",
  "No results", "Try again", "Submit", "Close", "Settings", "Amount", "Balance",
  "Account", "Failed", "Error", "Retry", "Required", "Optional", "Unknown",
];

type Finding = {
  kind: string;
  route: string;
  viewport: string;
  detail: string;
};

const findings: Finding[] = [];
const outFile = path.join(__dirname, "findings.json");

function record(kind: string, route: string, viewport: string, detail: string) {
  findings.push({ kind, route, viewport, detail });
}

test.afterAll(() => {
  const existing: Finding[] = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, "utf8"))
    : [];
  fs.writeFileSync(outFile, JSON.stringify([...existing, ...findings], null, 2));
  console.log(`\n${findings.length} observations written to ux-audit/findings.json`);
});

async function auditPage(page: Page, route: string, viewport: string) {
  return page.evaluate(
    ({ english }) => {
      const results: Array<{ kind: string; detail: string }> = [];
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 && rect.height > 0 &&
          style.visibility !== "hidden" && style.display !== "none" &&
          style.opacity !== "0"
        );
      };
      const accessibleName = (el: Element): string => {
        const aria = el.getAttribute("aria-label");
        if (aria?.trim()) return aria.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          const target = document.getElementById(labelledBy);
          if (target?.textContent?.trim()) return target.textContent.trim();
        }
        const title = el.getAttribute("title");
        if (title?.trim()) return title.trim();
        const text = (el as HTMLElement).innerText?.trim();
        if (text) return text;
        const img = el.querySelector("img[alt]");
        if (img?.getAttribute("alt")?.trim()) return img.getAttribute("alt")!.trim();
        return "";
      };
      const describe = (el: Element) => {
        const id = el.id ? `#${el.id}` : "";
        const testid = el.getAttribute("data-testid");
        const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 2).join(".");
        return `${el.tagName.toLowerCase()}${id}${testid ? `[data-testid=${testid}]` : ""}${cls ? `.${cls}` : ""}`;
      };

      // Controls without an accessible name.
      for (const el of Array.from(document.querySelectorAll("button, a, [role=button]"))) {
        if (!visible(el)) continue;
        if (!accessibleName(el)) {
          results.push({ kind: "no-accessible-name", detail: describe(el) });
        }
      }

      // Inputs without a label.
      for (const el of Array.from(document.querySelectorAll("input, select, textarea"))) {
        if (!visible(el)) continue;
        const input = el as HTMLInputElement;
        if (input.type === "hidden") continue;
        const id = input.id;
        const hasFor = id ? document.querySelector(`label[for="${id}"]`) : null;
        const wrapped = input.closest("label");
        const aria = input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");
        if (!hasFor && !wrapped && !aria) {
          results.push({ kind: "input-without-label", detail: describe(el) });
        }
        // iOS Safari zooms on focus when the font is under 16px.
        const size = parseFloat(getComputedStyle(input).fontSize);
        if (size && size < 16) {
          results.push({ kind: "input-font-under-16px", detail: `${describe(el)} ${size}px` });
        }
      }

      // Tap targets.
      for (const el of Array.from(document.querySelectorAll("button, a, [role=button], input[type=checkbox], select"))) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height < 40 || rect.width < 40) {
          const name = accessibleName(el).slice(0, 30);
          results.push({
            kind: "small-tap-target",
            detail: `${describe(el)} ${Math.round(rect.width)}×${Math.round(rect.height)} "${name}"`,
          });
        }
      }

      // Horizontal overflow.
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth + 2) {
        results.push({
          kind: "horizontal-overflow",
          detail: `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`,
        });
      }

      // English copy in a Swedish product.
      const bodyText = document.body.innerText ?? "";
      for (const word of english) {
        const re = new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "u");
        if (re.test(bodyText)) {
          results.push({ kind: "english-copy", detail: word });
        }
      }

      // Money formatting: look for shapes other than "1 234 kr".
      const moneyVariants = new Set<string>();
      for (const m of bodyText.matchAll(/(?:SEK|kr|:-)\s?[\d\s.,]+|[\d\s.,]+\s?(?:SEK|kr|:-)/g)) {
        const sample = m[0].trim();
        if (/SEK/.test(sample)) moneyVariants.add(`SEK-prefix: ${sample}`);
        if (/:-/.test(sample)) moneyVariants.add(`colon-dash: ${sample}`);
      }
      for (const v of Array.from(moneyVariants).slice(0, 3)) {
        results.push({ kind: "money-format-variant", detail: v });
      }

      // Raw technical text leaking into the UI.
      for (const pattern of ["\\{\"", "undefined", "NaN", "Error:", "TypeError", "Cannot read propert"]) {
        const re = new RegExp(pattern);
        if (re.test(bodyText)) {
          results.push({ kind: "technical-text-visible", detail: pattern });
        }
      }
      return results;
    },
    { english: ENGLISH },
  );
}

for (const route of ROUTES) {
  test(`sweep ${route}`, async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;
    const consoleIssues: string[] = [];
    const networkIssues: string[] = [];

    const onConsole = (message: ConsoleMessage) => {
      if (message.type() === "error" || message.type() === "warning") {
        const text = message.text();
        // Next.js dev noise and favicon chatter are not product problems.
        if (/favicon|Download the React DevTools|webpack-hmr/i.test(text)) return;
        consoleIssues.push(`${message.type()}: ${text.slice(0, 220)}`);
      }
    };
    page.on("console", onConsole);
    page.on("requestfailed", (request) => {
      if (/favicon/.test(request.url())) return;
      networkIssues.push(`failed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !/favicon/.test(response.url())) {
        networkIssues.push(`${response.status()}: ${response.request().method()} ${response.url()}`);
      }
    });

    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Let queries settle so loading states are not mistaken for the real page.
    await page.waitForTimeout(2500);

    const observations = await auditPage(page, route, viewport);
    for (const observation of observations) {
      record(observation.kind, route, viewport, observation.detail);
    }
    for (const issue of consoleIssues) record("console", route, viewport, issue);
    for (const issue of networkIssues) record("network", route, viewport, issue);

    page.off("console", onConsole);
    expect(true).toBe(true);
  });
}
