import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import type {
  CustomerLedgerEntry,
  CustomerLedgerEntryWithBalance,
  CustomerLedgerSummary,
  CreateCustomerLedgerDTO,
} from '@shared/types/customer-ledger'
import { LEDGER_ENTRY_TYPES } from '@shared/types/customer-ledger'
import { localDate } from '@shared/date'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export class CustomerLedgerService {
  private ledgerRepo = new CustomerLedgerRepository()
  private customerRepo = new CustomerRepository()

  listByCustomer(customerId: number): CustomerLedgerEntry[] {
    this.assertCustomerExists(customerId)
    return this.ledgerRepo.findByCustomerId(customerId)
  }

  query(customerId: number, from?: string, to?: string, limit?: number): CustomerLedgerEntryWithBalance[] {
    this.assertCustomerExists(customerId)
    this.validateDate(from, 'From date')
    this.validateDate(to, 'To date')

    if (from && to && from > to) {
      throw new Error('From date cannot be after to date')
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error('Limit must be a positive integer')
    }

    return this.ledgerRepo.query({ customerId, from, to, limit })
  }

  getById(id: number): CustomerLedgerEntry | null {
    return this.ledgerRepo.findById(id)
  }

  getBalance(customerId: number): number {
    this.assertCustomerExists(customerId)
    const totals = this.ledgerRepo.getTotals(customerId)
    return totals.totalDebit - totals.totalCredit
  }

  getOutstandingBalance(customerId: number): number {
    const balance = this.getBalance(customerId)
    return balance > 0 ? balance : 0
  }

  getBalanceAtDate(customerId: number, date: string): number {
    this.assertCustomerExists(customerId)
    this.validateDate(date, 'Date')
    const totals = this.ledgerRepo.getTotalsAtDate(customerId, date)
    return totals.totalDebit - totals.totalCredit
  }

  getSummary(customerId: number): CustomerLedgerSummary {
    this.assertCustomerExists(customerId)
    const totals = this.ledgerRepo.getTotals(customerId)
    const entryCount = this.ledgerRepo.countByCustomer(customerId)
    const balance = totals.totalDebit - totals.totalCredit
    return {
      customerId,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      balance,
      outstanding: balance > 0 ? balance : 0,
      entryCount,
    }
  }

  create(data: CreateCustomerLedgerDTO): CustomerLedgerEntry {
    this.assertCustomerExists(data.customerId)

    if (!LEDGER_ENTRY_TYPES.includes(data.type)) {
      throw new Error(`Invalid ledger entry type: ${data.type}`)
    }

    const debit = data.debit ?? 0
    const credit = data.credit ?? 0

    this.validateAmount(debit, 'Debit')
    this.validateAmount(credit, 'Credit')

    if (debit === 0 && credit === 0) {
      throw new Error('Ledger entry must have a debit or a credit')
    }
    if (debit > 0 && credit > 0) {
      throw new Error('Ledger entry cannot have both a debit and a credit')
    }

    if (data.referenceId !== undefined && data.referenceId !== null && !data.referenceType) {
      throw new Error('Reference type is required when a reference id is provided')
    }

    const transactionDate = data.transactionDate ?? localDate()
    this.validateDate(transactionDate, 'Transaction date')

    return this.ledgerRepo.create({ ...data, debit, credit, transactionDate })
  }

  private assertCustomerExists(customerId: number): void {
    if (!Number.isInteger(customerId) || customerId < 1) {
      throw new Error('Invalid customer reference')
    }
    const customer = this.customerRepo.findById(customerId)
    if (!customer) {
      throw new Error('Customer not found')
    }
  }

  private validateDate(date: string | undefined, label: string): void {
    if (date === undefined) return
    if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
      throw new Error(`${label} must be a valid date in YYYY-MM-DD format`)
    }
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${label} is not a valid date`)
    }
    const [year, month, day] = date.split('-').map(Number)
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
      throw new Error(`${label} is not a valid date`)
    }
  }

  private validateAmount(amount: number, label: string): void {
    if (!Number.isInteger(amount)) {
      throw new Error(`${label} must be a whole number of cents`)
    }
    if (amount < 0) {
      throw new Error(`${label} cannot be negative`)
    }
  }

  count(): number {
    return this.ledgerRepo.count()
  }
}