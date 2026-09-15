import fs from 'fs'
import { parseCsv } from '@shared/csv'
import { ProductRepository } from '../repositories/product.repository'
import { StockRepository } from '../repositories/stock.repository'
import { HistoryService } from './history.service'
import type { Product, CreateProductDTO, UpdateProductDTO, ProductImportResult } from '@shared/types/product'

const MONEY_LABEL = 'Rate'
const SALES_PRICE_LABEL = 'Sales price'
const COUNT_LABEL = 'Pieces per carton'

export class ProductService {
  private productRepo = new ProductRepository()
  private stockRepo = new StockRepository()
  private history = new HistoryService()

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
    if (data.salesPrice !== undefined && data.salesPrice !== null) {
      this.assertMoneyField(data.salesPrice, SALES_PRICE_LABEL)
    }
    this.assertCountField(data.piecesPerCarton, COUNT_LABEL)

    const product = this.productRepo.runInTransaction(() => {
      const created = this.productRepo.create(data)
      this.history.append({
        action: 'product_created',
        targetType: 'product',
        targetId: created.id,
        summary: `Created product "${created.name}"`,
        snapshot: { product: created },
      })
      return created
    })
    return product
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
    if (data.salesPrice !== undefined && data.salesPrice !== null) {
      this.assertMoneyField(data.salesPrice, SALES_PRICE_LABEL)
    }
    if (data.piecesPerCarton !== undefined) {
      this.assertCountField(data.piecesPerCarton, COUNT_LABEL)
      if (data.piecesPerCarton !== existing.piecesPerCarton && this.stockRepo.hasMovements(id)) {
        throw new Error(
          'Pieces per carton cannot be changed after stock movement history exists — create a new product instead'
        )
      }
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
    this.productRepo.delete(id)
  }

  count(): number {
    return this.productRepo.count()
  }

  /**
   * Imports products from a CSV of a sales order. Reads the Description and
   * "Retail Price per carton Exclusive of Sales Tax" columns; Boxes per carton is
   * taken from the second number in a "NxM" pattern inside the description (e.g.
   * "6x18" → 18), defaulting to 1. Creating products never touches the stock
   * ledger. Rows duplicating an existing product name are skipped and reported.
   */
  importFromCsv(filePath: string): ProductImportResult {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
    const rows = parseCsv(text)
    if (rows.length < 2) {
      throw new Error('CSV has no data rows')
    }

    const header = rows[0]
    const nameIdx = header.findIndex((h) => h.trim() === 'Description')
    const priceIdx = header.findIndex((h) => h.trim() === 'Retail Price per carton Exclusive of Sales Tax')

    const result: ProductImportResult = {
      file: filePath,
      created: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      products: [],
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue

      if (nameIdx < 0 || priceIdx < 0) {
        result.skippedInvalid++
        continue
      }
      const name = row[nameIdx]?.trim() ?? ''
      if (!name) {
        result.skippedInvalid++
        continue
      }
      const rawPrice = row[priceIdx]?.trim() ?? ''
      const rate = Math.trunc(parseFloat(rawPrice)) * 100
      if (!Number.isFinite(rate) || rate < 0) {
        result.skippedInvalid++
        continue
      }

      if (this.productRepo.findByName(name)) {
        result.skippedDuplicate++
        continue
      }

      const piecesPerCarton = parseBoxesPerCarton(name)
      const product = this.productRepo.create({ name, rate, piecesPerCarton } satisfies CreateProductDTO)
      this.history.append({
        action: 'product_created',
        targetType: 'product',
        targetId: product.id,
        summary: `Created product "${product.name}" (import)`,
        snapshot: { product },
      })
      result.created++
      result.products.push(product)
    }

    return result
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

/** Reads "NxM" in a product description and returns M (the boxes per carton), else 1. */
function parseBoxesPerCarton(name: string): number {
  const match = /(\d+)[xX](\d+)/.exec(name)
  if (!match) return 1
  const boxes = parseInt(match[2], 10)
  return Number.isInteger(boxes) && boxes >= 1 ? boxes : 1
}