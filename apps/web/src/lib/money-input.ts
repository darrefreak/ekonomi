/** Convert a kronor (major) input string to amountMinor string. */
export function kronorToMinorString(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const major = Number(normalized);
  if (!Number.isFinite(major)) return null;
  return String(Math.round(major * 100));
}

/** Format amountMinor as kronor string for editable inputs. */
export function minorToKronorInput(amountMinor: string): string {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return "0";
  return (n / 100).toFixed(n % 100 === 0 ? 0 : 2);
}
