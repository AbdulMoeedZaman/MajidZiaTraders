import { BaseRepository } from './base.repository'
import type { Expense, CreateExpenseDTO } from '@shared/types/expense'

export class ExpenseRepository extends BaseRepository {
  findByDate(date: string): Expense[] {
    return this.db
      .prepare('SELECT * FROM expenses WHERE date = ? ORDER BY id ASC')
      .all(date) as Expense[]
  }

  findByDateAndName(date: string, name: string): Expense | null {
    return this.db
      .prepare('SELECT * FROM expenses WHERE date = ? AND name = ?')
      .get(date, name) as Expense | null
  }

  findById(id: number): Expense | null {
    return this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Expense | null
  }

  findAllInRange(from: string, to: string): Expense[] {
    return this.db
      .prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC')
      .all(from, to) as Expense[]
  }

  /**
   * Adds a new expense for the day, or updates the price of the existing expense
   * with the same name on the same day.
   */
  upsert(data: CreateExpenseDTO): Expense {
    this.db
      .prepare(
        `INSERT INTO expenses (date, name, price) VALUES (?, ?, ?)
         ON CONFLICT (date, name) DO UPDATE SET
           price = excluded.price,
           updatedAt = datetime('now')`
      )
      .run(data.date, data.name.trim(), data.price)
    return this.findByDateAndName(data.date, data.name.trim())!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
  }
}