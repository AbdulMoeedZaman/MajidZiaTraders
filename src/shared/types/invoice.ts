export interface Invoice {
  id: number
  invoiceNumber: string
  customerId: number
  date: string
  dueDate: string | null
  subtotal: number
  discount: number
  total: number
  totalCost: number
  totalProfit: number
  paid: number
  outstanding: number
  status: 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled'
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface InvoiceItem {
  id: number
  invoiceId: number
  productId: number
  productName: string
  productSku: string
  unit: string
  quantity: number
  costPriceAtSale: number
  minSellingPriceAtSale: number
  actualSellingPrice: number
  lineSubtotal: number
  lineDiscount: number
  lineCost: number
  lineProfit: number
  createdAt: string
}

export interface CreateInvoiceDTO {
  customerId: number
  date: string
  dueDate?: string
  discount?: number
  status?: Invoice['status']
  notes?: string
  items: CreateInvoiceItemDTO[]
}

export interface CreateInvoiceItemDTO {
  productId: number
  productName: string
  productSku: string
  unit?: string
  quantity: number
  costPriceAtSale: number
  minSellingPriceAtSale: number
  actualSellingPrice: number
  lineDiscount?: number
}

export interface UpdateInvoiceDTO {
  customerId?: number
  date?: string
  dueDate?: string
  discount?: number
  status?: Invoice['status']
  notes?: string
  items?: CreateInvoiceItemDTO[]
}

export interface InvoiceWithCustomer extends Invoice {
  customerName: string
}

export interface InvoiceWithItems extends InvoiceWithCustomer {
  items: InvoiceItem[]
}
