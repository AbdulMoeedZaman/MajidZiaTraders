import { BaseRepository } from './base.repository'
import type {
  CustomerLedgerEntry,
  CustomerLedgerEntryWithBalance,
  CustomerLedgerQuery,
  CreateCustomerLedgerDTO,
} from '@shared/types/customer-ledger'
import { localDate } from '@shared/date'

export interface LedgerTotals {
  totalDebit: number
  totalCredit: number
}

export class CustomerLedgerRepository extends BaseRepository {
  query(query: CustomerLedgerQuery): CustomerLedgerEntryWithBalance[] {
    return this.db
      .prepare(
        `SELECT * FROM (
           SELECT l.*,
                  SUM(l.debit - l.credit) OVER (
                    PARTITION BY l.customerId ORDER BY l.transactionDate, l.id
                  ) AS runningBalance
           FROM customer_ledger l
           WHERE l.customerId = @customerId
         )
         WHERE (@from IS NULL OR transactionDate >= @from)
           AND (@to IS NULL OR transactionDate <= @to)
         ORDER BY transactionDate DESC, id DESC
         LIMIT @limit`
      )
      .all({
        customerId: query.customerId,
        from: query.from ?? null,
        to: query.to ?? null,
        limit: query.limit ?? -1,
      }) as CustomerLedgerEntryWithBalance[]
  }

  findByCustomerId(customerId: number): CustomerLedgerEntry[] {
    return this.db
      .prepare('SELECT * FROM customer_ledger WHERE customerId = ? ORDER BY transactionDate DESC, id DESC')
      .all(customerId) as CustomerLedgerEntry[]
  }

  findById(id: number): CustomerLedgerEntry | null {
    return this.db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(id) as CustomerLedgerEntry | null
  }

  getTotals(customerId: number): LedgerTotals {
    const result = this.db
      .prepare(
        `SELECT COALESCE(SUM(debit), 0) AS totalDebit, COALESCE(SUM(credit), 0) AS totalCredit
         FROM customer_ledger WHERE customerId = ?`
      )
      .get(customerId) as LedgerTotals
    return result
  }

  getTotalsAtDate(customerId: number, date: string): LedgerTotals {
    const result = this.db
      .prepare(
        `SELECT COALESCE(SUM(debit), 0) AS totalDebit, COALESCE(SUM(credit), 0) AS totalCredit
         FROM customer_ledger WHERE customerId = ? AND transactionDate <= ?`
      )
      .get(customerId, date) as LedgerTotals
    return result
  }

  /** Sum of every customer's balance that is above zero (what customers owe in total). */
  getTotalPositiveBalance(): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(balance), 0) AS total FROM (
           SELECT SUM(debit) - SUM(credit) AS balance FROM customer_ledger GROUP BY customerId
         ) WHERE balance > 0`
      )
      .get() as { total: number }
    return row.total
  }

  getTotalsByCustomer(): Map<number, LedgerTotals> {
    const rows = this.db
      .prepare(
        `SELECT customerId,
                COALESCE(SUM(debit), 0) AS totalDebit,
                COALESCE(SUM(credit), 0) AS totalCredit
         FROM customer_ledger
         GROUP BY customerId`
      )
      .all() as Array<{ customerId: number; totalDebit: number; totalCredit: number }>
    const map = new Map<number, LedgerTotals>()
    for (const row of rows) {
      map.set(row.customerId, { totalDebit: row.totalDebit, totalCredit: row.totalCredit })
    }
    return map
  }

  countByCustomer(customerId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM customer_ledger WHERE customerId = ?')
      .get(customerId) as { count: number }
    return result.count
  }

  create(data: CreateCustomerLedgerDTO): CustomerLedgerEntry {
    const result = this.db
      .prepare(
        `INSERT INTO customer_ledger (customerId, type, referenceType, referenceId, debit, credit, description, transactionDate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.customerId,
        data.type,
        data.referenceType ?? null,
        data.referenceId ?? null,
        data.debit ?? 0,
        data.credit ?? 0,
        data.description?.trim() || null,
        data.transactionDate ?? localDate()
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  deleteByReference(referenceType: string, referenceId: number): void {
    this.db
      .prepare('DELETE FROM customer_ledger WHERE referenceType = ? AND referenceId = ?')
      .run(referenceType, referenceId)
  }

  deleteByCustomerId(customerId: number): void {
    this.db.prepare('DELETE FROM customer_ledger WHERE customerId = ?').run(customerId)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM customer_ledger').get() as { count: number }).count
  }
}