import { CustomerRepository } from '../repositories/customer.repository'
import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { PaymentRepository } from '../repositories/payment.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import type {
  Customer,
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerStatusFilter,
  CustomerWithBalance,
} from '@shared/types/customer'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class CustomerService {
  private customerRepo = new CustomerRepository()
  private ledgerRepo = new CustomerLedgerRepository()
  private paymentRepo = new PaymentRepository()
  private invoiceRepo = new InvoiceRepository()

  list(): Customer[] {
    return this.customerRepo.findAll()
  }

  listActive(): Customer[] {
    return this.customerRepo.findActive()
  }

  listInactive(): Customer[] {
    return this.customerRepo.findInactive()
  }

  listByStatus(filter: CustomerStatusFilter): Customer[] {
    return this.customerRepo.findByStatus(filter)
  }

  listWithBalances(filter: CustomerStatusFilter = 'all'): CustomerWithBalance[] {
    return this.customerRepo.findAllWithTotals(filter).map((c) => this.withBalance(c))
  }

  getById(id: number): Customer | null {
    return this.customerRepo.findById(id)
  }

  getWithBalance(id: number): CustomerWithBalance | null {
    const customer = this.customerRepo.findByIdWithTotals(id)
    return customer ? this.withBalance(customer) : null
  }

  search(query: string, status: CustomerStatusFilter = 'active'): Customer[] {
    return this.customerRepo.search(query, status)
  }

  create(data: CreateCustomerDTO): Customer {
    const name = data.name?.trim()
    if (!name) {
      throw new Error('Customer name is required')
    }

    if (this.customerRepo.findByName(name)) {
      throw new Error('A customer with this name already exists')
    }

    this.validateContact(data.phone, data.email)

    const existingPhone = data.phone?.trim()
    if (existingPhone && this.customerRepo.findByPhone(existingPhone)) {
      throw new Error('A customer with this phone number already exists')
    }

    return this.customerRepo.create(data)
  }

  update(id: number, data: UpdateCustomerDTO): Customer {
    const existing = this.customerRepo.findById(id)
    if (!existing) {
      throw new Error('Customer not found')
    }

    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new Error('Customer name cannot be empty')
      }
      const conflict = this.customerRepo.findByNameExcludingId(data.name.trim(), id)
      if (conflict) {
        throw new Error('A customer with this name already exists')
      }
    }

    this.validateContact(data.phone, data.email)

    if (data.phone !== undefined) {
      const phone = data.phone?.trim()
      if (phone) {
        const conflict = this.customerRepo.findByPhoneExcludingId(phone, id)
        if (conflict) {
          throw new Error('A customer with this phone number already exists')
        }
      }
    }

    return this.customerRepo.update(id, data)
  }

  setActive(id: number, isActive: boolean): Customer {
    const existing = this.customerRepo.findById(id)
    if (!existing) {
      throw new Error('Customer not found')
    }
    return this.customerRepo.update(id, { isActive: isActive ? 1 : 0 })
  }

  delete(id: number): void {
    const existing = this.customerRepo.findById(id)
    if (!existing) {
      throw new Error('Customer not found')
    }

    const ledgerCount = this.ledgerRepo.countByCustomer(id)
    const payments = this.paymentRepo.findByCustomerId(id)
    const invoices = this.invoiceRepo.findByCustomerId(id)

    if (ledgerCount > 0 || payments.length > 0 || invoices.length > 0) {
      throw new Error(
        'Customer has account history (ledger, payments, or invoices). Deactivate them instead of deleting.'
      )
    }

    this.customerRepo.delete(id)
  }

  count(): number {
    return this.customerRepo.count()
  }

  countActive(): number {
    return this.customerRepo.countActive()
  }

  private validateContact(phone?: string, email?: string): void {
    if (email && !EMAIL_PATTERN.test(email.trim())) {
      throw new Error('Invalid email format')
    }

    if (phone) {
      const digits = (phone as string).replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) {
        throw new Error('Invalid phone number')
      }
    }
  }

  private withBalance(c: Customer & { totalDebit: number; totalCredit: number }): CustomerWithBalance {
    const balance = c.totalDebit - c.totalCredit
    return {
      ...c,
      balance,
      outstanding: balance > 0 ? balance : 0,
    }
  }
}