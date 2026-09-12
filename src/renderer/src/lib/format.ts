import { localDate } from '@shared/date'

let currency = 'PKR'

export function setCurrency(code: string): boolean {
  const next = (code || 'PKR').toUpperCase()
  if (next === currency) return false
  currency = next
  return true
}

export const CURRENCY_DEFAULT = 'PKR'

const RUPEE_SYMBOLS: Record<string, string> = {
  PKR: 'Rs.',
  INR: 'Rs.',
  NPR: 'Rs.',
}

const formatters = new Map<string, Intl.NumberFormat | null>()

function currencyFormatter(code: string): Intl.NumberFormat | null {
  if (!formatters.has(code)) {
    try {
      formatters.set(code, new Intl.NumberFormat(undefined, { style: 'currency', currency: code }))
    } catch {
      formatters.set(code, null) // not a valid ISO currency code
    }
  }
  return formatters.get(code) ?? null
}

export function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  const number = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const symbol = RUPEE_SYMBOLS[currency]
  if (symbol) return `${symbol} ${number}`
  const formatter = currencyFormatter(currency)
  if (formatter) return formatter.format(value)
  return `${currency} ${number}`
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

export { localDate }