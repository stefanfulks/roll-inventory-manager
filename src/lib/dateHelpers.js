/**
 * Date helpers — handle the UTC-vs-local-time gotcha consistently.
 *
 * Background: dates stored in the DB as date-only strings like "2026-05-07"
 * are parsed by `new Date(...)` as UTC midnight. When displayed in any timezone
 * west of UTC, that's the previous calendar day. This helper parses the string
 * as LOCAL date instead, so a string of "2026-05-07" is rendered as May 7
 * regardless of the user's timezone.
 *
 * Use parseLocalDate for any date that came from a <input type="date"> field
 * or any other field that represents a calendar day rather than a precise instant.
 *
 * Use plain `new Date(...)` for fields that store a true timestamp
 * (created_date, updated_date, ISO datetimes ending in Z or +offset).
 */

/**
 * Parse a date-only string like "2026-05-07" as a local-time Date object.
 * Falsy input → null. Strings already containing time components (T) are
 * passed through to `new Date()` because they're already proper instants.
 */
export function parseLocalDate(value) {
  if (!value) return null;
  if (typeof value !== 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Date-only string? Match YYYY-MM-DD with no time component.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  // Contains time / timezone — let Date handle it.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a decimal-feet length like 23.5 as "23' 6\"".
 * Falsy or non-numeric values render as the empty string.
 * Use this where warehouse staff prefer foot-and-inch display.
 */
export function formatFeetInches(decimalFeet) {
  const n = parseFloat(decimalFeet);
  if (!Number.isFinite(n)) return '';
  const feet = Math.floor(n);
  const inches = Math.round((n - feet) * 12);
  // Roll up if rounding pushes inches to 12
  if (inches === 12) return `${feet + 1}' 0"`;
  if (inches === 0) return `${feet}'`;
  return `${feet}' ${inches}"`;
}
