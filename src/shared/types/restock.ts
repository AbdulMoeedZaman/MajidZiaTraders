export interface Restock {
  id: number
  referenceNumber: string
  supplierName: string
  date: string
  status: 'pending' | 'received' | 'cancelled'
  notes: string | null
  /** Supplier's own sales-tax invoice number. */
  supplierInvoiceNo: string | null
  /** Supplier's sales tax registration number (STRN). */
  supplierRegistrationNo: string | null
  /** Our NTN as recorded by the supplier. */
  buyerNtn: string | null
  /** Our CNIC/NTN as printed. */
  buyerCnic: string | null
  dispatchNoteNo: string | null
  salesOrderNo: string | null
  totalRetailValueExcl: number
  totalSalesTax: number
  totalAdvanceTax: number
  totalTradeDiscount: number
  totalNetValueExcl: number
  /** Grand total payable (net + sales tax + advance tax − discount). */
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
  mrpPerPiece: number | null
  /** Sales tax rate, basis points (18.00% = 1800). */
  salesTaxRate: number
  retailPricePerCarton: number
  totalRetailValueExcl: number
  salesTaxAmount: number
  /** Advance tax rate, basis points (0.10% = 10). */
  advanceTaxRate: number
  advanceTax: number
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
  supplierRegistrationNo?: string | null
  buyerNtn?: string | null
  buyerCnic?: string | null
  dispatchNoteNo?: string | null
  salesOrderNo?: string | null
  items: CreateRestockItemDTO[]
}

/** Minimal direct stock-in used by the product detail "Add Stock" action. */
export interface AddStockDTO {
  productId: number
  quantity: number
  /** Per-piece unit cost in minor units; when provided, updates the product's base cost. */
  costPerUnit?: number
  supplierName?: string
  note?: string
}

export interface CreateRestockItemDTO {
  productId: number
  qtyCartons: number
  piecesPerCarton: number
  mrpPerPiece?: number | null
  /** Basis points; defaults to the business-wide purchase sales tax rate. */
  salesTaxRate?: number
  /** Basis points; defaults to the business-wide purchase advance tax rate. */
  advanceTaxRate?: number
  netSalesValueExcl: number
  tradeDiscountValue?: number
  /** Optional overrides so a line can be made to match the physical invoice exactly. */
  retailPricePerCarton?: number | null
  salesTaxAmount?: number | null
  advanceTax?: number | null
}

export interface UpdateRestockDTO {
  supplierName?: string
  date?: string
  notes?: string | null
  supplierInvoiceNo?: string | null
  supplierRegistrationNo?: string | null
  buyerNtn?: string | null
  buyerCnic?: string | null
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