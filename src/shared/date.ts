const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function localDate(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** True only for real calendar dates such as 2026-02-28, not 2026-02-31. */
export function isValidIsoDate(date: string): boolean {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  const [year, month, day] = date.split('-').map(Number)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
}

export function assertIsoDate(date: string, label: string): void {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) {
    throw new Error(`${label} must be a valid date in YYYY-MM-DD format`)
  }
  if (!isValidIsoDate(date)) {
    throw new Error(`${label} is not a valid date`)
  }
}