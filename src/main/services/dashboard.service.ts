import { InvoiceRepository } from '../repositories/invoice.repository'
import { ProductRepository } from '../repositories/product.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { PaymentRepository } from '../repositories/payment.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import type { DashboardOverview } from '@shared/types/dashboard'
import type { ProductWithStock } from '@shared/types/inventory'
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

    const products = this.productRepo.findActive()
    const quantities = this.inventoryRepo.getCurrentQuantities(products.map((p) => p.id))
    const lowStockItems: ProductWithStock[] = []
    let productsLowStock = 0
    let productsOutOfStock = 0
    for (const p of products) {
      const currentStock = quantities.get(p.id) ?? 0
      const summary: ProductWithStock = {
        ...p,
        currentStock,
        isLowStock: p.reorderLevel > 0 && currentStock > 0 && currentStock <= p.reorderLevel,
        isOutOfStock: currentStock <= 0,
      }
      if (summary.isLowStock) productsLowStock += 1
      if (summary.isOutOfStock) productsOutOfStock += 1
      if (summary.isLowStock || summary.isOutOfStock) lowStockItems.push(summary)
    }
    lowStockItems.sort((a, b) => a.currentStock - b.currentStock)

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
        customersActive: customers.filter((c) => c.isActive === 1).length,
        products: products.length,
        productsLowStock,
        productsOutOfStock,
      },
      recentInvoices: this.invoiceRepo.findAllWithCustomer().slice(0, 5),
      recentPayments: this.paymentRepo.findAllWithDetails().slice(0, 5),
      lowStockItems,
    }
  }
}