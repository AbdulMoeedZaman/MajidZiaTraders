import { InvoiceRepository } from '../repositories/invoice.repository'
import { ProductRepository } from '../repositories/product.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { PaymentRepository } from '../repositories/payment.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import type { DashboardOverview } from '@shared/types/dashboard'
import { localDate } from '@shared/date'

export class DashboardService {
  private invoiceRepo = new InvoiceRepository()
  private productRepo = new ProductRepository()
  private customerRepo = new CustomerRepository()
  private ledgerRepo = new CustomerLedgerRepository()
  private paymentRepo = new PaymentRepository()
  private inventoryRepo = new InventoryRepository()

  getOverview(): DashboardOverview {
    const today = localDate()

    this.invoiceRepo.markOverdue(today)

    const todaySummary = this.invoiceRepo.summarizePeriod(today, today)

    const customers = this.customerRepo.findAll()
    const outstandingBalance = this.ledgerRepo.getTotalPositiveBalance()

    const products = this.productRepo.findAll()
    const quantities = this.inventoryRepo.getCurrentQuantities(products.map((p) => p.id))
    let productsOutOfStock = 0
    for (const p of products) {
      const currentStock = quantities.get(p.id) ?? 0
      if (currentStock <= 0) productsOutOfStock += 1
    }

    return {
      date: today,
      today: {
        count: todaySummary.count,
        revenue: todaySummary.revenue,
        cost: todaySummary.cost,
        profit: todaySummary.profit,
      },
      outstandingBalance,
      totals: {
        customers: customers.length,
        products: products.length,
        productsOutOfStock,
      },
      recentInvoices: this.invoiceRepo.findAllWithCustomer({ limit: 5 }),
      recentPayments: this.paymentRepo.findAllWithDetails(undefined, undefined, 5),
    }
  }
}