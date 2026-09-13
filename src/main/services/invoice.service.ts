import { InvoiceRepository } from '../repositories/invoice.repository'
import type { InvoiceItemRow } from '../repositories/invoice.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { StockService } from './stock.service'
import { PaymentRepository } from '../repositories/payment.repository'
import { ProjectOwnerRepository } from '../repositories/project-owner.repository'
import { BrokerRepository } from '../repositories/broker.repository'
import { ProductRepository } from '../repositories/product.repository'
import { SettingsRepository } from '../repositories/settings.repository'
import { assertIsoDate, localDate } from '@shared/date'
import { calculateLineAmount } from '@shared/calc/invoice-totals'
import type {
  Invoice,
  InvoiceWithCustomer,
  InvoiceWithItems,
  InvoiceDetails,
  CreateInvoiceDTO,
  CreateInvoiceItemDTO,
  FilerStatus,
  LoadFormSummary,
  LoadFormProductLine,
  LoadFormCustomerLine,
} from '@shared/types/invoice'

const FILER_STATUSES: FilerStatus[] = ['filer', 'non_filer']
const INVOICE_COUNTER_KEY = 'invoice_next_number'

export class InvoiceService {
  private invoiceRepo = new InvoiceRepository()
  private customerRepo = new CustomerRepository()
  private ownerRepo = new ProjectOwnerRepository()
  private brokerRepo = new BrokerRepository()
  private productRepo = new ProductRepository()
  private settingsRepo = new SettingsRepository()
  private stockService = new StockService()
  private paymentRepo = new PaymentRepository()

  list(): InvoiceWithCustomer[] {
    return this.invoiceRepo.findAllWithCustomer()
  }

  getById(id: number): Invoice | null {
    return this.invoiceRepo.findById(id)
  }

  getWithDetails(id: number): InvoiceDetails | null {
    const invoice = this.invoiceRepo.findByIdWithCustomer(id)
    if (!invoice) return null
    const items = this.invoiceRepo.getItems(id)
    const withItems: InvoiceWithItems = { ...invoice, items }
    return {
      invoice: withItems,
      customer: this.customerRepo.findById(invoice.customerId),
      owner: this.ownerRepo.findById(invoice.ownerId),
      broker: this.brokerRepo.findById(invoice.brokerId),
    }
  }

  listByCustomer(customerId: number): InvoiceWithCustomer[] {
    return this.invoiceRepo.findByCustomerId(customerId)
  }

  create(data: CreateInvoiceDTO): Invoice {
    assertIsoDate(data.date, 'Date')
    if (!FILER_STATUSES.includes(data.filerStatus)) {
      throw new Error('Filer status must be "filer" or "non filer"')
    }
    if (!data.items || data.items.length === 0) {
      throw new Error('Invoice must have at least one product line')
    }

    const customer = this.customerRepo.findById(data.customerId)
    if (!customer) {
      throw new Error('Customer not found')
    }
    const owner = this.ownerRepo.findFirst()
    if (!owner) {
      throw new Error('Set up the project owner (Settings → Project Owner) before creating invoices')
    }
    const broker = this.brokerRepo.findById(data.brokerId)
    if (!broker) {
      throw new Error('Booker (broker) not found')
    }

    this.assertOptionalMoney(data.tax, 'Tax')

    const items = this.buildItems(data.items)
    // Totals are system calculated: the grand total is always subtotal + tax and
    // the remaining amount is what is still owed after recorded payments (a new
    // invoice has no payments yet, so it equals the full grand total).
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
    const tax = data.tax ?? 0
    const grandTotal = subtotal + tax
    const remaining = grandTotal

    return this.invoiceRepo.runInTransaction(() => {
      const nextNumber = this.settingsRepo.nextCounter(INVOICE_COUNTER_KEY)
      const invoiceNumber = this.invoiceRepo.generateInvoiceNumber(nextNumber)
      const invoice = this.invoiceRepo.create(data, invoiceNumber, owner.id, items, grandTotal, remaining)
      this.stockService.recordSalesForInvoice(
        invoice.id,
        invoice.date,
        items.map((item) => ({
          productId: item.productId,
          quantity: item.cartonCount + item.boxCount,
          rate: item.rate,
        }))
      )
      return invoice
    })
  }

  delete(id: number): void {
    const invoice = this.invoiceRepo.findById(id)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    if (invoice.paidAmount > 0) {
      throw new Error('An invoice with recorded payments cannot be deleted \u2014 cancel it first')
    }
    // The invoice's stock movements are removed in the same transaction so the
    // ledger never references a deleted invoice.
    this.invoiceRepo.runInTransaction(() => {
      this.stockService.removeForInvoice(id)
      this.invoiceRepo.delete(id)
    })
  }

