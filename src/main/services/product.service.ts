import { ProductRepository } from '../repositories/product.repository'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

const MONEY_LABEL = 'Rate'
const COUNT_LABEL = 'Boxes per carton'

export class ProductService {
  private productRepo = new ProductRepository()

  list(): Product[] {
    return this.productRepo.findAll()
  }

  getById(id: number): Product | null {
    return this.productRepo.findById(id)
  }

  search(query: string): Product[] {
    return this.productRepo.search(query)
  }

  create(data: CreateProductDTO): Product {
    const name = data.name?.trim()
    if (!name) {
      throw new Error('Product name is required')
    }
    if (this.productRepo.findByName(name)) {
      throw new Error('A product with this name already exists')
    }
    this.assertMoneyField(data.rate, MONEY_LABEL)
    this.assertCountField(data.boxesPerCarton, COUNT_LABEL)
    return this.productRepo.create(data)
  }

  update(id: number, data: UpdateProductDTO): Product {
    const existing = this.productRepo.findById(id)
    if (!existing) {
      throw new Error('Product not found')
    }
    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new Error('Product name cannot be empty')
      }
      const conflict = this.productRepo.findByNameExcludingId(data.name.trim(), id)
      if (conflict) {
        throw new Error('A product with this name already exists')
      }
    }
    if (data.rate !== undefined) {
      this.assertMoneyField(data.rate, MONEY_LABEL)
    }
    if (data.boxesPerCarton !== undefined) {
      this.assertCountField(data.boxesPerCarton, COUNT_LABEL)
    }
    return this.productRepo.update(id, data)
  }

  delete(id: number): void {
    const existing = this.productRepo.findById(id)
    if (!existing) {
      throw new Error('Product not found')
    }
    if (this.productRepo.countInvoiceReferences(id) > 0) {
      throw new Error('Cannot delete a product that appears on an invoice')
    }
    if (this.productRepo.countStockLedger(id) > 0) {
      throw new Error('Cannot delete a product that has stock ledger entries')
    }
    this.productRepo.delete(id)
  }

  count(): number {
    return this.productRepo.count()
  }

  private assertMoneyField(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a whole number of cents and cannot be negative`)
    }
  }

  private assertCountField(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${label} must be a whole number of at least 1`)
    }
  }
}