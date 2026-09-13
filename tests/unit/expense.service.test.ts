import { describe, expect, it } from 'vitest'
import { ExpenseService } from '../../src/main/services/expense.service'
import { useTestDatabase } from './helpers'

describe('ExpenseService', () => {
  useTestDatabase()

  it('saves individual expenses linked to their date', () => {
    const service = new ExpenseService()
    const a = service.save({ date: '2026-09-13', name: 'Travelling', price: 5000 })
    const b = service.save({ date: '2026-09-13', name: 'Loader', price: 3000 })

    expect(a.date).toBe('2026-09-13')
    expect(a.name).toBe('Travelling')
    expect(b.price).toBe(3000)

    const rows = service.listForDate('2026-09-13')
    expect(rows).toHaveLength(2)
    expect(rows.map((e) => e.name).sort()).toEqual(['Loader', 'Travelling'])
  })

  it('updates an existing expense instead of duplicating it on the same day', () => {
    const service = new ExpenseService()
    service.save({ date: '2026-09-13', name: 'Travelling', price: 5000 })

    const updated = service.save({ date: '2026-09-13', name: 'Travelling', price: 8000 })

    expect(updated.price).toBe(8000)
    const rows = service.listForDate('2026-09-13')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(updated.id)
    expect(rows[0].price).toBe(8000)
  })

  it('keeps the same expense name on different days as separate entries', () => {
    const service = new ExpenseService()
    service.save({ date: '2026-09-13', name: 'Travelling', price: 5000 })
    service.save({ date: '2026-09-14', name: 'Travelling', price: 7000 })

    expect(service.listForDate('2026-09-13')).toHaveLength(1)
    expect(service.listForDate('2026-09-14')).toHaveLength(1)
  })

  it('calculates the day total', () => {
    const service = new ExpenseService()
    service.save({ date: '2026-09-13', name: 'Travelling', price: 5000 })
    service.save({ date: '2026-09-13', name: 'Loader', price: 3000 })

    const summary = service.daySummary('2026-09-13')
    expect(summary.total).toBe(8000)
    expect(summary.items).toHaveLength(2)
  })

  it('range summary groups by day (newest first) and excludes out-of-range days', () => {
    const service = new ExpenseService()
    service.save({ date: '2026-09-10', name: 'Tea', price: 1000 })
    service.save({ date: '2026-09-11', name: 'Tea', price: 2000 })
    service.save({ date: '2026-09-12', name: 'Travelling', price: 5000 })
    service.save({ date: '2026-08-01', name: 'Old', price: 9999 })

    const range = service.rangeSummary('2026-09-10', '2026-09-12')
    expect(range.total).toBe(8000)
    expect(range.byDay.map((d) => d.date)).toEqual(['2026-09-12', '2026-09-11', '2026-09-10'])
    expect(range.byDay[0].total).toBe(5000)
    expect(range.byDay[1].items[0].price).toBe(2000)
  })

  it('rejects an invalid date, empty name, negative price and fractional price', () => {
    const service = new ExpenseService()
    expect(() => service.save({ date: 'junk', name: 'X', price: 100 })).toThrow(/valid date/)
    expect(() => service.save({ date: '2026-09-13', name: '  ', price: 100 })).toThrow(/name is required/)
    expect(() => service.save({ date: '2026-09-13', name: 'X', price: -1 })).toThrow(/cannot be negative/)
    expect(() => service.save({ date: '2026-09-13', name: 'X', price: 10.5 })).toThrow(/whole number/)
  })

  it('deletes an existing expense and rejects a missing one', () => {
    const service = new ExpenseService()
    const saved = service.save({ date: '2026-09-13', name: 'Loader', price: 3000 })

    service.delete(saved.id)
    expect(service.listForDate('2026-09-13')).toHaveLength(0)
    expect(() => service.delete(9999)).toThrow(/Expense not found/)
  })
})