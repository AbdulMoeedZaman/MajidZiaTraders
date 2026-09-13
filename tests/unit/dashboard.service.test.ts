import { describe, expect, it } from 'vitest'
import { DashboardService } from '../../src/main/services/dashboard.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { StockService } from '../../src/main/services/stock.service'
import { ExpenseService } from '../../src/main/services/expense.service'
import { localDate } from '@shared/date'
import { useTestDatabase, seedBasics } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('DashboardService', () => {
  useTestDatabase()

  const invoiceInput = (
    seed: ReturnType<typeof seedBasics>,
    opts: { customerId: number; date: string; rate?: number; cartonCount?: number; boxCount?: number },
  ): CreateInvoiceDTO => ({
    customerId: opts.customerId,
    brokerId: seed.brokerId,
    date: opts.date,
    filerStatus: 'filer',
    remaining: null,
    tax: null,
    grandTotal: null,
    items: [
      {
        productId: seed.product.id,
        rate: opts.rate ?? 1000,
        cartonCount: opts.cartonCount ?? 2,
        boxCount: opts.boxCount ?? 6,
      },
    ],
  })

  it('computes total and per-customer profit as billed minus product price within the range', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedBasics()

    // amount = 1000*2 + round(1000*6/12) = 2500; cost = 500*2 + round(500*6/12) = 1250 → profit 1250
    invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 1000, cartonCount: 2, boxCount: 6 })
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
    const seed = seedBasics()

    invoices.create(invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10', rate: 500 }))

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.profit.total).toBe(0)
    expect(s.profit.perCustomer).toHaveLength(0)
  })

  it('counts and lists only the invoices inside the selected date range', () => {
    const dashboard = new DashboardService()
    const invoices = new InvoiceService()
    const seed = seedBasics()

    const inRange = invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10' })
    )
    invoices.create(invoiceInput(seed, { customerId: seed.customerId, date: '2026-08-01' }))

    const s = dashboard.summary('2026-09-01', '2026-09-30')
    expect(s.invoices.total).toBe(1)
    expect(s.invoices.list.map((i) => i.id)).toEqual([inRange.id])
  })

  it('reports remaining stock per product from the latest ledger balance', () => {
    const dashboard = new DashboardService()
    const stock = new StockService()
    const invoices = new InvoiceService()
    const seed = seedBasics()

    stock.restock({ productId: seed.product.id, quantity: 30 })
    invoices.create(
      invoiceInput(seed, { customerId: seed.customerId, date: '2026-09-10' }) // quantity -8
    )

    const s = dashboard.summary('2026-01-01', '2026-12-31')
    const row = s.stock.perProduct.find((p) => p.productId === seed.product.id)
    expect(row?.remaining).toBe(22)
    expect(s.stock.total).toBe(22)
    expect(s.stock.perProduct.length).toBeGreaterThan(0)
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