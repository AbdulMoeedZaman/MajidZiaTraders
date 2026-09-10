import { InvoiceRepository } from '../repositories/invoice.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { ProductRepository } from '../repositories/product.repository'
import { BusinessProfileRepository } from '../repositories/business-profile.repository'
import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import { PaymentRepository } from '../repositories/payment.repository'
import { AllocationService } from './allocation.service'
import type { Invoice, InvoiceWithCustomer, InvoiceWithItems, CreateInvoiceDTO, CreateInvoiceItemDTO, UpdateInvoiceDTO } from '@shared/types/invoice'
import { assertIsoDate } from '@shared/date'

const UPDATABLE_FIELDS = ['notes', 'dueDate'] as const

export class InvoiceService {
  private invoiceRepo = new InvoiceRepository()
  private customerRepo = new CustomerRepository()
  private productRepo = new ProductRepository()
  private profileRepo = new BusinessProfileRepository()
  private ledgerRepo = new CustomerLedgerRepository()
  private inventoryRepo = new InventoryRepository()
  private paymentRepo = new PaymentRepository()
  private allocationService = new AllocationService()

  list(): InvoiceWithCustomer[] {
    this.invoiceRepo.markOverdue()
    return this.invoiceRepo.findAllWithCustomer()
  }

  getById(id: number): Invoice | null {
    this.invoiceRepo.markOverdue()
    return this.invoiceRepo.findById(id)
  }

  getWithItems(id: number): InvoiceWithItems | null {
    this.invoiceRepo.markOverdue()
    const invoice = this.invoiceRepo.findById(id)
    if (!invoice) return null
    const customer = this.customerRepo.findById(invoice.customerId)
    return {
      ...invoice,
      customerName: customer?.name ?? 'Unknown',
      items: this.invoiceRepo.getItems(id),
    }
  }

  getItems(invoiceId: number) {
    return this.invoiceRepo.getItems(invoiceId)
  }

  listByCustomer(customerId: number): InvoiceWithCustomer[] {
    this.invoiceRepo.markOverdue()
    return this.invoiceRepo.findAllWithCustomer({ customerId })
  }

  listByStatus(status: Invoice['status']): InvoiceWithCustomer[] {
    this.invoiceRepo.markOverdue()
    return this.invoiceRepo.findAllWithCustomer({ status })
  }

  listBetween(from: string, to: string): InvoiceWithCustomer[] {
    this.validateDate(from, 'From date')
    this.validateDate(to, 'To date')
    if (from > to) throw new Error('From date cannot be after to date')
    this.invoiceRepo.markOverdue()
    return this.invoiceRepo.findAllWithCustomer({ from, to })
  }

  create(data: CreateInvoiceDTO): Invoice {
    this.validateDate(data.date, 'Date')
    if (data.dueDate !== undefined && data.dueDate !== null && data.dueDate !== '') {
      this.validateDate(data.dueDate, 'Due date')
    }
    if (data.taxRate !== undefined && (!Number.isFinite(data.taxRate) || data.taxRate < 0 || data.taxRate > 100)) {
      throw new Error('Tax rate must be between 0 and 100')
    }
    const discount = data.discount ?? 0
    if (!Number.isInteger(discount) || discount < 0) {
      throw new Error('Discount must be a non-negative whole number of cents')
    }
    if (!data.items || data.items.length === 0) {
      throw new Error('Invoice must have at least one item')
    }

    const customer = this.customerRepo.findById(data.customerId)
    if (!customer) {
      throw new Error('Customer not found')
    }
    if (customer.isActive !== 1) {
      throw new Error(`Cannot create an invoice for inactive customer "${customer.name}"`)
    }

    const items = this.buildItems(data.items)
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.actualSellingPrice, 0)
    if (discount > subtotal) {
      throw new Error('Discount cannot be larger than the invoice subtotal')
    }
    this.assertStock(items)

    let profile = this.profileRepo.get()
    if (!profile) {
      profile = this.profileRepo.create({
        name: 'MajidZiaTraders',
        currency: 'USD',
        invoicePrefix: 'INV-',
        invoiceNextNumber: 1,
        taxRate: 0,
      })
    }