  /**
   * Cancels an invoice: reverses any payments, restocks the products with a `return`
   * movement per original sale, and marks the invoice `cancelled` (kept for history).
   * Cancelled amounts no longer count as received or as profit.
   */
  cancel(id: number): Invoice | null {
    const invoice = this.invoiceRepo.findById(id)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    if (invoice.status === 'cancelled') {
      throw new Error('Invoice is already cancelled')
    }

    return this.invoiceRepo.runInTransaction(() => {
      this.paymentRepo.deleteForInvoice(id)
      this.stockService.revertSalesForInvoice(id, localDate())
      this.invoiceRepo.updatePaymentState(id, 0, 'cancelled')
      return this.invoiceRepo.findById(id)!
    })
  }

  /**
   * Aggregates a set of invoices into the data behind a printable load form:
   * every distinct product (with combined quantities) and every customer
   * (with the sum of their invoice amounts), plus the overall grand total.
   */
  buildLoadReport(invoiceIds: number[]): LoadFormSummary {
    const ids = [...new Set(invoiceIds ?? [])]
    if (ids.length === 0) {
      throw new Error('Select at least one invoice for the load form')
    }

    const productMap = new Map<number, LoadFormProductLine>()
    const customerMap = new Map<number, LoadFormCustomerLine>()
    const invoiceNumbers: string[] = []

    for (const id of ids) {
      const invoice = this.invoiceRepo.findByIdWithCustomer(id)
      if (!invoice) {
        throw new Error('Invoice not found')
      }
      if (invoice.status === 'cancelled') {
        throw new Error(`Invoice ${invoice.invoiceNumber} is cancelled and cannot be on a load form`)
      }
      invoiceNumbers.push(invoice.invoiceNumber)

      const amount = invoice.grandTotal ?? invoice.subtotal
      const customerLine = customerMap.get(invoice.customerId)
      if (customerLine) {
        customerLine.amount += amount
      } else {
        customerMap.set(invoice.customerId, {
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          amount,
        })
      }

      const items = this.invoiceRepo.getItems(id)
      for (const item of items) {
        const line = productMap.get(item.productId)
        if (line) {
          line.cartonCount += item.cartonCount
          line.boxCount += item.boxCount
          line.totalQuantity += item.cartonCount + item.boxCount
        } else {
          productMap.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            cartonCount: item.cartonCount,
            boxCount: item.boxCount,
            totalQuantity: item.cartonCount + item.boxCount,
          })
        }
      }
    }

    const products = [...productMap.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName)
    )
    const customers = [...customerMap.values()].sort((a, b) =>
      a.customerName.localeCompare(b.customerName)
    )
    const grandTotal = customers.reduce((sum, c) => sum + c.amount, 0)

    return { invoiceNumbers, products, customers, grandTotal }
  }

  count(): number {
    return this.invoiceRepo.count()
  }

  private buildItems(items: CreateInvoiceItemDTO[]): InvoiceItemRow[] {
    return items.map((item) => {
      if (!Number.isInteger(item.productId) || item.productId < 1) {
        throw new Error('Each invoice line requires a valid product')
      }
      const product = this.productRepo.findById(item.productId)
      if (!product) {
        throw new Error('Invoice references an unknown product')
      }

      if (!Number.isInteger(item.rate) || item.rate < 0) {
        throw new Error(`Rate for "${product.name}" must be a whole number of cents and cannot be negative`)
      }
      if (item.rate < product.rate) {
        throw new Error(
          `Rate for "${product.name}" cannot be lower than its minimum rate (${product.rate} cents)`
        )
      }
      if (!Number.isInteger(item.cartonCount) || item.cartonCount < 0) {
        throw new Error(`Carton count for "${product.name}" must be a whole number`)
      }
      if (!Number.isInteger(item.boxCount) || item.boxCount < 0) {
        throw new Error(`Box count for "${product.name}" must be a whole number`)
      }
      if (item.cartonCount + item.boxCount <= 0) {
        throw new Error(`Line for "${product.name}" needs at least one carton or box`)
      }

      const amount = calculateLineAmount({
        rate: item.rate,
        boxesPerCarton: product.boxesPerCarton,
        cartonCount: item.cartonCount,
        boxCount: item.boxCount,
      })

      return {
        productId: product.id,
        productName: product.name,
        rate: item.rate,
        minRate: product.rate,
        boxesPerCarton: product.boxesPerCarton,
        cartonCount: item.cartonCount,
        boxCount: item.boxCount,
        amount,
      }
    })
  }

  private assertOptionalMoney(value: number | null | undefined, label: string): void {
    if (value === null || value === undefined) return
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a whole number of cents and cannot be negative`)
    }
  }
}