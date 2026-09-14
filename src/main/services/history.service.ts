import { ActionLogRepository, type ActionLogRow } from '../repositories/action-log.repository'
import { ProductRepository } from '../repositories/product.repository'
import { StockRepository } from '../repositories/stock.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { PaymentRepository } from '../repositories/payment.repository'
import { invoiceDue, invoiceRemaining } from '@shared/types/invoice'
import { localDate } from '@shared/date'
import type { ActionLog, HistoryActionType } from '@shared/types/history'
import type { Invoice, InvoiceItem, InvoiceStatus } from '@shared/types/invoice'
import type { Payment } from '@shared/types/payment'
import type { Product } from '@shared/types/product'
import type { StockMovement } from '@shared/types/stock'

/** Data a domain service snapshots to make an action reversible. */
export interface AppendLogData {
  action: HistoryActionType
  targetType: string
  targetId: number | null
  summary: string
  snapshot: Record<string, unknown> | null
}

type Snapshot = Record<string, unknown>

interface PaymentEntry {
  id: number
  invoiceId: number
  customerId: number
  amount: number
  date: string
  note: string | null
  createdAt: string
}

/**
 * Audit trail + undo/redo.
 *
 * Every recorded action is appended inside the domain service's own transaction
 * (this service never opens a transaction for `append`). Undo and redo each run
 * in their own transaction and work on the current snapshot:
 *  - undo  : the highest-seq `applied` action is reversed and marked `undone`.
 *  - redo  : the lowest-seq `undone` action is replayed and marked `applied`.
 *  - append: any `undone` rows are archived as `superseded` first, so a history
 *            trail is always preserved even when redo is no longer possible.
 */
export class HistoryService {
  private logRepo = new ActionLogRepository()
  private productRepo = new ProductRepository()
  private stockRepo = new StockRepository()
  private invoiceRepo = new InvoiceRepository()
  private paymentRepo = new PaymentRepository()

  list(): ActionLog[] {
    return this.logRepo.findAll().map((row) => this.logRepo.findById(row.id)!)
  }

  recent(limit: number): ActionLog[] {
    return this.logRepo.findAll({ limit }).map((row) => this.logRepo.findById(row.id)!)
  }

  /** True when there is an applied action that can be undone. */
  canUndo(): boolean {
    return this.logRepo.lastApplied() !== null
  }

  /** True when there is an undone action that can be redone. */
  canRedo(): boolean {
    return this.logRepo.nextRedo() !== null
  }

  /** Called by domain services inside their own transaction. */
  append(data: AppendLogData): void {
    this.logRepo.markSuperseded()
    this.logRepo.insert(data)
  }

  undo(): ActionLog {
    return this.logRepo.runInTransaction(() => {
      const row = this.logRepo.lastApplied()
      if (!row) throw new Error('Nothing to undo')
      this.reverseRow(row)
      this.logRepo.setStatus(row.id, 'undone')
      return this.logRepo.findById(row.id)!
    })
  }

  redo(): ActionLog {
    return this.logRepo.runInTransaction(() => {
      const row = this.logRepo.nextRedo()
      if (!row) throw new Error('Nothing to redo')
      this.replayRow(row)
      this.logRepo.setStatus(row.id, 'applied')
      return this.logRepo.findById(row.id)!
    })
  }

  // =========================================================
  //  Undo (reverse an applied action)
  // =========================================================

  private reverseRow(row: ActionLogRow): void {
    const snapshot = parseSnapshot(row)
    switch (row.action) {
      case 'product_created':
        this.reverseProductCreated(snapshot)
        break
      case 'restocked':
        this.reverseRestocked(snapshot, row)
        break
      case 'payment_recorded':
        this.reversePaymentRecorded(snapshot)
        break
      case 'payment_reversed':
        this.reversePaymentReversed(snapshot)
        break
      case 'stock_adjusted':
        this.reverseStockAdjusted(snapshot, row)
        break
      case 'invoice_created':
        this.reverseInvoiceCreated(snapshot)
        break
    }
  }

  private reverseProductCreated(snapshot: Snapshot): void {
    const product = snapshot.product as Product | undefined
    if (!product) throw new Error('Cannot undo: product snapshot is missing')
    const existing = this.productRepo.findById(product.id)
    if (!existing) return // already gone; treat as reversed
    if (this.productRepo.countInvoiceReferences(product.id) > 0) {
      throw new Error(`Cannot undo: "${product.name}" appears on an invoice`)
    }
    this.productRepo.delete(product.id) // stock_movements rows cascade
  }

