import { describe, expect, it } from 'vitest'
import { DashboardService } from '../../src/main/services/dashboard.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { PaymentService } from '../../src/main/services/payment.service'
import { StockService } from '../../src/main/services/stock.service'
import { ExpenseService } from '../../src/main/services/expense.service'
import { localDate } from '@shared/date'
import { useTestDatabase, seedBasics, seedStocked } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('DashboardService', () => {
  useTestDatabase()

  const invoiceInput = (
    seed: ReturnType<typeof seedBasics>,
    opts: { customerId: number; date: string; rate?: number; quantity?: number },
  ): CreateInvoiceDTO => ({
    customerId: opts.customerId,
    brokerId: seed.brokerId,
    date: opts.date,
    filerStatus: 'filer',
    tax: null,
    items: [
      {
        productId: seed.product.id,
        rate: opts.rate ?? 1000,
        quantity: opts.quantity ?? 30,
      },
    ],
  })

  it('computes total and per-customer profit as billed minus product price within the range', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedStocked(8)

    // amount = 1000*2 + round(1000*6/12) = 2500; cost = 500*2 + round(500*6/12) = 1250 → profit 1250
    invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 1000, quantity: 30 })
    )

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.profit.total).toBe(1250)
    expect(s.profit.perCustomer).toHaveLength(1)
    expect(s.profit.perCustomer[0].customerName).toBe('Bilal Auto Shop')
    expect(s.profit.perCustomer[0].profit).toBe(1250)
    expect(s.profit.perCustomer[0].invoices).toBe(1)
    expect(s.range).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('a sale at exactly the product price contributes zero profit', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedStocked(8)

    invoices.create(invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 500 }))

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.profit.total).toBe(0)
    expect(s.profit.perCustomer).toHaveLength(0)
  })

  it('counts and lists only the invoices inside the selected date range', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedStocked(16)

    const inRange = invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10' })
    )
    invoices.create(invoiceInput(seed, { customerId: seed.customerId, date: '2026-08-01' }))

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.invoices.total).toBe(1)
    expect(s.invoices.list.map((i) => i.id)).toEqual([inRange.id])
  })

  it('attributes the billed sales per customer for the profit modal', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedStocked(8)

    invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 1000, quantity: 30 })
    )

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.profit.perCustomer[0].sales).toBe(2500)
  })

  it('reports what every customer owes across open invoices', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const seed = seedStocked(8)

    const invoice = invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 1000 })
    )

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.owed.total).toBe(2500)
    expect(s.owed.perCustomer).toHaveLength(1)
    expect(s.owed.perCustomer[0].customerName).toBe('Bilal Auto Shop')
    expect(s.owed.perCustomer[0].openInvoices).toBe(1)
    expect(s.owed.perCustomer[0].owed).toBe(2500)

    payments.payInvoice(invoice.id, 1000)

    const after = dashboard.summary('2026-09-01', '2026-09-30')
    expect(after.owed.total).toBe(1500)
    expect(after.owed.perCustomer[0].openInvoices).toBe(1)
  })

  it('breaks down cash flow into received payments and paid expenses', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const expenses = new ExpenseService()
    const seed = seedStocked(8)

    const invoice = invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 1000 })
    )
    payments.payInvoice(invoice.id, 2500)
    expenses.save({ date: '2026-09-11', name: 'Travelling', price: 1200 })

    const s = dashboard.summary('2026-09-01', '2026-09-30')

    expect(s.cashFlow.inward.total).toBe(2500)
    expect(s.cashFlow.inward.payments).toHaveLength(1)
    expect(s.cashFlow.inward.payments[0]).toMatchObject({
      customerName: 'Bilal Auto Shop',
      invoiceNumber: 'INV-000001',
      amount: 2500,
    })
    expect(s.cashFlow.outward.total).toBe(1200)
    expect(s.cashFlow.outward.expenses[0].name).toBe('Travelling')
    const net = s.cashFlow.inward.total - s.cashFlow.outward.total
    expect(net).toBe(1300)
  })

  it('lists the units dispatched by today from the sale ledger', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedStocked(8)
    const today = localDate()

    invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: today, rate: 1000, quantity: 30 })
    )

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.invoices.dispatchedToday).toHaveLength(1)
    expect(s.invoices.dispatchedToday[0]).toMatchObject({
      productName: seed.product.name,
      quantity: 30,
      amount: 2500,
    })
  })

  it('reports remaining stock per product from the latest ledger balance', () => {
    const dashboard = new DashboardService()
    const stock = new StockService()
    const invoices = new InvoiceService()
    const seed = seedBasics()

    stock.restock({ productId: seed.product.id, quantity: 30 }) // 30 cartons × 12 = 360 pcs
    invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10' }) // -30 pcs (2×12 + 6)
    )

    const s = dashboard.summary('2026-01-01', '2026-12-31')
    const row = s.stock.perProduct.find((p) => p.productId === seed.product.id)
    expect(row?.remaining).toBe(330)
    expect(row?.piecesPerCarton).toBe(12)
    expect(s.stock.total).toBe(330)
    expect(s.stock.perProduct.length).toBeGreaterThan(0)
    // 330 pcs at rate 500 / carton (12 pcs) → round(330 × 500 / 12) = 13750
    expect(row?.value).toBe(13750)
    expect(s.stock.totalValue).toBe(13750)
  })

  it('rejects an invalid range', () => {
    const dashboard = new DashboardService()
    expect(() => dashboard.summary('not-a-date', '2026-09-30')).toThrow(/valid date in YYYY-MM-DD/)
  })

  it('reports today total always and range expenses grouped by day', () => {
    const dashboard = new DashboardService()
    const expenses = new ExpenseService()
    const today = localDate()
    expenses.save({ date: today, name: 'Travelling', price: 5000 })
    expenses.save({ date: today, name: 'Loader', price: 3000 })
    expenses.save({ date: '2026-09-01', name: 'Tea', price: 1000 })

    const s = dashboard.summary('2026-09-01', today)

    expect(s.expenses.todayTotal).toBe(8000)
    expect(s.expenses.total).toBe(9000)
    expect(s.expenses.byDay[0].date).toBe(today)
    expect(s.expenses.byDay[0].total).toBe(8000)
    expect(s.expenses.byDay[0].items).toHaveLength(2)
  })

  it('expense range adapts to the selected dates while today total stays current', () => {
    const dashboard = new DashboardService()
    const expenses = new ExpenseService()
    const today = localDate()
    expenses.save({ date: today, name: 'Travelling', price: 5000 })
    expenses.save({ date: '2026-09-01', name: 'Tea', price: 1000 })

    const s = dashboard.summary('2026-09-01', '2026-09-01')

    expect(s.expenses.todayTotal).toBe(5000)
    expect(s.expenses.total).toBe(1000)
    expect(s.expenses.byDay).toHaveLength(1)
    expect(s.expenses.byDay[0].items[0].name).toBe('Tea')
  })
})