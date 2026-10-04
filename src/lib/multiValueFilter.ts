// ─── Multi-value filter codec ─────────────────────────────────────────────────
//
// A multi-value rule's selection is held in filter state (and the URL and saved
// queries) as one comma-separated string. This is the only place that string is
// read or written; controls and query adapters work with arrays.

/** The positive integer ids in a comma-separated value; anything else is dropped. */
export function parseIds(csv: string | undefined): number[] {
  return parseStrings(csv)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** The trimmed, non-empty entries of a comma-separated value. */
export function parseStrings(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A selection as a comma-separated value, or `undefined` when nothing is selected
 *  (an unset rule, not an empty string). */
export function toCsv(values: readonly (string | number)[]): string | undefined {
  return values.length > 0 ? values.join(',') : undefined;
}
