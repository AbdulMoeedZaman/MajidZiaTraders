import { InvoiceRepository } from '../repositories/invoice.repository'
import type { InvoiceItemRow } from '../repositories/invoice.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { ProjectOwnerRepository } from '../repositories/project-owner.repository'
import { BrokerRepository } from '../repositories/broker.repository'
import { ProductRepository } from '../repositories/product.repository'
import { SettingsRepository } from '../repositories/settings.repository'
import { assertIsoDate } from '@shared/date'
import { calculateLineAmount } from '@shared/calc/invoice-totals'
import type {
  Invoice,
  InvoiceWithCustomer,
  InvoiceWithItems,
  InvoiceDetails,
  CreateInvoiceDTO,
  CreateInvoiceItemDTO,
  FilerStatus,
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

    this.assertOptionalMoney(data.remaining, 'Remaining amount')
    this.assertOptionalMoney(data.tax, 'Tax')
    this.assertOptionalMoney(data.grandTotal, 'Grand total')

    const items = this.buildItems(data.items)

    return this.invoiceRepo.runInTransaction(() => {
      const nextNumber = this.settingsRepo.nextCounter(INVOICE_COUNTER_KEY)
      const invoiceNumber = this.invoiceRepo.generateInvoiceNumber(nextNumber)
      return this.invoiceRepo.create(data, invoiceNumber, owner.id, items)
    })
  }

  delete(id: number): void {
    if (!this.invoiceRepo.findById(id)) {
      throw new Error('Invoice not found')
    }
    // Future phase: refuse to delete when the invoice has payments or stock-linked
    // movements against it. For now the invoice is deleted outright (items cascade).
    this.invoiceRepo.delete(id)
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