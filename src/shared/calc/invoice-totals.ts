// Single source of truth for invoice money maths. Used by the main process (repository,
// migrations) and by the renderer (invoice form preview) so the two can never disagree.
// All amounts are integer cents.

export type InvoiceStatus = 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled'

export interface InvoiceLineInput {
  quantity: number
  unitPrice: number
  unitCost: number
}

export interface InvoiceLineTotals {
  lineSubtotal: number
  lineDiscount: number
  lineCost: number
  lineProfit: number
}

export interface InvoiceTotals {
  subtotal: number
  /** Discount actually applied (never more than the subtotal). */
  discount: number
  total: number
  totalCost: number
  /** Net revenue (subtotal − discount) minus cost. */
  profit: number
  lines: InvoiceLineTotals[]
}

const safeQuantity = (q: number): number => (Number.isFinite(q) ? Math.max(0, q) : 0)
const safeMoney = (v: number): number => (Number.isFinite(v) ? v : 0)

/** Spreads an invoice discount over its lines in proportion to their value. Always sums to `discount`. */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const total = lineTotals.reduce((sum, value) => sum + value, 0)
  if (discount <= 0 || lineTotals.length === 0 || total <= 0) return lineTotals.map(() => 0)

  const capped = Math.min(discount, total)
  const result: number[] = []
  let remaining = capped
  for (let i = 0; i < lineTotals.length; i++) {
    const share = i === lineTotals.length - 1 ? remaining : Math.round((lineTotals[i] / total) * capped)
    const allocated = Math.min(remaining, lineTotals[i], share)
    result.push(allocated)
    remaining -= allocated
  }
  // Rounding can leave a few cents over; give them to lines that still have room.
  for (let i = 0; remaining > 0 && i < result.length; i++) {
    const room = lineTotals[i] - result[i]
    const extra = Math.min(room, remaining)
    result[i] += extra
    remaining -= extra
  }
  return result
}

export function calculateInvoiceTotals(lines: InvoiceLineInput[], discount = 0): InvoiceTotals {
  const lineSubtotals = lines.map((l) => safeQuantity(l.quantity) * safeMoney(l.unitPrice))
  const lineCosts = lines.map((l) => safeQuantity(l.quantity) * safeMoney(l.unitCost))
  const subtotal = lineSubtotals.reduce((sum, v) => sum + v, 0)
  const totalCost = lineCosts.reduce((sum, v) => sum + v, 0)

  const appliedDiscount = Math.min(Math.max(0, safeMoney(discount)), subtotal)
  const lineDiscounts = allocateDiscount(lineSubtotals, appliedDiscount)

  return {
    subtotal,
    discount: appliedDiscount,
    total: subtotal - appliedDiscount,
    totalCost,
    profit: subtotal - appliedDiscount - totalCost,
    lines: lineSubtotals.map((lineSubtotal, i) => ({
      lineSubtotal,
      lineDiscount: lineDiscounts[i],
      lineCost: lineCosts[i],
      lineProfit: lineSubtotal - lineDiscounts[i] - lineCosts[i],
    })),
  }
}

/** Status an invoice should have given what has been paid and today's (local) date. */
export function computeInvoiceStatus(
  invoice: { status: InvoiceStatus; dueDate: string | null; paid: number; outstanding: number },
  today: string
): InvoiceStatus {
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.outstanding <= 0) return 'paid'
  if (invoice.dueDate && invoice.dueDate < today) return 'overdue'
  return invoice.paid > 0 ? 'partial' : 'sent'
}
