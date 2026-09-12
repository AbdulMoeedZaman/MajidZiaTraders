import { InventoryRepository } from '../repositories/inventory.repository'
import { ProductRepository } from '../repositories/product.repository'
import type { StockMovement, StockMovementWithContext, StockSummary, SetOpeningStockDTO } from '@shared/types/inventory'

export class InventoryService {
  private inventoryRepo = new InventoryRepository()
  private productRepo = new ProductRepository()

  listMovements(productId: number): StockMovement[] {
    return this.inventoryRepo.findByProductId(productId)
  }

  listMovementsWithContext(productId: number): StockMovementWithContext[] {
    return this.inventoryRepo.findMovementsWithContext(productId)
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

    return {
      productId,
      currentQuantity,
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
      return {
        productId: p.id,
        currentQuantity,
        isOutOfStock: currentQuantity <= 0,
      }
    })
  }

  getOutOfStock(): StockSummary[] {
    const products = this.productRepo.findAll()
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

  count(): number {
    return this.inventoryRepo.count()
  }
}