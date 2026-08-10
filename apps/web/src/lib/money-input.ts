import { kronorStringToMinor, minorToKronorString } from "@ffos/domain";

/** Convert a kronor (major) input string to amountMinor string (integer öre). */
export function kronorToMinorString(value: string): string | null {
  const minor = kronorStringToMinor(value);
  if (minor == null) return null;
  return minor.toString();
}

/** Format amountMinor as kronor string for editable inputs (no float). */
export function minorToKronorInput(amountMinor: string): string {
  return minorToKronorString(amountMinor);
}
