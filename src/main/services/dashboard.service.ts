import { DashboardRepository } from '../repositories/dashboard.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { assertIsoDate, localDate } from '@shared/date'
import { invoiceDue } from '@shared/types/invoice'
import type { CustomerProfit, DashboardSummary } from '@shared/types/dashboard'
import type { ExpenseDaySummary } from '@shared/types/expense'

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
        Math.round((line.minRate * line.boxCount) / Math.max(1, line.piecesPerCarton))
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
          sales: 0,
          invoiceIds: new Set([line.invoiceId]),
        })
      }
    }

    const salesByCustomer = new Map<number, number>()
    for (const invoice of invoiceList) {
      if (invoice.status === 'cancelled') continue
      salesByCustomer.set(
        invoice.customerId,
        (salesByCustomer.get(invoice.customerId) ?? 0) + invoiceDue(invoice)
      )
    }

    const perCustomer = [...map.values()]
      .map(({ invoiceIds, ...rest }) => ({
        ...rest,
        invoices: invoiceIds.size,
        sales: salesByCustomer.get(rest.customerId) ?? 0,
      }))
      .filter((c) => c.profit !== 0)
      .sort((a, b) => b.profit - a.profit)

    const rawPerProduct = this.dashboardRepo.remainingPerProduct()
    const perProduct = rawPerProduct
      .map((p) => ({
        ...p,
        value: Math.round((p.remaining * p.rate) / Math.max(1, p.piecesPerCarton)),
      }))
      .sort((a, b) => b.value - a.value || a.productName.localeCompare(b.productName))
    const stockTotal = perProduct.reduce((sum, p) => sum + p.remaining, 0)
    const stockTotalValue = perProduct.reduce((sum, p) => sum + p.value, 0)

    const today = localDate()
    const todayItems = this.dashboardRepo.expensesFrom(today)
    const todayTotal = todayItems.reduce((sum, e) => sum + e.price, 0)
    const dispatchedToday = this.dashboardRepo.dispatchedToday(today)

    const rangeExpenses = this.dashboardRepo.expensesInRange(start, end)
    const byDay = new Map<string, ExpenseDaySummary>()
    for (const expense of rangeExpenses) {
      const day = byDay.get(expense.date)
      if (day) {
        day.total += expense.price
        day.items.push(expense)
      } else {
        byDay.set(expense.date, { date: expense.date, total: expense.price, items: [expense] })
      }
    }
    const expenseDays = [...byDay.values()]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map((day) => ({ ...day, items: [...day.items] }))

    const perCustomerOwed = this.dashboardRepo.outstandingByCustomer()
    const payments = this.dashboardRepo.paymentsInRange(start, end)

    return {
      range: { start, end },
      profit: { total: profitTotal, perCustomer },
      stock: { total: stockTotal, perProduct, totalValue: stockTotalValue },
      invoices: {
        total: invoiceList.length,
        list: invoiceList,
        dispatchedToday,
      },
      expenses: {
        todayTotal,
        total: expenseDays.reduce((sum, d) => sum + d.total, 0),
        byDay: expenseDays,
      },
      owed: {
        total: perCustomerOwed.reduce((sum, c) => sum + c.owed, 0),
        perCustomer: perCustomerOwed,
      },
      cashFlow: {
        inward: {
          total: payments.reduce((sum, p) => sum + p.amount, 0),
          payments,
        },
        outward: {
          total: rangeExpenses.reduce((sum, e) => sum + e.price, 0),
          expenses: rangeExpenses,
        },
      },
      recent: {
        products: this.dashboardRepo.recentProducts(RECENT_LIMIT),
        invoices: this.invoiceRepo.findAllWithCustomer({ limit: RECENT_LIMIT }),
        customers: this.dashboardRepo.recentCustomers(RECENT_LIMIT),
      },
    }
  }
}