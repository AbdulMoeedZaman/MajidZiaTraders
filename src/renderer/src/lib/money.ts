/**
 * Converts an integer amount in minor units (paisa / cents) to whole rupees for
 * display and input. Rupees are never split into sub-units in this app, so the
 * decimal part is dropped entirely (e.g. 13750 paisa → "137").
 */
export function centsToRupees(cents: number): string {
  return String(Math.trunc(cents / 100))
}

/**
 * Parses a money input into integer minor units (paisa / cents). Decimals are
 * silently trimmed: "5.75" is entered as 5 rupees (500 paisa).
 */
export function moneyToCents(value: string): number {
  const parsed = parseFloat(value || '0')
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.trunc(parsed) * 100)
}

/** Parses a count input (cartons / boxes) into a non-negative integer. */
export function countToInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}