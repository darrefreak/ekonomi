/**
 * The starting point offered to a household that has never had a budget.
 *
 * Budget used to exist only in the demo seed, so a real household reached a
 * permanent 404 on a primary navigation entry (FPA-003). These groups match the
 * categories the product already classifies spending into, so a budget created
 * from them shows real actuals from the first day rather than a column of
 * zeroes.
 */

export type BudgetGroupTemplate = {
  categoryKey: string;
  name: string;
  sortOrder: number;
};

/** `other` is last on purpose: it collects whatever the named groups do not. */
export const SIMPLE_BUDGET_GROUPS: BudgetGroupTemplate[] = [
  { categoryKey: "housing", name: "Boende", sortOrder: 1 },
  { categoryKey: "food", name: "Mat", sortOrder: 2 },
  { categoryKey: "transport", name: "Transport", sortOrder: 3 },
  { categoryKey: "family", name: "Familj", sortOrder: 4 },
  { categoryKey: "lifestyle", name: "Livsstil", sortOrder: 5 },
  { categoryKey: "other", name: "Övrigt", sortOrder: 6 },
];

export const BUDGET_TEMPLATES = { SIMPLE: SIMPLE_BUDGET_GROUPS } as const;

export type BudgetTemplateName = keyof typeof BUDGET_TEMPLATES;

/** Month boundaries for a `YYYY-MM` label. */
export function monthBoundsFor(label: string): { start: string; end: string } {
  const [year, month] = label.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid budget month label: ${label}`);
  }
  const start = `${label}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: `${label}-${String(lastDay).padStart(2, "0")}` };
}

/** The `YYYY-MM` label a date belongs to. */
export function monthLabelOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}
