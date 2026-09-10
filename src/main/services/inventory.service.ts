import { InventoryRepository } from '../repositories/inventory.repository'
import { ProductRepository } from '../repositories/product.repository'
import type { StockMovement, RecordMovementDTO, StockSummary, SetOpeningStockDTO } from '@shared/types/inventory'

export class InventoryService {
  private inventoryRepo = new InventoryRepository()
  private productRepo = new ProductRepository()

  listMovements(productId: number): StockMovement[] {
    return this.inventoryRepo.findByProductId(productId)
  }

  getById(id: number): StockMovement | null {
    return this.inventoryRepo.findById(id)
  }

  getCurrentQuantity(productId: number): number {
    return this.inventoryRepo.getCurrentQuantity(productId)
  }

  getCurrentQuantities(productIds: number[]): Map<number, number> {
    return this.inventoryRepo.getCurrentQuantities(productIds)
  }

  getStockSummary(productId: number): StockSummary | null {
    const product = this.productRepo.findById(productId)
    if (!product) {
      throw new Error('Product not found')
    }

    const currentQuantity = this.inventoryRepo.getCurrentQuantity(productId)
    const reorderLevel = product.reorderLevel ?? 0

    return {
      productId,
      currentQuantity,
      reorderLevel,
      isLowStock: reorderLevel > 0 && currentQuantity > 0 && currentQuantity <= reorderLevel,
      isOutOfStock: currentQuantity <= 0,
    }
  }

  getStockSummaries(productIds: number[]): StockSummary[] {
    if (productIds.length === 0) return []

    const products = productIds
      .map((id) => this.productRepo.findById(id))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    const quantities = this.inventoryRepo.getCurrentQuantities(products.map((p) => p.id))

    return products.map((p) => {
      const currentQuantity = quantities.get(p.id) ?? 0
      const reorderLevel = p.reorderLevel ?? 0
      return {
        productId: p.id,
        currentQuantity,
        reorderLevel,
        isLowStock: reorderLevel > 0 && currentQuantity > 0 && currentQuantity <= reorderLevel,
        isOutOfStock: currentQuantity <= 0,
      }
    })
  }

  getLowStock(): StockSummary[] {
    const products = this.productRepo.findActive()
    const summaries = this.getStockSummaries(products.map((p) => p.id))
    return summaries.filter((s) => s.isLowStock)
  }

  getOutOfStock(): StockSummary[] {
    const products = this.productRepo.findActive()
    const summaries = this.getStockSummaries(products.map((p) => p.id))
    return summaries.filter((s) => s.isOutOfStock)
  }

  setOpeningStock(data: SetOpeningStockDTO): StockMovement {
    if (!data.productId) {
      throw new Error('Product ID is required')
    }
    if (data.quantity === undefined || data.quantity < 0) {
      throw new Error('Opening stock quantity cannot be negative')
    }

    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }

    return this.inventoryRepo.setQuantity(data.productId, data.quantity, 'opening_stock', 'Opening stock')
  }

  recordMovement(data: RecordMovementDTO): StockMovement {
    if (!data.productId) {
      throw new Error('Product ID is required')
    }
    if (!data.type) {
      throw new Error('Movement type is required')
    }
    if (!data.quantity || data.quantity <= 0) {
      throw new Error('Quantity must be greater than zero')
    }

    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }

    const currentQty = this.inventoryRepo.getCurrentQuantity(data.productId)

    if (data.type === 'sale' || data.type === 'damage' || data.type === 'adjustment') {
      if (currentQty < data.quantity) {
        throw new Error(
          `Insufficient stock. Available: ${currentQty}, requested: ${data.quantity}`
        )
      }
    }

    return this.inventoryRepo.create(data)
  }

  count(): number {
    return this.inventoryRepo.count()
  }
}