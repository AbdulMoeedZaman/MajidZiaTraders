import { localDate } from '@shared/date'

const CURRENCY = 'PKR'

const RUPEE_SYMBOLS: Record<string, string> = {
  PKR: 'Rs.',
  INR: 'Rs.',
  NPR: 'Rs.',
}

export function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  const number = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export { localDate }