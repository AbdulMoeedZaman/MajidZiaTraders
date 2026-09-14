import { StockRepository } from '../repositories/stock.repository'
import { ProductRepository } from '../repositories/product.repository'
import { HistoryService } from './history.service'
import { localDate } from '@shared/date'
import type {
  StockMovement,
  StockMovementWithProduct,
  StockLevel,
  CreateRestockDTO,
  AdjustStockDTO,
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

  /**
   * Manual correction to a product's balance — the wrong-step fix on the
   * adjustments screen. A positive quantity adds stock, a negative quantity
   * removes it, always recorded with an `adjustment` movement so the ledger
   * stays traceable. Removing more than the current balance is blocked.
   */
  adjust(data: AdjustStockDTO): StockMovement {
    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }
    const cartons = data.cartons
    const loose = data.loosePieces ?? 0
    if (!Number.isInteger(cartons) || cartons < 0) {
      throw new Error('Cartons must be a whole number of at least 0')
    }
    if (!Number.isInteger(loose) || loose < 0) {
      throw new Error('Loose pieces must be a whole number of at least 0')
    }
    if (cartons === 0 && loose === 0) {
      throw new Error('Enter cartons or loose pieces to adjust')
    }

    const pieces = cartons * product.boxesPerCarton + loose
    const current = this.stockRepo.lastNewQuantity(data.productId) ?? 0
    if (data.remove && pieces > current) {
      throw new Error(
        `Cannot remove ${pieces} pcs — only ${current} pcs of "${product.name}" in stock`
      )
    }

    const quantity = data.remove ? -pieces : pieces
    const note = data.note?.trim() || (data.remove ? 'Stock removed (manual adjustment)' : 'Stock added (manual adjustment)')

    return this.stockRepo.runInTransaction(() => {
      const previous = this.stockRepo.lastNewQuantity(data.productId) ?? 0
      const movement = this.stockRepo.insert({
        productId: data.productId,
        type: 'adjustment',
        quantity,
        previousQuantity: previous,
        newQuantity: previous + quantity,
        referenceType: 'adjustment',
        referenceId: null,
        note,
        date: localDate(new Date()),
        price: null,
      })
      const detail = cartons > 0 ? `${cartons} ctn` : ''
      const loosePart = loose > 0 ? `${loose} pcs` : ''
      this.history.append({
        action: 'stock_adjusted',
        targetType: 'stock',
        targetId: movement.id,
        summary: `Adjusted "${product.name}" ${data.remove ? '−' : '+'}${pieces} pcs (${[detail, loosePart].filter(Boolean).join(' + ') || `${pieces} pcs`})`,
        snapshot: { movement, productName: product.name },
      })
      return movement
    })
  }

  /**
   * Adds stock via a `purchase` movement. The DTO's `quantity` is the number of
   * whole cartons and `loosePieces` the loose pieces on top; the ledger records
   * the equivalent total pieces (cartons × boxesPerCarton + loosePieces) so
   * balances are always in pieces. At least one of the two must be present.
   */
  restock(data: CreateRestockDTO): StockMovement {
    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }
    const cartons = data.quantity
    const loose = data.loosePieces ?? 0
    if (!Number.isInteger(cartons) || cartons < 0) {
      throw new Error('Cartons must be a whole number of at least 0')
    }
    if (!Number.isInteger(loose) || loose < 0) {
      throw new Error('Loose pieces must be a whole number of at least 0')
    }
    if (cartons === 0 && loose === 0) {
      throw new Error('Enter cartons or loose pieces to restock')
    }

    const pieces = cartons * product.boxesPerCarton + loose
    return this.stockRepo.runInTransaction(() => {
      const previous = this.stockRepo.lastNewQuantity(data.productId) ?? 0
      const movement = this.stockRepo.insert({
        productId: data.productId,
        type: 'purchase',
        quantity: pieces,
        previousQuantity: previous,
        newQuantity: previous + pieces,
        referenceType: 'restock',
        referenceId: null,
        note: null,
        date: localDate(new Date()),
        price: null,
      })
      const detail = cartons > 0 ? `+${cartons} ctn` : ''
      const loosePart = loose > 0 ? `+${loose} pcs` : ''
      this.history.append({
        action: 'restocked',
        targetType: 'stock',
        targetId: movement.id,
        summary: `Restocked "${product.name}" ${detail} ${loosePart} (+${pieces} pcs)`.replace(/\s+/g, ' ').trim(),
        snapshot: { movement, productName: product.name },
      })
      return movement
    })
  }

  /**
   * Records one `sale` movement per invoice line inside the invoice's own
   * transaction. Quantity is negative (pieces = cartons × boxesPerCarton +
   * loose boxes) and `price` snapshots the billed rate at that moment. Returns
   * the written movements so callers can snapshot them for the action log.
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