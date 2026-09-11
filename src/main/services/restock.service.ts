import { RestockRepository } from '../repositories/restock.repository'
import { ProductRepository } from '../repositories/product.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import type {
  Restock,
  RestockListItem,
  RestockWithItems,
  CreateRestockDTO,
  CreateRestockItemDTO,
  UpdateRestockDTO,
  AddStockDTO,
} from '@shared/types/restock'
import {
  computeRestockLineTotals,
  restockLineUnitCost,
  type RestockLineInput,
} from '@shared/calc/restock-totals'
import { assertIsoDate, localDate } from '@shared/date'

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
    this.validateDate(data.date, 'Date')
    const items = this.resolveItems(data.items, [])

    return this.restockRepo.runInTransaction(() => {
      const referenceNumber = this.restockRepo.generateReferenceNumber()
      return this.restockRepo.create({ ...data, supplierName: data.supplierName.trim(), items }, referenceNumber)
    })
  }

  addStock(data: AddStockDTO): Restock {
    if (!Number.isInteger(data.productId) || data.productId < 1) {
      throw new Error('A valid product is required')
    }
    if (!Number.isInteger(data.quantity) || data.quantity < 1) {
      throw new Error('Quantity must be a positive whole number')
    }
    if (data.costPerUnit !== undefined && (data.costPerUnit === null || !Number.isInteger(data.costPerUnit) || data.costPerUnit < 0)) {
      throw new Error('Cost per unit must be a non-negative whole number of cents')
    }
    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }

    const date = localDate()
    const unitCost = data.costPerUnit ?? product.baseCostPrice
    const supplierName = data.supplierName?.trim() || 'Direct stock-in'

    return this.restockRepo.runInTransaction(() => {
      const referenceNumber = this.restockRepo.generateReferenceNumber()
      const restock = this.restockRepo.create(
        {
          supplierName,
          date,
          notes: data.note?.trim() || `Stock added via product view (${product.name})`,
          items: [
            {
              productId: data.productId,
              qtyCartons: data.quantity,
              piecesPerCarton: 1,
              mrpPerPiece: product.mrp,
              netSalesValueExcl: unitCost * data.quantity,
              tradeDiscountValue: 0,
            },
          ],
        },
        referenceNumber
      )

      // A direct stock-in is immediately received.
      this.restockRepo.update(restock.id, { status: 'received' })

      this.inventoryRepo.create({
        productId: data.productId,
        type: 'restock',
        quantity: data.quantity,
        referenceType: 'restock',
        referenceId: restock.id,
        reason: `Stock in — ${restock.referenceNumber}`,
        cost: unitCost,
      })

      if (data.costPerUnit !== undefined) {
        this.productRepo.update(data.productId, { baseCostPrice: unitCost })
      }

      return restock
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
      if (data.items.length === 0) {
        throw new Error('Restock must have at least one item')
      }
      data.items = this.resolveItems(data.items, [])
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
        const pieces = item.qtyCartons * item.piecesPerCarton
        this.inventoryRepo.create({
          productId: item.productId,
          type: 'restock',
          quantity: pieces,
          referenceType: 'restock',
          referenceId: id,
          reason: `Restock ${existing.referenceNumber}`,
          cost: restockLineUnitCost(item),
        })

        if (options?.updateCost !== false) {
          this.productRepo.update(item.productId, { baseCostPrice: restockLineUnitCost(item) })
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

  count(): number {
    return this.restockRepo.count()
  }

  private resolveItems(
    incoming: CreateRestockItemDTO[],
    existingIds: number[]
  ): CreateRestockItemDTO[] {
    if (!incoming || incoming.length === 0) {
      throw new Error('Restock must have at least one item')
    }

    const seen = new Set<number>(existingIds)
    const resolved: CreateRestockItemDTO[] = []

    for (const item of incoming) {
      if (!Number.isInteger(item.productId) || item.productId < 1) {
        throw new Error('Each restock item requires a valid product')
      }
      if (seen.has(item.productId)) {
        throw new Error('A product cannot appear more than once in a restock')
      }
      seen.add(item.productId)

      if (!Number.isInteger(item.qtyCartons) || item.qtyCartons <= 0) {
        throw new Error('Restock quantity (cartons) must be a positive whole number')
      }
      if (!Number.isInteger(item.piecesPerCarton) || item.piecesPerCarton < 1) {
        throw new Error('Pieces per carton must be at least 1')
      }
      if (!Number.isInteger(item.netSalesValueExcl) || item.netSalesValueExcl < 0) {
        throw new Error('Net sales value must be a non-negative whole number')
      }
      if (item.tradeDiscountValue !== undefined && (!Number.isInteger(item.tradeDiscountValue) || item.tradeDiscountValue < 0)) {
        throw new Error('Trade discount must be a non-negative whole number')
      }
      if (item.mrpPerPiece !== undefined && item.mrpPerPiece !== null && (!Number.isInteger(item.mrpPerPiece) || item.mrpPerPiece < 0)) {
        throw new Error('MRP must be a non-negative whole number')
      }

      const product = this.productRepo.findById(item.productId)
      if (!product) {
        throw new Error('Restock references an unknown product')
      }
      if (product.isActive !== 1) {
        throw new Error(`Cannot restock inactive product "${product.name}"`)
      }

      const resolvedItem = {
        productId: item.productId,
        qtyCartons: item.qtyCartons,
        piecesPerCarton: item.piecesPerCarton,
        mrpPerPiece: (item.mrpPerPiece ?? product.mrp ?? null) as number | null,
        netSalesValueExcl: item.netSalesValueExcl,
        tradeDiscountValue: item.tradeDiscountValue ?? 0,
      } satisfies CreateRestockItemDTO

      const lineInput: RestockLineInput = {
        qtyCartons: resolvedItem.qtyCartons,
        piecesPerCarton: resolvedItem.piecesPerCarton,
        netSalesValueExcl: resolvedItem.netSalesValueExcl,
        tradeDiscountValue: resolvedItem.tradeDiscountValue ?? 0,
      }

      const totals = computeRestockLineTotals(lineInput)

      if (totals.discountedValueInclusive < 0) {
        throw new Error('Line total cannot be negative (discount exceeds net value)')
      }

      resolved.push(resolvedItem)
    }

    return resolved
  }

  private validateDate(date: string, label: string): void {
    assertIsoDate(date, label)
  }
}