import { RestockRepository } from '../repositories/restock.repository'
import { ProductRepository } from '../repositories/product.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import type {
  Restock,
  RestockListItem,
  RestockWithItems,
  CreateRestockDTO,
  UpdateRestockDTO,
} from '@shared/types/restock'
import { assertIsoDate } from '@shared/date'

export class RestockService {
  private restockRepo = new RestockRepository()
  private productRepo = new ProductRepository()
  private inventoryRepo = new InventoryRepository()

  list(): Restock[] {
    return this.restockRepo.findAll()
  }

  listWithCounts(): RestockListItem[] {
    return this.restockRepo.findAllWithCounts()
  }

  getById(id: number): Restock | null {
    return this.restockRepo.findById(id)
  }

  getWithItems(id: number): RestockWithItems | null {
    const restock = this.restockRepo.findById(id)
    if (!restock) return null
    return { ...restock, items: this.restockRepo.getItemsWithProduct(id) }
  }

  getItems(restockId: number) {
    return this.restockRepo.getItems(restockId)
  }

  listByStatus(status: Restock['status']): Restock[] {
    return this.restockRepo.findByStatus(status)
  }

  create(data: CreateRestockDTO): Restock {
    if (!data.supplierName?.trim()) {
      throw new Error('Supplier name is required')
    }
    this.validateItems(data.items, [])
    this.validateDate(data.date, 'Date')

    return this.restockRepo.runInTransaction(() => {
      const referenceNumber = this.restockRepo.generateReferenceNumber()
      return this.restockRepo.create({ ...data, supplierName: data.supplierName.trim() }, referenceNumber)
    })
  }

  update(id: number, data: UpdateRestockDTO): Restock {
    const existing = this.restockRepo.findById(id)
    if (!existing) {
      throw new Error('Restock not found')
    }
    if (existing.status !== 'pending') {
      throw new Error('Only pending restocks can be edited')
    }
    if ((data as { status?: unknown }).status !== undefined) {
      throw new Error('Restock status cannot be changed here. Mark as received or cancel instead.')
    }
    if (data.supplierName !== undefined && !data.supplierName.trim()) {
      throw new Error('Supplier name is required')
    }
    if (data.date !== undefined) {
      this.validateDate(data.date, 'Date')
    }
    if (data.items !== undefined) {
      this.validateItems(data.items, [])
      if (data.items.length === 0) {
        throw new Error('Restock must have at least one item')
      }
    }

    return this.restockRepo.update(id, data)
  }

  markReceived(id: number, options?: { updateCost?: boolean }): Restock {
    const existing = this.restockRepo.findById(id)
    if (!existing) {
      throw new Error('Restock not found')
    }
    if (existing.status !== 'pending') {
      throw new Error('Only pending restocks can be marked as received')
    }

    return this.restockRepo.runInTransaction(() => {
      const items = this.restockRepo.getItems(id)
      for (const item of items) {
        this.inventoryRepo.create({
          productId: item.productId,
          type: 'restock',
          quantity: item.quantity,
          referenceType: 'restock',
          referenceId: id,
          reason: `Restock ${existing.referenceNumber}`,
          cost: item.unitCost,
        })

        if (options?.updateCost !== false) {
          this.productRepo.update(item.productId, { baseCostPrice: item.unitCost })
        }
      }
      return this.restockRepo.update(id, { status: 'received' })
    })
  }

  cancel(id: number): Restock {
    const existing = this.restockRepo.findById(id)
    if (!existing) {
      throw new Error('Restock not found')
    }
    if (existing.status !== 'pending') {
      throw new Error('Only pending restocks can be cancelled')
    }

    return this.restockRepo.update(id, { status: 'cancelled' })
  }

  delete(id: number): void {
    const existing = this.restockRepo.findById(id)
    if (!existing) {
      throw new Error('Restock not found')
    }
    if (existing.status === 'received') {
      throw new Error('Cannot delete a received restock')
    }
    this.restockRepo.delete(id)
  }

  private validateItems(
    items: CreateRestockDTO['items'],
    existingIds: number[]
  ): void {
    if (!items || items.length === 0) {
      throw new Error('Restock must have at least one item')
    }

    const seen = new Set<number>(existingIds)
    for (const item of items) {
      if (!Number.isInteger(item.productId) || item.productId < 1) {
        throw new Error('Each restock item requires a valid product')
      }
      if (seen.has(item.productId)) {
        throw new Error('A product cannot appear more than once in a restock')
      }
      seen.add(item.productId)

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Restock quantity must be a positive whole number')
      }
      if (!Number.isInteger(item.unitCost) || item.unitCost < 0) {
        throw new Error('Unit cost must be a non-negative whole number of cents')
      }

      const product = this.productRepo.findById(item.productId)
      if (!product) {
        throw new Error('Restock references an unknown product')
      }
      if (product.isActive !== 1) {
        throw new Error(`Cannot restock inactive product "${product.name}"`)
      }
    }
  }

  private validateDate(date: string, label: string): void {
    assertIsoDate(date, label)
  }

  count(): number {
    return this.restockRepo.count()
  }
}