import { ProductRepository } from '../repositories/product.repository'
import { CategoryRepository } from '../repositories/category.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { RestockRepository } from '../repositories/restock.repository'
import { StockAdjustmentRepository } from '../repositories/stock-adjustment.repository'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'
import type { ProductWithStock } from '@shared/types/inventory'

export class ProductService {
  private productRepo = new ProductRepository()
  private categoryRepo = new CategoryRepository()
  private inventoryRepo = new InventoryRepository()
  private invoiceRepo = new InvoiceRepository()
  private restockRepo = new RestockRepository()
  private stockAdjustmentRepo = new StockAdjustmentRepository()

  list(): Product[] {
    return this.productRepo.findAll()
  }

  listActive(): Product[] {
    return this.productRepo.findActive()
  }

  listInactive(): Product[] {
    return this.productRepo.findInactive()
  }

  listWithStock(): ProductWithStock[] {
    const products = this.productRepo.findAll()
    return this.attachStock(products)
  }

  listActiveWithStock(): ProductWithStock[] {
    const products = this.productRepo.findActive()
    return this.attachStock(products)
  }

  getById(id: number): Product | null {
    return this.productRepo.findById(id)
  }

  getBySku(sku: string): Product | null {
    return this.productRepo.findBySku(sku)
  }

  getByCategory(categoryId: number): Product[] {
    return this.productRepo.findByCategoryId(categoryId)
  }

  search(query: string): Product[] {
    return this.productRepo.search(query)
  }

  searchWithStock(query: string): ProductWithStock[] {
    const products = this.productRepo.search(query)
    return this.attachStock(products)
  }

  create(data: CreateProductDTO): Product {
    if (!data.name?.trim()) {
      throw new Error('Product name is required')
    }
    if (!data.sku?.trim()) {
      throw new Error('SKU is required')
    }
    this.assertMoneyFields(data)
    if (data.piecesPerCarton !== undefined && (!Number.isInteger(data.piecesPerCarton) || data.piecesPerCarton < 1)) {
      throw new Error('Pieces per carton must be a whole number of at least 1')
    }
    if (data.reorderLevel !== undefined && (!Number.isInteger(data.reorderLevel) || data.reorderLevel < 0)) {
      throw new Error('Reorder level must be a whole number of at least 0')
    }
    const sellingPrice = data.sellingPrice ?? 0
    const minSellingPrice = data.minSellingPrice ?? 0
    if (sellingPrice < minSellingPrice) {
      throw new Error('Selling price cannot be lower than the minimum selling price')
    }
    if (data.categoryId) {
      const category = this.categoryRepo.findById(data.categoryId)
      if (!category) {
        throw new Error('Invalid category')
      }
    }
    if (this.productRepo.findBySku(data.sku)) {
      throw new Error('A product with this SKU already exists')
    }

    return this.productRepo.create(data)
  }

  update(id: number, data: UpdateProductDTO): Product {
    const existing = this.productRepo.findById(id)
    if (!existing) {
      throw new Error('Product not found')
    }
    if (data.name !== undefined && !data.name.trim()) {
      throw new Error('Product name cannot be empty')
    }
    if (data.sku !== undefined) {
      if (!data.sku.trim()) {
        throw new Error('SKU cannot be empty')
      }
      const conflict = this.productRepo.findBySkuExcludingId(data.sku, id)
      if (conflict) {
        throw new Error('A product with this SKU already exists')
      }
    }
    this.assertMoneyFields(data)
    if (data.piecesPerCarton !== undefined && (!Number.isInteger(data.piecesPerCarton) || data.piecesPerCarton < 1)) {
      throw new Error('Pieces per carton must be a whole number of at least 1')
    }
    if (data.reorderLevel !== undefined && (!Number.isInteger(data.reorderLevel) || data.reorderLevel < 0)) {
      throw new Error('Reorder level must be a whole number of at least 0')
    }

    const merged = { ...existing, ...data }
    if (merged.sellingPrice < merged.minSellingPrice) {
      throw new Error('Selling price cannot be lower than the minimum selling price')
    }

    if (data.categoryId) {
      const category = this.categoryRepo.findById(data.categoryId)
      if (!category) {
        throw new Error('Invalid category')
      }
    }

    return this.productRepo.update(id, data)
  }

  setActive(id: number, isActive: boolean): Product {
    const existing = this.productRepo.findById(id)
    if (!existing) {
      throw new Error('Product not found')
    }
    return this.productRepo.update(id, { isActive: isActive ? 1 : 0 })
  }

  delete(id: number): void {
    const existing = this.productRepo.findById(id)
    if (!existing) {
      throw new Error('Product not found')
    }
    if (this.invoiceRepo.countItemsByProductId(id) > 0) {
      throw new Error('Cannot delete a product that has been sold on an invoice')
    }
    if (this.restockRepo.countItemsByProductId(id) > 0) {
      throw new Error('Cannot delete a product that appears on a restock order')
    }
    if (this.stockAdjustmentRepo.countByProductId(id) > 0) {
      throw new Error('Cannot delete a product with stock adjustments')
    }
    if (this.inventoryRepo.countByProductId(id) > 0) {
      throw new Error('Cannot delete a product with stock history. Deactivate it instead.')
    }
    this.productRepo.delete(id)
  }

  private assertMoneyFields(data: CreateProductDTO | UpdateProductDTO): void {
    for (const [field, label] of [
      ['baseCostPrice', 'Base cost price'],
      ['minSellingPrice', 'Minimum selling price'],
      ['sellingPrice', 'Selling price'],
    ] as const) {
      const value = data[field]
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new Error(`${label} must be a whole number of cents and cannot be negative`)
      }
    }
  }

  count(): number {
    return this.productRepo.count()
  }

  countActive(): number {
    return this.productRepo.countActive()
  }

  private attachStock(products: Product[]): ProductWithStock[] {
    if (products.length === 0) return []

    const ids = products.map((p) => p.id)
    const quantities = this.inventoryRepo.getCurrentQuantities(ids)

    return products.map((p) => {
      const currentStock = quantities.get(p.id) ?? 0
      const reorderLevel = p.reorderLevel ?? 0
      return {
        ...p,
        currentStock,
        isLowStock: reorderLevel > 0 && currentStock > 0 && currentStock <= reorderLevel,
        isOutOfStock: currentStock <= 0,
      }
    })
  }
}