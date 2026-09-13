// Single source of truth for the invoice money maths. Used by the main process
// (invoice service/repository) and by the renderer (invoice form preview) so the
// two can never disagree. All amounts are integer minor units (paisa / cents).

export interface InvoiceLineInput {
  /** Rate per carton in minor units (already >= the product's minimum rate). */
  rate: number
  /** Boxes per carton of the product. */
  boxesPerCarton: number
  /** Whole cartons on the line. */
  cartonCount: number
  /** Additional loose boxes on the line. */
  boxCount: number
}

const int = (v: number): number => (Number.isFinite(v) ? Math.round(v) : 0)

/**
 * Rounds an amount to the nearest ten minor units so invoice figures stay clean:
 * a ones digit of five or less rounds down to zero, anything above five rounds
 * up to ten. All invoice money goes through this before it is stored.
 */
export function roundToTen(amount: number): number {
  const base = Math.floor(amount / 10) * 10
  return amount - base > 5 ? base + 10 : base
}

/**
 * Amount of one invoice line:
 *   amount = rate × cartons  +  rate / boxesPerCarton × boxes
 *
 * The box part uses integer math (rate × boxes / boxesPerCarton) with a single
 * rounding, so it never carries float error. The line total is then rounded to
 * the nearest ten paisa (see `roundToTen`) so every invoice figure ends clean.
 */
export function calculateLineAmount({ rate, boxesPerCarton, cartonCount, boxCount }: InvoiceLineInput): number {
  const rateMinor = Math.max(0, int(rate))
  const bpc = Math.max(1, int(boxesPerCarton))
  const cartons = Math.max(0, int(cartonCount))
  const boxes = Math.max(0, int(boxCount))
  const cartonsAmount = rateMinor * cartons
  const boxesAmount = Math.round((rateMinor * boxes) / bpc)
  return roundToTen(cartonsAmount + boxesAmount)
}

/** Subtotal = sum of all line amounts. */
export function calculateInvoiceSubtotal(lines: InvoiceLineInput[]): number {
  return lines.reduce((sum, line) => sum + calculateLineAmount(line), 0)
}