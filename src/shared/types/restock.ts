export interface Restock {
  id: number
  referenceNumber: string
  supplierName: string
  date: string
  status: 'pending' | 'received' | 'cancelled'
  notes: string | null
  /** Supplier's own invoice number. */
  supplierInvoiceNo: string | null
  dispatchNoteNo: string | null
  salesOrderNo: string | null
  totalTradeDiscount: number
  totalNetValueExcl: number
  /** Grand total payable (net value − discount). */
  totalCost: number
  createdAt: string
  updatedAt: string
}

export interface RestockItem {
  id: number
  restockId: number
  productId: number
  qtyCartons: number
  piecesPerCarton: number
  /** The authoritative trade value, from the supplier's invoice. */
  netSalesValueExcl: number
  tradeDiscountValue: number
  /** Line total payable. */
  discountedValueInclusive: number
  createdAt: string
}

export interface CreateRestockDTO {
  supplierName: string
  date: string
  notes?: string | null
  supplierInvoiceNo?: string | null
  dispatchNoteNo?: string | null
  salesOrderNo?: string | null
  items: CreateRestockItemDTO[]
}

/** Minimal direct stock-in used by the product detail "Add Stock" action. */
export interface AddStockDTO {
  productId: number
  quantity: number
  /** Per-piece unit cost in minor units; when provided, updates the product's minSellingPrice (cost basis). */
  costPerUnit?: number
  supplierName?: string
  note?: string
}

export interface CreateRestockItemDTO {
  productId: number
  qtyCartons: number
  piecesPerCarton: number
  netSalesValueExcl: number
  tradeDiscountValue?: number
}

export interface UpdateRestockDTO {
  supplierName?: string
  date?: string
  notes?: string | null
  supplierInvoiceNo?: string | null
  dispatchNoteNo?: string | null
  salesOrderNo?: string | null
  items?: CreateRestockItemDTO[]
}

export interface RestockItemWithProduct extends RestockItem {
  productName: string
  productSku: string
}

export interface RestockListItem extends Restock {
  itemCount: number
}

export interface RestockWithItems extends Restock {
  items: RestockItemWithProduct[]
}