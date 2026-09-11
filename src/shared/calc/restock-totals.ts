// Single source of truth for restock (purchase) money maths. Used by the main process
// (repository, service) and by the renderer (restock form live preview) so the two can
// never disagree. All amounts are integer minor units (paisa/cents).
//
// netSalesValueExcl is the authoritative trade value we are actually charged (taken from
// the supplier's invoice). totalCost is that value minus any trade discount.

export interface RestockLineInput {
  qtyCartons: number
  piecesPerCarton: number
  /** Authoritative trade value we are actually charged, minor units. */
  netSalesValueExcl: number
  tradeDiscountValue: number
}

export interface RestockLineTotals {
  /** Line total payable. */
  discountedValueInclusive: number
}

export interface RestockHeaderTotals {
  totalTradeDiscount: number
  totalNetValueExcl: number
  /** Grand total payable. */
  totalCost: number
}

export interface RestockHeaderTotalsItem {
  qtyCartons: number
  piecesPerCarton: number
  tradeDiscountValue: number
  netSalesValueExcl: number
  discountedValueInclusive: number
}

const safeInt = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

export function computeRestockLineTotals(input: RestockLineInput): RestockLineTotals {
  const netSalesValueExcl = safeInt(input.netSalesValueExcl)
  const discount = safeInt(input.tradeDiscountValue)

  const discountedValueInclusive = Math.max(0, netSalesValueExcl - discount)

  return {
    discountedValueInclusive,
  }
}

/** Header aggregates from the (final) per-line figures. Always sums to the grand total payable. */
export function aggregateRestockLines(lines: RestockHeaderTotalsItem[]): RestockHeaderTotals {
  const sum = (key: keyof RestockHeaderTotalsItem): number => lines.reduce((s, l) => s + (Number.isFinite(l[key]) ? l[key] : 0), 0)
  return {
    totalTradeDiscount: sum('tradeDiscountValue'),
    totalNetValueExcl: sum('netSalesValueExcl'),
    totalCost: sum('discountedValueInclusive'),
  }
}

/** Cost per stock (piece) unit of a received restock line. `null` when the line has no pieces. */
export function restockLineUnitCost(line: { qtyCartons: number; piecesPerCarton: number; discountedValueInclusive: number }): number {
  const pieces = line.qtyCartons * line.piecesPerCarton
  if (pieces <= 0) return 0
  return Math.round(line.discountedValueInclusive / pieces)
}