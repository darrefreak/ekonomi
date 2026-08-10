import { test } from "@playwright/test";

/** Exactly what colour the primary controls are, in both schemes. */
for (const scheme of ["light", "dark"] as const) {
  test(`token contrast in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/accounts", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const report = await page.evaluate(() => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map((x) => parseFloat(x.trim()));
        return [p[0], p[1], p[2]] as [number, number, number];
      };
      const lum = ([r, g, b]: [number, number, number]) => {
        const ch = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      };
      const ratio = (a: [number, number, number], b: [number, number, number]) => {
        const la = lum(a), lb = lum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      const root = getComputedStyle(document.documentElement);
      const tokens: Record<string, string> = {};
      for (const name of ["--ffos-accent", "--ffos-text-primary", "--ffos-text-secondary", "--ffos-text-muted", "--ffos-surface", "--ffos-surface-elevated"]) {
        tokens[name] = root.getPropertyValue(name).trim();
      }

      const results: string[] = [];
      // Every primary button in the page, measured as rendered.
      const buttons = Array.from(document.querySelectorAll("button, a")).filter((el) => {
        const s = getComputedStyle(el);
        const bg = parse(s.backgroundColor);
        return bg !== null && s.backgroundColor !== "rgba(0, 0, 0, 0)" && (el as HTMLElement).innerText?.trim();
      });
      const seen = new Set<string>();
      for (const el of buttons.slice(0, 40)) {
        const s = getComputedStyle(el);
        const fg = parse(s.color), bg = parse(s.backgroundColor);
        if (!fg || !bg) continue;
        const key = `${s.color}|${s.backgroundColor}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const size = parseFloat(s.fontSize);
        const bold = parseInt(s.fontWeight, 10) >= 700;
        const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        const r = ratio(fg, bg);
        results.push(
          `${r < required ? "FAIL" : "ok  "} ratio ${r.toFixed(2)} (needs ${required}) ` +
            `${s.color} on ${s.backgroundColor} ${size}px "${(el as HTMLElement).innerText.trim().slice(0, 24)}"`,
        );
      }
      return { tokens, results };
    });

    console.log(`\n--- ${scheme} tokens ---`);
    for (const [k, v] of Object.entries(report.tokens)) console.log(`  ${k}: ${v}`);
    console.log(`--- ${scheme} rendered controls ---`);
    for (const r of report.results) console.log(`  ${r}`);
  });
}
