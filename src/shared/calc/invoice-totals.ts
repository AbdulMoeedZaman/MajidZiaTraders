// Single source of truth for the invoice money maths. Used by the main process
// (invoice service/repository) and by the renderer (invoice form preview) so the
// two can never disagree. All amounts are integer minor units (paisa / cents).

export interface InvoiceLineInput {
  /** Rate per carton in minor units (already >= the product's minimum rate). */
  rate: number
  /** Pieces per carton of the product. */
  piecesPerCarton: number
  /** Whole cartons on the line. */
  cartonCount: number
  /** Additional loose boxes on the line. */
  boxCount: number
}

const int = (v: number): number => (Number.isFinite(v) ? Math.round(v) : 0)

/**
 * Rounds an amount to the nearest ten rupees so invoice figures stay clean:
 * a remainder below Rs. 5 rounds down to zero and one of Rs. 5 or more rounds
 * up to the next ten rupees. All invoice money goes through this before it is
 * stored, so stored figures are always whole ten-rupee multiples.
 */
export function roundToTen(amount: number): number {
  const base = Math.floor(amount / 1000) * 1000
  return amount - base >= 500 ? base + 1000 : base
}

/**
 * A billed line is rounded to the nearest ten rupees (see `roundToTen`), and any
 * non-zero line too small to round up to Rs. 10 is billed at the Rs. 10 minimum
 * so a real sale never drops to Rs. 0. A genuinely empty line stays at 0.
 */
export function normalizeLineAmount(raw: number): number {
  const rounded = roundToTen(raw)
  if (raw > 0 && rounded < 1000) return 1000
  return rounded
}

/**
 * Amount of one invoice line:
 *   amount = rate × cartons  +  rate / piecesPerCarton × boxes
 *
 * The box part uses integer math (rate × boxes / piecesPerCarton) with a single
 * rounding, so it never carries float error. The line total is then rounded to
 * the nearest ten rupees (see `roundToTen`), holding any non-zero line at the
 * Rs. 10 minimum, so every invoice figure ends clean.
 */
export function calculateLineAmount({ rate, piecesPerCarton, cartonCount, boxCount }: InvoiceLineInput): number {
  const rateMinor = Math.max(0, int(rate))
  const bpc = Math.max(1, int(piecesPerCarton))
  const cartons = Math.max(0, int(cartonCount))
  const boxes = Math.max(0, int(boxCount))
  const cartonsAmount = rateMinor * cartons
  const boxesAmount = Math.round((rateMinor * boxes) / bpc)
  return normalizeLineAmount(cartonsAmount + boxesAmount)
}

/** Subtotal = sum of all line amounts. */
export function calculateInvoiceSubtotal(lines: InvoiceLineInput[]): number {
  return lines.reduce((sum, line) => sum + calculateLineAmount(line), 0)
}