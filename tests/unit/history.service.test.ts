import { describe, expect, it } from 'vitest'
import { HistoryService } from '../../src/main/services/history.service'
import { ProductService } from '../../src/main/services/product.service'
import { StockService } from '../../src/main/services/stock.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { PaymentService } from '../../src/main/services/payment.service'
import { useTestDatabase, seedBasics, seedStocked } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'
import type { StockMovement } from '../../src/shared/types/stock'

describe('HistoryService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedStocked>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    tax: null,
    items: [{ productId: seed.product.id, rate: 500, cartonCount: 2, boxCount: 0 }],
  })

  it('records product, restock, invoice and payment actions, newest first', () => {
    const seed = seedStocked(10)
    const inv = new InvoiceService().create(invoiceInput(seed))
    new PaymentService().payInvoice(inv.id, 500)

    const logs = new HistoryService().list()
    expect(logs).toHaveLength(4)
    expect(logs.map((l) => l.action)).toEqual([
      'payment_recorded',
      'invoice_created',
      'restocked',
      'product_created',
    ])
    expect(logs.every((l) => l.status === 'applied')).toBe(true)
    expect(logs[2].summary).toContain('Widget 1')
    expect(logs[1].summary).toContain('INV-000001')
  })

  it('undo and redo a product creation', () => {
    const products = new ProductService()
    const history = new HistoryService()
    const product = products.create({ name: 'Shaft Rod', rate: 2000, boxesPerCarton: 5 })
    expect(products.getById(product.id)).toBeTruthy()

    const undone = history.undo()
    expect(undone.action).toBe('product_created')
    expect(products.getById(product.id)).toBeFalsy()

    history.redo()
    expect(products.getById(product.id)?.name).toBe('Shaft Rod')
  })

  it('undo and redo a restock, restoring the running balance', () => {
    const seed = seedBasics()
    const stock = new StockService()
    const history = new HistoryService()
    stock.restock({ productId: seed.product.id, quantity: 10 }) // 10 cartons × 12 = 120 pcs
    expect(stock.list()).toHaveLength(1)
    expect(stock.list()[0].newQuantity).toBe(120)

    history.undo()
    expect(stock.list()).toHaveLength(2)
    expect(stock.list()[0].type).toBe('adjustment')
    expect(stock.list()[0].newQuantity).toBe(0) // balance back to pre-restock level

    history.redo()
    expect(stock.list()).toHaveLength(1) // the compensation movement is removed
    expect(stock.list()[0].newQuantity).toBe(120)
  })

  it('undo and redo a recorded payment', () => {
    const seed = seedStocked(2)
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const history = new HistoryService()
    const inv = invoices.create(invoiceInput(seed))
    const paid = payments.payInvoice(inv.id, 1000)
    expect(paid.status).toBe('paid')

    history.undo()
    const unpaid = invoices.getById(inv.id)!
    expect(unpaid.status).toBe('unpaid')
    expect(unpaid.paidAmount).toBe(0)
    expect(payments.listByInvoice(inv.id)).toHaveLength(0)

    history.redo()
    const paidAgain = invoices.getById(inv.id)!
    expect(paidAgain.status).toBe('paid')
    expect(paidAgain.paidAmount).toBe(1000)
    expect(payments.listByInvoice(inv.id)).toHaveLength(1)
  })

  it('undo and redo an invoice creation, preserving the invoice number', () => {
    const seed = seedStocked(10)
    const invoices = new InvoiceService()
    const stock = new StockService()
    const history = new HistoryService()
    const inv = invoices.create(invoiceInput(seed))
    const sale = (): StockMovement => stock.list().find((m) => m.type === 'sale')!
    expect(sale().previousQuantity).toBe(120) // 10 cartons × 12
    expect(sale().newQuantity).toBe(96) // 120 seeded - 2 cartons × 12 sold

    history.undo()
    expect(invoices.getById(inv.id)).toBeFalsy()
    expect(invoices.count()).toBe(0)
    expect(stock.list().filter((m) => m.type === 'sale')).toHaveLength(0)
    expect(stock.list().find((m) => m.type === 'purchase')!.newQuantity).toBe(120)

    history.redo()
    const restored = invoices.getById(inv.id)!
    expect(restored.invoiceNumber).toBe('INV-000001')
    expect(restored.subtotal).toBe(1000)
    expect(stock.list().find((m) => m.type === 'sale')!.newQuantity).toBe(96)
  })

  it('a new applied action supersedes the undo trail', () => {
    const products = new ProductService()
    const history = new HistoryService()
    products.create({ name: 'First', rate: 1000, boxesPerCarton: 5 })

    // Undo is available, then a fresh action archives the undone trail.
    expect(history.canUndo()).toBe(true)
    history.undo()
    expect(history.canRedo()).toBe(true)

    products.create({ name: 'Second', rate: 2000, boxesPerCarton: 5 })
    expect(history.canRedo()).toBe(false)

    const undone = history.list().find((l) => l.action === 'product_created' && l.summary.includes('First'))
    expect(undone?.status).toBe('superseded')
    expect(products.list().map((p) => p.name)).toEqual(['Second'])
  })

  it('undo and redo with nothing to reverse throw', () => {
    const history = new HistoryService()
    expect(() => history.undo()).toThrow(/Nothing to undo/)
    expect(() => history.redo()).toThrow(/Nothing to redo/)
  })

  it('undo and redo a stock adjustment, restoring the balance', () => {
    const seed = seedBasics()
    const stock = new StockService()
    const history = new HistoryService()
    stock.restock({ productId: seed.product.id, quantity: 5 }) // 60 pcs

    stock.adjust({ productId: seed.product.id, cartons: 1, loosePieces: 0, remove: false }) // +12 → 72
    expect(stock.currentQuantity(seed.product.id)).toBe(72)

    history.undo()
    expect(stock.currentQuantity(seed.product.id)).toBe(60) // compensation -12

    history.redo()
    expect(stock.currentQuantity(seed.product.id)).toBe(72) // compensation removed
  })

  it('undo and redo a removed payment, restoring it exactly', () => {
    const seed = seedStocked(2)
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const history = new HistoryService()
    const inv = invoices.create(invoiceInput(seed))
    payments.payInvoice(inv.id, 1000)
    payments.removePayment(new PaymentService().listByInvoice(inv.id)[0].id)

    expect(invoices.getById(inv.id)!.status).toBe('unpaid')

    history.undo()
    expect(invoices.getById(inv.id)!.status).toBe('paid')
    expect(invoices.getById(inv.id)!.paidAmount).toBe(1000)
    expect(payments.listByInvoice(inv.id)).toHaveLength(1)

    history.redo()
    expect(invoices.getById(inv.id)!.status).toBe('unpaid')
    expect(payments.listByInvoice(inv.id)).toHaveLength(0)
  })
})