/**
 * Canonical `as_of` instant for an `account_balance_snapshots` row.
 *
 * Every writer stamps midday UTC of the snapshot's calendar day. Midday rather
 * than midnight so that no plausible local timezone shifts a snapshot onto the
 * neighbouring date. The unique identity `(account_id, as_of, source)` can only
 * recognise two rows as the same fact if all writers agree on this, so a writer
 * that stamped `new Date()` would defeat the constraint (RT2-008).
 */
export function snapshotAsOfDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00.000Z`);
}

/** Same convention, from a wall-clock instant. */
export function openingSnapshotAsOf(now: Date): Date {
  return snapshotAsOfDate(now.toISOString());
}
