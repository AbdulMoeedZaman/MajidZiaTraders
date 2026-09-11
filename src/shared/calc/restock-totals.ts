// Single source of truth for restock (purchase) money maths. Used by the main process
// (repository, service) and by the renderer (restock form live preview) so the two can
// never disagree. All amounts are integer minor units (paisa/cents).
//
// Rebuilt from a real supplier sales-tax invoice:
//   retailPricePerCarton    = (piecesPerCarton × mrpPerPiece) / (1 + salesTaxRate)
//                             Sales tax is charged on statutory retail value, NOT trade price.
//   totalRetailValueExcl    = qtyCartons × retailPricePerCarton
//   salesTaxAmount          = totalRetailValueExcl × salesTaxRate
//   advanceTax              = netSalesValueExcl × advanceTaxRate          (Pakistan: 0.1%)
//   discountedValueInclusive = netSalesValueExcl + salesTaxAmount + advanceTax − tradeDiscountValue
//
// netSalesValueExcl is the one authoritative, non-derived figure (the real trade price we are
// charged, taken from the supplier's invoice). Everything else can be derived but each derived
// figure may be overridden so a line can be made to match the physical invoice to the paisa.

/** Business-wide default sales tax rate on purchases, basis points (1800 = 18.00%). */
export const DEFAULT_SALES_TAX_RATE_BPS = 1800
/** Business-wide default advance tax rate on purchases, basis points (10 = 0.10%). */
export const DEFAULT_ADVANCE_TAX_RATE_BPS = 10

/** Settings keys carrying the business-wide restock defaults. */
export const PURCHASE_SALES_TAX_SETTING = 'purchaseSalesTaxRateBps'
export const PURCHASE_ADVANCE_TAX_SETTING = 'purchaseAdvanceTaxRateBps'

export interface RestockLineInput {
  qtyCartons: number
  piecesPerCarton: number
  /** Printed retail price per piece, minor units; nullable when unknown. */
  mrpPerPiece: number | null
  /** Sales tax rate, basis points (18.00% = 1800). Per-line snapshot. */
  salesTaxRate: number
  /** Advance tax rate, basis points (0.10% = 10). Per-line snapshot. */
  advanceTaxRate: number
  /** Authoritative trade value we are actually charged, minor units. */
  netSalesValueExcl: number
  tradeDiscountValue: number
}

export interface RestockLineOverrides {
  retailPricePerCarton?: number | null
  salesTaxAmount?: number | null
  advanceTax?: number | null
}

export interface RestockLineTotals {
  retailPricePerCarton: number
  totalRetailValueExcl: number
  salesTaxAmount: number
  advanceTax: number
  /** Line total payable (what "Discounted Sales Value Inclusive" sums to). */
  discountedValueInclusive: number
}

export interface RestockHeaderTotals {
  totalRetailValueExcl: number
  totalSalesTax: number
  totalAdvanceTax: number
  totalTradeDiscount: number
  totalNetValueExcl: number
  /** Grand total payable. */
  totalCost: number
}

export interface RestockHeaderTotalsItem {
  qtyCartons: number
  piecesPerCarton: number
  totalRetailValueExcl: number
  salesTaxAmount: number
  advanceTax: number
  tradeDiscountValue: number
  netSalesValueExcl: number
  discountedValueInclusive: number
}

const safeInt = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

export function computeRestockLineTotals(
  input: RestockLineInput,
  overrides: RestockLineOverrides = {}
): RestockLineTotals {
  const qtyCartons = safeInt(input.qtyCartons)
  const piecesPerCarton = safeInt(input.piecesPerCarton)
  const taxRate = safeInt(input.salesTaxRate)
  const advanceRate = safeInt(input.advanceTaxRate)
  const netSalesValueExcl = safeInt(input.netSalesValueExcl)
  const discount = safeInt(input.tradeDiscountValue)

  let retailPricePerCarton = 0
  if (input.mrpPerPiece != null && taxRate >= 0) {
    const mrp = safeInt(input.mrpPerPiece)
    retailPricePerCarton = Math.round((piecesPerCarton * mrp * 10000) / (10000 + taxRate))
  }
  if (overrides.retailPricePerCarton !== undefined && overrides.retailPricePerCarton !== null) {
    retailPricePerCarton = safeInt(overrides.retailPricePerCarton)
  }

  const totalRetailValueExcl = qtyCartons * retailPricePerCarton

  let salesTaxAmount = Math.round((totalRetailValueExcl * taxRate) / 10000)
  if (overrides.salesTaxAmount !== undefined && overrides.salesTaxAmount !== null) {
    salesTaxAmount = safeInt(overrides.salesTaxAmount)
  }

  let advanceTax = Math.round((netSalesValueExcl * advanceRate) / 10000)
  if (overrides.advanceTax !== undefined && overrides.advanceTax !== null) {
    advanceTax = safeInt(overrides.advanceTax)
  }

  const discountedValueInclusive = netSalesValueExcl + salesTaxAmount + advanceTax - discount

  return {
    retailPricePerCarton,
    totalRetailValueExcl,
    salesTaxAmount,
    advanceTax,
    discountedValueInclusive,
  }
}

/** Header aggregates from the (final) per-line figures. Always sums to the grand total payable. */
export function aggregateRestockLines(lines: RestockHeaderTotalsItem[]): RestockHeaderTotals {
  const sum = (key: keyof RestockHeaderTotalsItem): number => lines.reduce((s, l) => s + (Number.isFinite(l[key]) ? l[key] : 0), 0)
  return {
    totalRetailValueExcl: sum('totalRetailValueExcl'),
    totalSalesTax: sum('salesTaxAmount'),
    totalAdvanceTax: sum('advanceTax'),
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