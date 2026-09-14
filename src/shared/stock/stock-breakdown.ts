// Single source of truth for the dual-unit (cartons + loose pieces) stock
// arithmetic. Used by the main-process services and available to the renderer
// for live previews. All functions are pure — no side effects, no DB access.

export interface StockComposition {
  cartons: number
  loosePieces: number
}

/** Canonical breakdown of total pieces into whole cartons + leftover loose pieces. */
export function canonicalComposition(pieces: number, piecesPerCarton: number): StockComposition {
  const pcp = Math.max(1, piecesPerCarton)
  const sign = pieces < 0 ? -1 : 1
  const abs = Math.abs(pieces)
  return {
    cartons: sign * Math.floor(abs / pcp),
    loosePieces: sign * (abs % pcp),
  }
}

export interface DeductResult {
  /** Pieces to deduct (negative for returns/restocks). */
  quantity: number
  /** Running balance after deduction, in total pieces. */
  newQuantity: number
  /** Running balance composed as cartons + loose pieces after deduction. */
  newCartons: number
  newLoosePieces: number
}

/**
 * Computes the ledger fields for a stock movement that deducts `needed`
 * pieces from a product whose current composition is `(cartons, loosePieces)`.
 *
 * The deduction uses loose pieces first, then breaks the minimum number of
 * whole cartons — no partial carton conversions, integer rates only.
 *
 * Throws if `needed` exceeds available stock. Pass a negative `needed` for
 * inbound movements (returns, restocks).
 */
export function deductStock(
  current: StockComposition,
  needed: number,
  piecesPerCarton: number
): DeductResult {
  const pcp = Math.max(1, piecesPerCarton)
  const totalPieces = current.cartons * pcp + current.loosePieces

  if (needed < 0) {
    const newTotal = totalPieces - needed
    const composition = canonicalComposition(newTotal, pcp)
    return {
      quantity: -needed,
      newQuantity: newTotal,
      newCartons: composition.cartons,
      newLoosePieces: composition.loosePieces,
    }
  }

  if (needed > totalPieces) {
    throw new Error(`Insufficient stock — available ${totalPieces} pcs, requested ${needed} pcs`)
  }

  const newTotal = totalPieces - needed
  const composition = canonicalComposition(newTotal, pcp)
  return {
    quantity: -needed,
    newQuantity: newTotal,
    newCartons: composition.cartons,
    newLoosePieces: composition.loosePieces,
  }
}

/**
 * Computes the ledger fields for a stock movement that adds `quantity`
 * pieces to a product whose current composition is `(cartons, loosePieces)`.
 */
export function addStock(
  current: StockComposition,
  quantity: number,
  piecesPerCarton: number
): DeductResult {
  if (quantity < 0) throw new Error('addStock quantity must be non-negative')
  const pcp = Math.max(1, piecesPerCarton)
  const totalPieces = current.cartons * pcp + current.loosePieces
  const newTotal = totalPieces + quantity
  const composition = canonicalComposition(newTotal, pcp)
  return {
    quantity,
    newQuantity: newTotal,
    newCartons: composition.cartons,
    newLoosePieces: composition.loosePieces,
  }
}

/**
 * Checks whether the given stock levels can fulfil a set of product
 * requirements. `needed` maps product id → total pieces required.
 * `levels` maps product id → current composition.
 *
 * Returns null on success; throws with a user-facing message on failure.
 */
export function assertSufficientStock(
  needed: Map<number, { name: string; pieces: number }>,
  levels: Map<number, StockComposition>,
  piecesPerCarton: Map<number, number>
): void {
  for (const [productId, { name, pieces }] of needed) {
    const level = levels.get(productId)
    const pcp = Math.max(1, piecesPerCarton.get(productId) ?? 1)
    const available = level ? level.cartons * pcp + level.loosePieces : 0
    if (available < pieces) {
      const availComp = canonicalComposition(available, pcp)
      throw new Error(
        `Insufficient stock for "${name}" — available ${availComp.cartons} ctn + ${availComp.loosePieces} pcs (${available} pcs), requested ${pieces} pcs`
      )
    }
  }
}
