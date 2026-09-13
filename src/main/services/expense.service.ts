import { ExpenseRepository } from '../repositories/expense.repository'
import { assertIsoDate } from '@shared/date'
import type {
  CreateExpenseDTO,
  Expense,
  ExpenseDaySummary,
  ExpenseRangeSummary,
} from '@shared/types/expense'

export class ExpenseService {
  private expenseRepo = new ExpenseRepository()

  listForDate(date: string): Expense[] {
    assertIsoDate(date, 'Date')
    return this.expenseRepo.findByDate(date)
  }

  daySummary(date: string): ExpenseDaySummary {
    assertIsoDate(date, 'Date')
    return this.buildDay(date, this.expenseRepo.findByDate(date))
  }

  rangeSummary(from: string, to: string): ExpenseRangeSummary {
    assertIsoDate(from, 'From date')
    assertIsoDate(to, 'To date')

    const expenses = this.expenseRepo.findAllInRange(from, to)
    const byDay = new Map<string, Expense[]>()
    for (const expense of expenses) {
      const list = byDay.get(expense.date)
      if (list) list.push(expense)
      else byDay.set(expense.date, [expense])
    }

    const days = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([date, items]) => this.buildDay(date, items))

    return { from, to, total: expenses.reduce((sum, e) => sum + e.price, 0), byDay: days }
  }

  /**
   * Adds a new expense for the day or updates the price of the existing expense
   * with the same name on the same day.
   */
  save(data: CreateExpenseDTO): Expense {
    assertIsoDate(data.date, 'Date')
    const name = data.name?.trim()
    if (!name) {
      throw new Error('Expense name is required')
    }
    if (!Number.isInteger(data.price) || data.price < 0) {
      throw new Error('Price must be a whole number of paisa and cannot be negative')
    }
    return this.expenseRepo.upsert({ ...data, name, price: data.price })
  }

  delete(id: number): void {
    const existing = this.expenseRepo.findById(id)
    if (!existing) {
      throw new Error('Expense not found')
    }
    this.expenseRepo.delete(id)
  }

  private buildDay(date: string, items: Expense[]): ExpenseDaySummary {
    return {
      date,
      total: items.reduce((sum, e) => sum + e.price, 0),
      items,
    }
  }
}