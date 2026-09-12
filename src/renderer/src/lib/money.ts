/** Parses a decimal money input into integer minor units (paisa / cents). */
export function moneyToCents(value: string): number {
  const parsed = parseFloat(value || '0')
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.round(parsed * 100))
}

/** Parses a count input (cartons / boxes) into a non-negative integer. */
export function countToInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}