  private reverseRestocked(snapshot: Snapshot, row: ActionLogRow): void {
    const movement = snapshot.movement as StockMovement | undefined
    if (!movement) throw new Error('Cannot undo: restock snapshot is missing')
    const balance = this.stockRepo.lastNewQuantity(movement.productId) ?? 0
    if (balance < movement.quantity) {
      const name = typeof snapshot.productName === 'string' ? snapshot.productName : 'this product'
      throw new Error(
        `Cannot undo restock: only ${balance} of "${name}" in stock (restocked ${movement.quantity})`
      )
    }
    const reversal = this.stockRepo.insert({
      productId: movement.productId,
      type: 'adjustment',
      quantity: -movement.quantity,
      previousQuantity: balance,
      newQuantity: balance - movement.quantity,
      referenceType: 'restock',
      referenceId: null,
      note: 'Undo restock',
      date: localDate(),
      price: null,
    })
    // Remember the compensation movement so redo can remove it.
    this.logRepo.updateSnapshot(row.id, { ...snapshot, compensationMovementId: reversal.id })
  }

  private reversePaymentRecorded(snapshot: Snapshot): void {
    const entries = (snapshot.entries as PaymentEntry[] | undefined) ?? []
    const touched = new Set<number>()
    for (const entry of entries) {
      this.paymentRepo.deleteById(entry.id)
      touched.add(entry.invoiceId)
    }
    for (const invoiceId of touched) {
      this.refreshInvoicePaymentState(invoiceId)
    }
  }

  private reverseStockAdjusted(snapshot: Snapshot, row: ActionLogRow): void {
    const movement = snapshot.movement as StockMovement | undefined
    if (!movement) throw new Error('Cannot undo: adjustment snapshot is missing')
    const balance = this.stockRepo.lastNewQuantity(movement.productId) ?? 0
    const compensation = -movement.quantity
    if (compensation < 0 && balance < -compensation) {
      throw new Error(
        `Cannot undo adjustment: only ${balance} pcs in stock (adjustment was ${movement.quantity})`
      )
    }
    const reversal = this.stockRepo.insert({
      productId: movement.productId,
      type: 'adjustment',
      quantity: compensation,
      previousQuantity: balance,
      newQuantity: balance + compensation,
      referenceType: 'adjustment',
      referenceId: null,
      note: 'Undo adjustment',
      date: localDate(),
      price: null,
    })
    this.logRepo.updateSnapshot(row.id, { ...snapshot, compensationMovementId: reversal.id })
  }

  private reversePaymentReversed(snapshot: Snapshot): void {
    const entries = (snapshot.entries as PaymentEntry[] | undefined) ?? []
    const touched = new Set<number>()
    for (const entry of entries) {
      this.paymentRepo.insertExplicit({
        id: entry.id,
        invoiceId: entry.invoiceId,
        customerId: entry.customerId,
        amount: entry.amount,
        date: entry.date,
        note: entry.note,
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt,
      } satisfies Payment)
      touched.add(entry.invoiceId)
    }
    for (const invoiceId of touched) {
      this.refreshInvoicePaymentState(invoiceId)
    }
  }

  private reverseInvoiceCreated(snapshot: Snapshot): void {
    const invoice = snapshot.invoice as Invoice | undefined
    if (!invoice) throw new Error('Cannot undo: invoice snapshot is missing')
    const existing = this.invoiceRepo.findById(invoice.id)
    if (!existing) throw new Error('Cannot undo: invoice no longer exists')
    if (existing.paidAmount > 0) {
      throw new Error('Cannot undo: invoice has recorded payments — undo the payments first')
    }
    // Removing the invoice also removes its sale and return movements, keeping the
    // ledger from referencing a deleted invoice.
    this.stockRepo.deleteForInvoice(invoice.id)
    this.invoiceRepo.delete(invoice.id)
  }

  // =========================================================
  //  Redo (replay an undone action)
  // =========================================================

  private replayRow(row: ActionLogRow): void {
    const snapshot = parseSnapshot(row)
    switch (row.action) {
      case 'product_created':
        this.replayProductCreated(snapshot)
        break
      case 'restocked':
        this.replayRestocked(snapshot)
        break
      case 'payment_recorded':
        this.replayPaymentRecorded(snapshot)
        break
      case 'payment_reversed':
        this.replayPaymentReversed(snapshot)
        break
      case 'stock_adjusted':
        this.replayStockAdjusted(snapshot)
        break
      case 'invoice_created':
        this.replayInvoiceCreated(snapshot)
        break
    }
  }