    return this.invoiceRepo.runInTransaction(() => {
      const nextNumber = this.profileRepo.incrementInvoiceNumber()
      const invoiceNumber = this.invoiceRepo.generateInvoiceNumber(profile.invoicePrefix, nextNumber)
      const invoice = this.invoiceRepo.create(
        { ...data, dueDate: data.dueDate || undefined, discount, items, status: 'sent' },
        invoiceNumber
      )

      for (const item of items) {
        this.inventoryRepo.create({
          productId: item.productId,
          type: 'sale',
          quantity: -item.quantity,
          referenceType: 'invoice',
          referenceId: invoice.id,
          reason: `Invoice ${invoice.invoiceNumber}`,
          cost: item.costPriceAtSale,
        })
      }

      this.ledgerRepo.create({
        customerId: data.customerId,
        type: 'invoice',
        referenceType: 'invoice',
        referenceId: invoice.id,
        debit: invoice.total,
        description: `Invoice ${invoice.invoiceNumber}`,
        transactionDate: data.date,
      })

      // Correct status straight away (e.g. a past due date means overdue), then use any customer credit.
      this.invoiceRepo.recomputePaymentState(invoice.id)
      this.allocationService.applyCreditToInvoice(invoice.id, data.customerId)
      this.invoiceRepo.assertConsistency(invoice.id)

      return this.invoiceRepo.findById(invoice.id)!
    })
  }

  /** Only notes and the due date can change after an invoice is issued. */
  update(id: number, data: UpdateInvoiceDTO): Invoice {
    const existing = this.invoiceRepo.findById(id)
    if (!existing) {
      throw new Error('Invoice not found')
    }
    if (existing.status === 'cancelled') {
      throw new Error('Cannot modify a cancelled invoice')
    }
    const blocked = Object.entries(data)
      .filter(([key, value]) => value !== undefined && !(UPDATABLE_FIELDS as readonly string[]).includes(key))
      .map(([key]) => key)
    if (blocked.length > 0) {
      throw new Error(
        `Only the notes and due date of an invoice can be changed (tried to change: ${blocked.join(', ')}). ` +
          'Cancel the invoice and create a new one to change amounts, items or the customer.'
      )
    }
    if (data.dueDate) {
      this.validateDate(data.dueDate, 'Due date')
    }

    return this.invoiceRepo.runInTransaction(() => {
      this.invoiceRepo.update(id, { notes: data.notes, dueDate: data.dueDate })
      this.invoiceRepo.recomputePaymentState(id)
      return this.invoiceRepo.findById(id)!
    })
  }

  cancel(id: number): Invoice {
    const existing = this.invoiceRepo.findById(id)
    if (!existing) {
      throw new Error('Invoice not found')
    }
    if (existing.status === 'cancelled') {
      throw new Error('Invoice is already cancelled')
    }
    if (this.paymentRepo.countDirectPaymentsForInvoice(id) > 0) {
      throw new Error('Cannot cancel an invoice that has payments recorded against it. Delete those payments first.')
    }

    return this.invoiceRepo.runInTransaction(() => {
      const released = this.paymentRepo.releaseAllocationsForInvoice(id)
      this.ledgerRepo.deleteByReference('invoice', id)
      this.restoreStock(id, `Invoice ${existing.invoiceNumber} cancelled`)
      this.invoiceRepo.update(id, { status: 'cancelled' })
      this.invoiceRepo.recomputePaymentState(id)
      this.reapplyCredit(released)
      return this.invoiceRepo.findById(id)!
    })
  }

  delete(id: number): void {
    const existing = this.invoiceRepo.findById(id)
    if (!existing) {
      throw new Error('Invoice not found')
    }
    if (this.paymentRepo.countDirectPaymentsForInvoice(id) > 0) {
      throw new Error('Cannot delete an invoice that has payments recorded against it. Delete those payments first.')
    }
    if (existing.status === 'cancelled') {
      this.invoiceRepo.delete(id)
      return
    }

    this.invoiceRepo.runInTransaction(() => {
      const released = this.paymentRepo.releaseAllocationsForInvoice(id)
      this.ledgerRepo.deleteByReference('invoice', id)
      this.restoreStock(id, `Invoice ${existing.invoiceNumber} deleted`)
      this.invoiceRepo.delete(id)
      this.reapplyCredit(released)
    })
  }

  refreshOverdue(): number {
    return this.invoiceRepo.markOverdue()
  }

  count(): number {
    return this.invoiceRepo.count()
  }

  /** Credit freed from a cancelled/deleted invoice goes to the customer's other open invoices. */
  private reapplyCredit(paymentIds: number[]): void {
    for (const paymentId of paymentIds) {
      const payment = this.paymentRepo.findById(paymentId)
      if (payment) this.allocationService.applyUnallocated(payment.id, payment.customerId)
    }
  }

  private buildItems(items: CreateInvoiceItemDTO[]): CreateInvoiceItemDTO[] {
    const built: CreateInvoiceItemDTO[] = []
    for (const item of items) {
      if (!Number.isInteger(item.productId) || item.productId < 1) {
        throw new Error('Each invoice item requires a valid product')
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Invoice quantity must be a positive whole number')
      }

      const product = this.productRepo.findById(item.productId)
      if (!product) {
        throw new Error('Invoice references an unknown product')
      }
      if (product.isActive !== 1) {
        throw new Error(`Cannot sell inactive product "${product.name}"`)
      }

      const price = item.actualSellingPrice
      if (!Number.isInteger(price) || price < 0) {
        throw new Error(`Selling price for "${product.name}" must be a non-negative whole number of cents`)
      }
      if (product.minSellingPrice > 0 && price < product.minSellingPrice) {
        throw new Error(
          `Cannot sell "${product.name}" below its minimum selling price (${product.minSellingPrice} cents)`
        )
      }

      built.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unit: item.unit ?? product.unit,
        quantity: item.quantity,
        costPriceAtSale: product.baseCostPrice,
        minSellingPriceAtSale: product.minSellingPrice,
        actualSellingPrice: price,
      })
    }
    return built
  }

  private assertStock(items: CreateInvoiceItemDTO[]): void {
    const required = new Map<number, number>()
    for (const item of items) {
      required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity)
    }
    for (const [productId, quantity] of required) {
      const current = this.inventoryRepo.getCurrentQuantity(productId)
      const product = this.productRepo.findById(productId)
      if (current < quantity) {
        throw new Error(
          `Insufficient stock for "${product?.name ?? 'product'}". Available: ${current}, requested: ${quantity}`
        )
      }
    }
  }

  private restoreStock(invoiceId: number, reason: string): void {
    const items = this.invoiceRepo.getItems(invoiceId)
    for (const item of items) {
      this.inventoryRepo.create({
        productId: item.productId,
        type: 'return',
        quantity: item.quantity,
        referenceType: 'invoice',
        referenceId: invoiceId,
        reason,
        cost: item.costPriceAtSale,
      })
    }
  }

  private validateDate(date: string, label: string): void {
    assertIsoDate(date, label)
  }
}
