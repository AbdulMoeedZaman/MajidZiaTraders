import { DashboardRepository } from '../repositories/dashboard.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { assertIsoDate } from '@shared/date'
import type { CustomerProfit, DashboardSummary } from '@shared/types/dashboard'

const RECENT_LIMIT = 5

/**
 * Aggregates the mix behind the dashboard:
 *  - profit = billed amount minus the "actual" (minimum) product price, per customer;
 *  - remaining stock = current running balance per product;
 *  - invoices created inside the date range;
 *  - short recent lists of products, invoices and customers.
 */
export class DashboardService {
  private dashboardRepo = new DashboardRepository()
  private invoiceRepo = new InvoiceRepository()

  summary(start: string, end: string): DashboardSummary {
    assertIsoDate(start, 'Start date')
    assertIsoDate(end, 'End date')

    const invoiceList = this.invoiceRepo.findAllWithCustomer({ from: start, to: end })

    const map = new Map<number, CustomerProfit & { invoiceIds: Set<number> }>()
    let profitTotal = 0

    for (const line of this.dashboardRepo.profitLines(start, end)) {
      const costBasis =
        line.minRate * line.cartonCount +
        Math.round((line.minRate * line.boxCount) / Math.max(1, line.boxesPerCarton))
      const profit = line.amount - costBasis
      profitTotal += profit

      const entry = map.get(line.customerId)
      if (entry) {
        entry.profit += profit
        entry.invoiceIds.add(line.invoiceId)
      } else {
        map.set(line.customerId, {
          customerId: line.customerId,
          customerName: line.customerName,
          profit,
          invoices: 0,
          invoiceIds: new Set([line.invoiceId]),
        })
      }
    }

    const perCustomer = [...map.values()]
      .map(({ invoiceIds, ...rest }) => ({ ...rest, invoices: invoiceIds.size }))
      .filter((c) => c.profit !== 0)
      .sort((a, b) => b.profit - a.profit)

    const perProduct = this.dashboardRepo.remainingPerProduct()
    const stockTotal = perProduct.reduce((sum, p) => sum + p.remaining, 0)

    return {
      range: { start, end },
      profit: { total: profitTotal, perCustomer },
      stock: { total: stockTotal, perProduct },
      invoices: { total: invoiceList.length, list: invoiceList },
      recent: {
        products: this.dashboardRepo.recentProducts(RECENT_LIMIT),
        invoices: this.invoiceRepo.findAllWithCustomer({ limit: RECENT_LIMIT }),
        customers: this.dashboardRepo.recentCustomers(RECENT_LIMIT),
      },
    }
  }
}