  private replayProductCreated(snapshot: Snapshot): void {
    const product = snapshot.product as Product | undefined
    if (!product) throw new Error('Cannot redo: product snapshot is missing')
    if (this.productRepo.findById(product.id)) {
      throw new Error(`Cannot redo: product "${product.name}" already exists`)
    }
    this.productRepo.restore(product)
  }

  private replayRestocked(snapshot: Snapshot): void {
    const compensationMovementId = snapshot.compensationMovementId as number | undefined
    if (compensationMovementId === undefined) {
      throw new Error('Cannot redo: no restock reversal recorded')
    }
    const reversal = this.stockRepo.findById(compensationMovementId)
    if (!reversal) throw new Error('Cannot redo: restock reversal no longer exists')
    this.stockRepo.deleteById(reversal.id)
  }

  private replayPaymentRecorded(snapshot: Snapshot): void {
    const entries = (snapshot.entries as PaymentEntry[] | undefined) ?? []
    for (const entry of entries) {
      if (this.paymentRepo.findById(entry.id)) continue // already restored
      const invoice = this.invoiceRepo.findById(entry.invoiceId)
      if (!invoice) throw new Error('Cannot redo: invoice no longer exists')
      if (invoice.status === 'cancelled') {
        throw new Error(`Cannot redo: invoice ${invoice.invoiceNumber} was cancelled`)
      }
      if (entry.amount > invoiceRemaining(invoice)) {
        throw new Error('Cannot redo: payment would exceed the invoice balance')
      }
      this.paymentRepo.insertExplicit({
        id: entry.id,
        invoiceId: entry.invoiceId,
        customerId: entry.customerId,
        amount: entry.amount,
        date: entry.date,
        note: entry.note,
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt,
      } satisfies Payment)
      this.refreshInvoicePaymentState(entry.invoiceId)
    }
  }

  private replayStockAdjusted(snapshot: Snapshot): void {
    const compensationMovementId = snapshot.compensationMovementId as number | undefined
    if (compensationMovementId === undefined) {
      throw new Error('Cannot redo: no adjustment reversal recorded')
    }
    const reversal = this.stockRepo.findById(compensationMovementId)
    if (!reversal) throw new Error('Cannot redo: adjustment reversal no longer exists')
    this.stockRepo.deleteById(reversal.id)
  }

  private replayPaymentReversed(snapshot: Snapshot): void {
    const entries = (snapshot.entries as PaymentEntry[] | undefined) ?? []
    const touched = new Set<number>()
    for (const entry of entries) {
      this.paymentRepo.deleteById(entry.id)
      touched.add(entry.invoiceId)
    }
    for (const invoiceId of touched) {
      this.refreshInvoicePaymentState(invoiceId)
    }
  }

  private replayInvoiceCreated(snapshot: Snapshot): void {
    const invoice = snapshot.invoice as Invoice | undefined
    const items = (snapshot.items as InvoiceItem[] | undefined) ?? []
    const movements = (snapshot.movements as StockMovement[] | undefined) ?? []
    if (!invoice) throw new Error('Cannot redo: invoice snapshot is missing')
    if (this.invoiceRepo.findById(invoice.id)) {
      throw new Error(`Cannot redo: invoice ${invoice.invoiceNumber} already exists`)
    }
    this.invoiceRepo.restore(invoice, items)
    for (const movement of movements) {
      this.stockRepo.insertExplicit(movement)
    }
  }

  // =========================================================
  //  Helpers
  // =========================================================

  private refreshInvoicePaymentState(invoiceId: number): void {
    const invoice = this.invoiceRepo.findById(invoiceId)
    if (!invoice || invoice.status === 'cancelled') return
    const paid = this.paymentRepo.sumByInvoice(invoiceId)
    const due = invoiceDue(invoice)
    this.invoiceRepo.updatePaymentState(invoiceId, paid, newStatus(paid, due))
  }
}

function parseSnapshot(row: ActionLogRow): Snapshot {
  if (!row.snapshot) return {}
  try {
    return JSON.parse(row.snapshot) as Snapshot
  } catch {
    return {}
  }
}

function newStatus(paidAmount: number, due: number): InvoiceStatus {
  if (paidAmount >= due) return 'paid'
  if (paidAmount > 0) return 'partial'
  return 'unpaid'
}