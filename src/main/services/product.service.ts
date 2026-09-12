import { ProductRepository } from '../repositories/product.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { RestockRepository } from '../repositories/restock.repository'
import { StockAdjustmentRepository } from '../repositories/stock-adjustment.repository'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'
import type { ProductWithStock } from '@shared/types/inventory'

export class ProductService {
  private productRepo = new ProductRepository()
  private inventoryRepo = new InventoryRepository()
  private invoiceRepo = new InvoiceRepository()
  private restockRepo = new RestockRepository()
  private stockAdjustmentRepo = new StockAdjustmentRepository()

  list(): Product[] {
    return this.productRepo.findAll()
  }

  listWithStock(): ProductWithStock[] {
    const products = this.productRepo.findAll()
    return this.attachStock(products)
  }

  getById(id: number): Product | null {
    return this.productRepo.findById(id)
  }

  getBySku(sku: string): Product | null {
    return this.productRepo.findBySku(sku)
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
    const sellingPrice = data.sellingPrice ?? 0
    const minSellingPrice = data.minSellingPrice ?? 0
    if (sellingPrice < minSellingPrice) {
      throw new Error('Selling price cannot be lower than the minimum selling price')
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

    const merged = { ...existing, ...data }
    if (merged.sellingPrice < merged.minSellingPrice) {
      throw new Error('Selling price cannot be lower than the minimum selling price')
    }

    return this.productRepo.update(id, data)
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
      throw new Error('Cannot delete a product with stock history')
    }
    this.productRepo.delete(id)
  }

  private assertMoneyFields(data: CreateProductDTO | UpdateProductDTO): void {
    for (const [field, label] of [
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

  private attachStock(products: Product[]): ProductWithStock[] {
    if (products.length === 0) return []

    const ids = products.map((p) => p.id)
    const quantities = this.inventoryRepo.getCurrentQuantities(ids)

    return products.map((p) => {
      const currentStock = quantities.get(p.id) ?? 0
      return {
        ...p,
        currentStock,
        isOutOfStock: currentStock <= 0,
      }
    })
  }
}