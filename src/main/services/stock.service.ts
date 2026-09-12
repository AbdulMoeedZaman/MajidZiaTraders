import { StockRepository } from '../repositories/stock.repository'
import { ProductRepository } from '../repositories/product.repository'
import { localDate } from '@shared/date'
import type {
  StockMovement,
  StockMovementWithProduct,
  CreateRestockDTO,
} from '@shared/types/stock'

export class StockService {
  private stockRepo = new StockRepository()
  private productRepo = new ProductRepository()

  /** Full stock ledger, newest first (join resolves product + customer names). */
  list(): StockMovementWithProduct[] {
    return this.stockRepo.findAllWithProduct()
  }

  /** Ledger for a single product, newest first. */
  listByProduct(productId: number): StockMovementWithProduct[] {
    return this.stockRepo.findByProduct(productId)
  }

  /** Adds stock via a `purchase` movement, recording the running balance. */
  restock(data: CreateRestockDTO): StockMovement {
    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }
    if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
      throw new Error('Restock quantity must be a whole number greater than zero')
    }

    return this.stockRepo.runInTransaction(() => {
      const previous = this.stockRepo.lastNewQuantity(data.productId) ?? 0
      return this.stockRepo.insert({
        productId: data.productId,
        type: 'purchase',
        quantity: data.quantity,
        previousQuantity: previous,
        newQuantity: previous + data.quantity,
        referenceType: 'restock',
        referenceId: null,
        note: null,
        date: localDate(new Date()),
        price: null,
      })
    })
  }

  /**
   * Records one `sale` movement per invoice line inside the invoice's own
   * transaction. Quantity is negative (cartons + loose boxes) and `price`
   * snapshots the billed rate at that moment.
   */
  recordSalesForInvoice(
    invoiceId: number,
    date: string,
    lines: Array<{ productId: number; quantity: number; rate: number }>
  ): void {
    for (const line of lines) {
      const previous = this.stockRepo.lastNewQuantity(line.productId) ?? 0
      this.stockRepo.insert({
        productId: line.productId,
        type: 'sale',
        quantity: -line.quantity,
        previousQuantity: previous,
        newQuantity: previous - line.quantity,
        referenceType: 'invoice',
        referenceId: invoiceId,
        note: null,
        date,
        price: line.rate,
      })
    }
  }

  /** Removes the movements a deleted invoice created (kept in sync with the ledger). */
  removeForInvoice(invoiceId: number): void {
    this.stockRepo.deleteForInvoice(invoiceId)
  }
}