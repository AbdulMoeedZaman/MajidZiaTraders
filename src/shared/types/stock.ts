export type StockMovementType =
  | 'opening'
  | 'sale'
  | 'purchase'
  | 'adjustment'
  | 'damage'
  | 'return'
  | 'other'

export interface StockMovement {
  id: number
  productId: number
  /** Signed: positive for stock in, negative for stock out. */
  type: StockMovementType
  quantity: number
  previousQuantity: number | null
  newQuantity: number | null
  referenceType: string | null
  referenceId: number | null
  note: string | null
  /** Business date of the movement (YYYY-MM-DD). */
  date: string | null
  /** Unit price snapshot in minor units (invoice sales only). */
  price: number | null
  createdAt: string
}

export interface StockMovementWithProduct extends StockMovement {
  productName: string
  /** Shop name of the customer, populated for movements linked to an invoice. */
  customerName: string | null
}

export interface CreateRestockDTO {
  productId: number
  /** Quantity to add; must be a whole number greater than zero. */
  quantity: number
}