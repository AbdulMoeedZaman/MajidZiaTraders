import { StockRepository } from '../repositories/stock.repository'
import { ProductRepository } from '../repositories/product.repository'
import { HistoryService } from './history.service'
import { localDate } from '@shared/date'
import type {
  StockMovement,
  StockMovementWithProduct,
  StockLevel,
  CreateRestockDTO,
} from '@shared/types/stock'

export class StockService {
  private stockRepo = new StockRepository()
  private productRepo = new ProductRepository()
  private history = new HistoryService()

  /** Full stock ledger, newest first (join resolves product + customer names). */
  list(): StockMovementWithProduct[] {
    return this.stockRepo.findAllWithProduct()
  }

  /** Ledger for a single product, newest first. */
  listByProduct(productId: number): StockMovementWithProduct[] {
    return this.stockRepo.findByProduct(productId)
  }

  /** Current running balance for every product (newest first per name). */
  levels(): StockLevel[] {
    return this.stockRepo.currentLevels()
  }

  /** Current running balance of one product (0 when the ledger has no rows yet). */
  currentQuantity(productId: number): number {
    return this.stockRepo.lastNewQuantity(productId) ?? 0
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
      const movement = this.stockRepo.insert({
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
      this.history.append({
        action: 'restocked',
        targetType: 'stock',
        targetId: movement.id,
        summary: `Restocked "${product.name}" +${data.quantity}`,
        snapshot: { movement, productName: product.name },
      })
      return movement
    })
  }

  /**
   * Records one `sale` movement per invoice line inside the invoice's own
   * transaction. Quantity is negative (cartons + loose boxes) and `price`
   * snapshots the billed rate at that moment. Returns the written movements so
   * callers can snapshot them for the action log.
   */
  recordSalesForInvoice(
    invoiceId: number,
    date: string,
    lines: Array<{ productId: number; quantity: number; rate: number }>
  ): StockMovement[] {
    const movements: StockMovement[] = []
    for (const line of lines) {
      const previous = this.stockRepo.lastNewQuantity(line.productId) ?? 0
      movements.push(
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
      )
    }
    return movements
  }

  /** Removes the movements a deleted invoice created (kept in sync with the ledger). */
  removeForInvoice(invoiceId: number): void {
    this.stockRepo.deleteForInvoice(invoiceId)
  }

  /**
   * Reverses an invoice's sales: one `return` movement per original `sale` row so the
   * product's running balance is restored exactly. The reversal is linked to the same
   * invoice, so the ledger stays coherent and can be traced back to the cancellation.
   */
  revertSalesForInvoice(invoiceId: number, date: string): void {
    const sales = this.stockRepo.findSalesForInvoice(invoiceId)
    for (const sale of sales) {
      const previous = this.stockRepo.lastNewQuantity(sale.productId) ?? 0
      this.stockRepo.insert({
        productId: sale.productId,
        type: 'return',
        quantity: -sale.quantity,
        previousQuantity: previous,
        newQuantity: previous - sale.quantity,
        referenceType: 'invoice',
        referenceId: invoiceId,
        note: 'Invoice cancelled',
        date,
        price: sale.price,
      })
    }
  }
}