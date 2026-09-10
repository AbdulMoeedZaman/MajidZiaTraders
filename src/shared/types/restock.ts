export interface Restock {
  id: number
  referenceNumber: string
  supplierName: string
  date: string
  totalCost: number
  status: 'pending' | 'received' | 'cancelled'
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface RestockItem {
  id: number
  restockId: number
  productId: number
  unit: string
  quantity: number
  unitCost: number
  totalCost: number
  createdAt: string
}

export interface CreateRestockDTO {
  supplierName: string
  date: string
  notes?: string
  items: CreateRestockItemDTO[]
}

export interface CreateRestockItemDTO {
  productId: number
  unit?: string
  quantity: number
  unitCost: number
}

export interface UpdateRestockDTO {
  supplierName?: string
  date?: string
  status?: Restock['status']
  notes?: string
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
