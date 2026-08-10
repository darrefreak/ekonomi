/**
 * Robust statistics over exact money.
 *
 * A household's spending is not normally distributed — one IKEA trip or one
 * insurance renewal drags a mean somewhere the household has never actually
 * lived. Every baseline in this engine therefore uses medians and percentiles
 * rather than means, which is what §21 of the brief insists on.
 *
 * Everything operates on `bigint` minor units. There is no floating point in this
 * file except where a ratio is deliberately returned as a percentage, and those
 * are computed from integer arithmetic and rounded once at the end.
 */

/** Sort a copy ascending. bigint has no default comparator that works. */
function sortedAsc(values: readonly bigint[]): bigint[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Median, taking the lower of the two middles on an even count.
 *
 * Deliberately not the average of the two middles: averaging would introduce a
 * half-öre that no transaction ever had, and every consumer of this treats the
 * result as an amount rather than a statistic.
 */
export function medianMinor(values: readonly bigint[]): bigint | null {
  if (values.length === 0) return null;
  const sorted = sortedAsc(values);
  const middle = Math.floor((sorted.length - 1) / 2);
  return sorted[middle]!;
}

/**
 * Nearest-rank percentile, 0–100.
 *
 * Nearest-rank rather than interpolated, for the same reason as the median: the
 * answer stays a value the household actually saw.
 */
export function percentileMinor(
  values: readonly bigint[],
  percentile: number,
): bigint | null {
  if (values.length === 0) return null;
  if (!Number.isFinite(percentile)) return null;
  const clamped = Math.min(100, Math.max(0, percentile));
  const sorted = sortedAsc(values);
  // Rank in 1..n, then index.
  const rank = Math.ceil((clamped / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index]!;
}

export function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce<bigint>((total, value) => total + value, 0n);
}

/**
 * Mean, floored toward zero.
 *
 * Present because a few callers legitimately want it (a monthly average of a
 * known-stable series), not as the default for baselines.
 */
export function meanMinor(values: readonly bigint[]): bigint | null {
  if (values.length === 0) return null;
  return sumMinor(values) / BigInt(values.length);
}

/**
 * Mean after discarding the extremes from both ends.
 *
 * `proportion` is the share removed from *each* end, so 0.1 drops the top and
 * bottom tenth. Falls back to the median when trimming would leave nothing,
 * because returning null there would make every caller handle a case that has an
 * obvious right answer.
 */
export function trimmedMeanMinor(
  values: readonly bigint[],
  proportion = 0.1,
): bigint | null {
  if (values.length === 0) return null;
  const share = Math.min(0.49, Math.max(0, proportion));
  const drop = Math.floor(values.length * share);
  const sorted = sortedAsc(values);
  const kept = sorted.slice(drop, sorted.length - drop);
  if (kept.length === 0) return medianMinor(sorted);
  return sumMinor(kept) / BigInt(kept.length);
}

/**
 * Median absolute deviation from the median.
 *
 * The robust answer to "how much does this vary". Standard deviation would be
 * dominated by the same outliers the median exists to ignore, which matters for
 * §34: a household with one enormous month should not be told it needs a
 * permanently larger buffer because of it.
 */
export function madMinor(values: readonly bigint[]): bigint | null {
  const median = medianMinor(values);
  if (median === null) return null;
  const deviations = values.map((value) => {
    const diff = value - median;
    return diff < 0n ? -diff : diff;
  });
  return medianMinor(deviations);
}

/**
 * Spread as a share of the level, in basis points.
 *
 * Basis points rather than a float percentage so the value stays exact and
 * comparable. 2 500 means the typical month deviates 25% from the median.
 * Returns null when the level is zero, where the ratio has no meaning.
 */
export function robustVolatilityBps(values: readonly bigint[]): number | null {
  const median = medianMinor(values);
  const mad = madMinor(values);
  if (median === null || mad === null) return null;
  const level = median < 0n ? -median : median;
  if (level === 0n) return null;
  return Number((mad * 10_000n) / level);
}

/**
 * How far below the normal level the weak periods fall, in basis points.
 *
 * The MAD is robust to the point of blindness for one shape that matters: an
 * income that is identical two months out of three and collapses in the third has
 * a MAD of zero, because more than half the deviations are zero. The household
 * plainly carries risk the spread cannot see.
 *
 * This measures the downside instead — the distance from the median to the 10th
 * percentile — which is the quantity a buffer actually has to bridge. Only the
 * downside, because a month of unusually *high* income is not a risk.
 */
export function downsideVolatilityBps(values: readonly bigint[]): number | null {
  const median = medianMinor(values);
  const low = percentileMinor(values, 10);
  if (median === null || low === null) return null;
  const level = median < 0n ? -median : median;
  if (level === 0n) return null;
  const gap = median - low;
  if (gap <= 0n) return 0;
  return Number((gap * 10_000n) / level);
}

/**
 * The larger of ordinary spread and downside risk.
 *
 * Used wherever "how unreliable is this series" drives a buffer: taking the max
 * means neither shape of irregularity can hide behind the other.
 */
export function riskVolatilityBps(values: readonly bigint[]): number | null {
  const spread = robustVolatilityBps(values);
  const downside = downsideVolatilityBps(values);
  if (spread === null && downside === null) return null;
  return Math.max(spread ?? 0, downside ?? 0);
}

/**
 * Percentage change from `from` to `to`, one decimal.
 *
 * Returns null when `from` is zero: "up from nothing" is not a percentage, and
 * every surface that shows this needs to say something else in that case rather
 * than render Infinity.
 */
export function percentChange(from: bigint, to: bigint): number | null {
  if (from === 0n) return null;
  const base = from < 0n ? -from : from;
  // Scaled by 1000 so one decimal survives integer division.
  const scaled = ((to - from) * 1000n) / base;
  return Number(scaled) / 10;
}

/** Share of `part` in `whole`, in basis points. Null when whole is zero. */
export function shareBps(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  const base = whole < 0n ? -whole : whole;
  return Number((part * 10_000n) / base);
}

/**
 * Is this value an outlier against the rest of the series?
 *
 * Uses the median plus a multiple of the MAD. The threshold is expressed in MADs
 * rather than standard deviations so a single spike cannot raise the bar enough to
 * hide itself.
 */
export function isRobustOutlier(
  value: bigint,
  population: readonly bigint[],
  madMultiple = 3,
): boolean {
  const median = medianMinor(population);
  const mad = madMinor(population);
  if (median === null || mad === null) return false;
  // With a MAD of zero the series is flat, and anything different is an outlier.
  if (mad === 0n) return value !== median;
  const deviation = value - median;
  const distance = deviation < 0n ? -deviation : deviation;
  // Multiplied as a scaled integer so a fractional multiple stays exact enough.
  const scale = BigInt(Math.round(madMultiple * 100));
  return distance * 100n > mad * scale;
}
