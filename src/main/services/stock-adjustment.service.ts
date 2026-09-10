import { StockAdjustmentRepository } from '../repositories/stock-adjustment.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import { ProductRepository } from '../repositories/product.repository'
import type { StockAdjustment, CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'

export class StockAdjustmentService {
  private adjustmentRepo = new StockAdjustmentRepository()
  private inventoryRepo = new InventoryRepository()
  private productRepo = new ProductRepository()

  list(): StockAdjustment[] {
    return this.adjustmentRepo.findAll()
  }

  getById(id: number): StockAdjustment | null {
    return this.adjustmentRepo.findById(id)
  }

  listByProduct(productId: number): StockAdjustment[] {
    return this.adjustmentRepo.findByProductId(productId)
  }

  create(data: CreateStockAdjustmentDTO): StockAdjustment {
    if (!data.productId) {
      throw new Error('Product ID is required')
    }
    if (!data.type) {
      throw new Error('Adjustment type is required')
    }
    if (!data.quantityAdjustment || !Number.isInteger(data.quantityAdjustment)) {
      throw new Error('Quantity adjustment must be a non-zero whole number')
    }
    if (!data.reason?.trim()) {
      throw new Error('Reason is required')
    }

    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }

    return this.adjustmentRepo.runInTransaction(() => {
      const adjustmentQuantity = data.quantityAdjustment
      if (adjustmentQuantity < 0) {
        const currentQty = this.inventoryRepo.getCurrentQuantity(data.productId)
        if (currentQty + adjustmentQuantity < 0) {
          throw new Error(
            `Adjustment would result in negative stock. Available: ${currentQty}, adjustment: ${adjustmentQuantity}`
          )
        }
      }

      const movementType = data.type === 'return' ? 'return' : 'adjustment'
      const movement = this.inventoryRepo.create({
        productId: data.productId,
        type: movementType,
        quantity: adjustmentQuantity,
        referenceType: 'stock_adjustment',
        reason: data.reason,
      })

      return this.adjustmentRepo.create(data, movement.id)
    })
  }

  /**
   * "Deleting" an adjustment reverses it: a new movement undoes its stock change and the
   * adjustment is marked reversed. Movement rows are never deleted, so the stock chain stays intact.
   */
  delete(id: number): void {
    const existing = this.adjustmentRepo.findById(id)
    if (!existing) {
      throw new Error('Stock adjustment not found')
    }
    if (existing.reversedAt) {
      throw new Error('This stock adjustment has already been reversed')
    }

    this.adjustmentRepo.runInTransaction(() => {
      const reversal = -existing.quantityAdjustment
      const current = this.inventoryRepo.getCurrentQuantity(existing.productId)
      if (current + reversal < 0) {
        throw new Error(
          `Reversing this adjustment would make stock negative. Available: ${current}, reversal: ${reversal}`
        )
      }
      const movement = this.inventoryRepo.create({
        productId: existing.productId,
        type: 'adjustment',
        quantity: reversal,
        referenceType: 'stock_adjustment_reversal',
        referenceId: id,
        reason: `Reversal of adjustment #${id}`,
      })
      this.adjustmentRepo.markReversed(id, movement.id)
    })
  }

  count(): number {
    return this.adjustmentRepo.count()
  }
}
