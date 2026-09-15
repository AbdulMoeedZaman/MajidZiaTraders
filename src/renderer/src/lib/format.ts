import { localDate } from '@shared/date'

const CURRENCY = 'PKR'

const RUPEE_SYMBOLS: Record<string, string> = {
  PKR: 'Rs.',
  INR: 'Rs.',
  NPR: 'Rs.',
}

export function formatMoney(cents: number | null | undefined): string {
  const value = Math.round((cents ?? 0) / 100)
  const number = value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${RUPEE_SYMBOLS[CURRENCY] ?? CURRENCY} ${number}`
}

function parseDateValue(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)) {
    return new Date(`${iso.replace(' ', 'T')}Z`)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T00:00:00`)
  }
  return new Date(iso)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseDateValue(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseDateValue(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const MONTH_SHORT: Record<string, string> = {
  '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR', '05': 'MAY', '06': 'JUN',
  '07': 'JUL', '08': 'AUG', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC',
}

/** Compact ledger date used by the stock views, e.g. "2 AUG" for 2026-08-02. */
export function formatStockDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${parseInt(m[3], 10)} ${MONTH_SHORT[m[2]] ?? m[2]}`
}

export { localDate }