import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * §39: every route in dark mode, looking for the failures that hardcoded colours
 * cause — text the same colour as what is behind it, and contrast too low to
 * read.
 *
 * Contrast is computed from the actual rendered colours, walking up for the real
 * background when an element is transparent, so this reflects what a person sees
 * rather than what the stylesheet intended.
 */
const ROUTES = [
  "/", "/accounts", "/transactions", "/budget", "/goals", "/net-worth",
  "/forecast", "/cashflow", "/insights", "/opportunities", "/review",
  "/vehicles", "/debt", "/investments", "/assets", "/documents", "/imports",
  "/integrations", "/contracts", "/subscriptions", "/reports", "/risk",
  "/scenarios", "/advisor", "/notifications", "/settings", "/more", "/login",
];

type Issue = { route: string; scheme: string; kind: string; detail: string };
const issues: Issue[] = [];
const outFile = path.join(__dirname, "dark-mode.json");

test.afterAll(() => {
  fs.writeFileSync(outFile, JSON.stringify(issues, null, 2));
  console.log(`\n${issues.length} contrast observations written to ux-audit/dark-mode.json`);
});

for (const scheme of ["dark", "light"] as const) {
  for (const route of ROUTES) {
    test(`${scheme} ${route}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2200);

      const found = await page.evaluate(() => {
        const parse = (color: string): [number, number, number, number] | null => {
          const m = color.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
          return [parts[0], parts[1], parts[2], parts[3] ?? 1];
        };
        const luminance = ([r, g, b]: [number, number, number, number]) => {
          const channel = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };
        const effectiveBackground = (el: Element): [number, number, number, number] => {
          let node: Element | null = el;
          while (node) {
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg && bg[3] > 0.5) return bg;
            node = node.parentElement;
          }
          return [255, 255, 255, 1];
        };
        const out: Array<{ kind: string; detail: string }> = [];
        const seen = new Set<string>();

        const candidates = Array.from(
          document.querySelectorAll("p, span, h1, h2, h3, h4, dt, dd, td, th, label, a, button, li"),
        );
        for (const el of candidates) {
          const text = (el as HTMLElement).innerText?.trim();
          if (!text || text.length < 2) continue;
          // Only leaf-ish nodes, so a container's text is not measured twice.
          if (el.querySelector("p, span, h1, h2, h3, h4, dt, dd, td, th, label, a, button, li")) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;

          const fg = parse(style.color);
          if (!fg || fg[3] < 0.5) continue;
          const bg = effectiveBackground(el);
          const lf = luminance(fg);
          const lb = luminance(bg);
          const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);

          const size = parseFloat(style.fontSize);
          const bold = parseInt(style.fontWeight, 10) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const required = large ? 3 : 4.5;

          const key = `${style.color}|${ratio.toFixed(2)}`;
          if (seen.has(key)) continue;

          if (ratio < 1.6) {
            seen.add(key);
            out.push({
              kind: "text-invisible",
              detail: `"${text.slice(0, 30)}" ${style.color} on rgb(${bg[0]},${bg[1]},${bg[2]}) ratio ${ratio.toFixed(2)}`,
            });
          } else if (ratio < required) {
            seen.add(key);
            out.push({
              kind: "low-contrast",
              detail: `"${text.slice(0, 30)}" ${style.color} ratio ${ratio.toFixed(2)} needs ${required}`,
            });
          }
        }
        return out;
      });

      for (const f of found) issues.push({ route, scheme, ...f });
      if (found.length) {
        console.log(`  ${scheme} ${route}: ${found.length}`);
        for (const f of found.slice(0, 3)) console.log(`      ${f.kind}: ${f.detail}`);
      }
    });
  }
}
