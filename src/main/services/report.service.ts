import { InvoiceRepository } from '../repositories/invoice.repository'
import { ProductRepository } from '../repositories/product.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { PaymentRepository } from '../repositories/payment.repository'
import { InventoryRepository } from '../repositories/inventory.repository'
import { RestockRepository } from '../repositories/restock.repository'
import type {
  SalesReport,
  SalesReportItem,
  InventoryReport,
  InventoryReportItem,
  CustomerReport,
  ProfitLossReport,
  PaymentsReport,
  RestocksReport,
  StockMovementsReport,
  PaymentReportItem,
} from '@shared/types/report'
import { PAYMENT_METHOD_LABELS } from '@shared/types/customer-payment'
import { assertIsoDate } from '@shared/date'

export class ReportService {
  private invoiceRepo = new InvoiceRepository()
  private productRepo = new ProductRepository()
  private customerRepo = new CustomerRepository()
  private ledgerRepo = new CustomerLedgerRepository()
  private paymentRepo = new PaymentRepository()
  private inventoryRepo = new InventoryRepository()
  private restockRepo = new RestockRepository()

  getSalesReport(from: string, to: string): SalesReport {
    this.assertPeriod(from, to)
    const summary = this.invoiceRepo.summarizePeriod(from, to)
    const rows = this.invoiceRepo.findItemsForPeriod(from, to)

    const items: SalesReportItem[] = rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      quantitySold: r.quantitySold,
      revenue: r.revenue,
      cost: r.cost,
      profit: r.profit,
    }))

    return {
      period: { from, to },
      totalRevenue: summary.revenue,
      totalCost: summary.cost,
      totalProfit: summary.profit,
      totalInvoices: summary.count,
      totalCustomers: summary.customers,
      items,
    }
  }

  getProfitLossReport(from: string, to: string): ProfitLossReport {
    this.assertPeriod(from, to)
    const summary = this.invoiceRepo.summarizePeriod(from, to)
    const gross = summary.revenue - summary.cost
    const expenses = 0
    const margin = summary.revenue > 0 ? Math.round((gross / summary.revenue) * 10000) / 100 : 0

    return {
      period: { from, to },
      totalRevenue: summary.revenue,
      totalCostOfGoods: summary.cost,
      grossProfit: gross,
      expenses,
      netProfit: gross - expenses,
      profitMargin: margin,
    }
  }

  getInventoryReport(): InventoryReport {
    const products = this.productRepo.findActive()
    const quantities = this.inventoryRepo.getCurrentQuantities(products.map((p) => p.id))

    const items: InventoryReportItem[] = products.map((p) => {
      const currentQuantity = quantities.get(p.id) ?? 0
      return {
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        currentQuantity,
        price: p.sellingPrice,
        totalValue: currentQuantity * p.sellingPrice,
        costValue: currentQuantity * p.baseCostPrice,
      }
    })

    const totalValue = items.reduce((sum, item) => sum + item.costValue, 0)
    const lowStockCount = items.filter((item) => {
      const product = products.find((p) => p.id === item.productId)
      return product && item.currentQuantity > 0 && product.reorderLevel > 0 && item.currentQuantity <= product.reorderLevel
    }).length

    return {
      generatedAt: new Date().toISOString(),
      totalProducts: products.length,
      totalValue,
      lowStockCount,
      items,
    }
  }

  getCustomerReport(from: string, to: string): CustomerReport {
    this.assertPeriod(from, to)
    const customers = this.customerRepo.findAll()
    const invoiceTotals = new Map<number, number>()
    for (const row of this.invoiceRepo.sumByCustomer(from, to)) invoiceTotals.set(row.customerId, row.total)
    const paymentTotals = new Map<number, number>()
    for (const row of this.paymentRepo.sumByCustomer(from, to)) paymentTotals.set(row.customerId, row.total)
    const allInvoiceTotals = new Map<number, number>()
    for (const row of this.invoiceRepo.sumByCustomer()) allInvoiceTotals.set(row.customerId, row.total)
    const allPaymentTotals = new Map<number, number>()
    for (const row of this.paymentRepo.sumByCustomer()) allPaymentTotals.set(row.customerId, row.total)

    const ledgerTotals = this.ledgerRepo.getTotalsByCustomer()

    const items = customers.map((c) => {
      const totals = ledgerTotals.get(c.id) ?? { totalDebit: 0, totalCredit: 0 }
      const balance = totals.totalDebit - totals.totalCredit
      return {
        customerId: c.id,
        customerName: c.name,
        periodPurchases: invoiceTotals.get(c.id) ?? 0,
        periodPayments: paymentTotals.get(c.id) ?? 0,
        totalPurchases: allInvoiceTotals.get(c.id) ?? 0,
        totalPayments: allPaymentTotals.get(c.id) ?? 0,
        outstandingBalance: balance > 0 ? balance : 0,
      }
    })

    return {
      period: { from, to },
      totalCustomers: customers.filter((c) => invoiceTotals.has(c.id) || paymentTotals.has(c.id)).length,
      totalPurchases: items.reduce((s, i) => s + i.periodPurchases, 0),
      totalPayments: items.reduce((s, i) => s + i.periodPayments, 0),
      totalOutstanding: items.reduce((s, i) => s + i.outstandingBalance, 0),
      items: items.filter((i) => i.periodPurchases > 0 || i.periodPayments > 0 || i.outstandingBalance > 0),
    }
  }

  getPaymentsReport(from: string, to: string): PaymentsReport {
    this.assertPeriod(from, to)
    const rows = this.paymentRepo.findAllWithDetails(from, to)

    const items: PaymentReportItem[] = rows.map((r) => ({
      paymentId: r.id,
      date: r.paymentDate,
      customerId: r.customerId,
      customerName: r.customerName,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      amount: r.amount,
      method: r.method,
      reference: r.reference,
    }))

    const byMethodMap = new Map<string, { method: string; amount: number; count: number }>()
    for (const item of items) {
      const label = PAYMENT_METHOD_LABELS[item.method] ?? item.method
      const entry = byMethodMap.get(label) ?? { method: label, amount: 0, count: 0 }
      entry.amount += item.amount
      entry.count += 1
      byMethodMap.set(label, entry)
    }

    return {
      period: { from, to },
      totalAmount: items.reduce((s, r) => s + r.amount, 0),
      totalCount: items.length,
      byMethod: [...byMethodMap.values()].sort((a, b) => b.amount - a.amount),
      items,
    }
  }

  getRestocksReport(from: string, to: string): RestocksReport {
    this.assertPeriod(from, to)
    const rows = this.restockRepo.findRangeWithCounts(from, to)
    return {
      period: { from, to },
      totalCost: rows.reduce((s, r) => s + r.totalCost, 0),
      receivedCost: rows.filter((r) => r.status === 'received').reduce((s, r) => s + r.totalCost, 0),
      totalCount: rows.length,
      receivedCount: rows.filter((r) => r.status === 'received').length,
      items: rows,
    }
  }

  getStockMovementsReport(from: string, to: string): StockMovementsReport {
    this.assertPeriod(from, to)
    const rows = this.inventoryRepo.findMovements(from, to)
    const inbound = rows.filter((r) => r.quantity > 0).reduce((s, r) => s + r.quantity, 0)
    const outbound = rows.filter((r) => r.quantity < 0).reduce((s, r) => s + r.quantity, 0)
    const inboundValue = rows
      .filter((r) => r.quantity > 0 && r.cost != null)
      .reduce((s, r) => s + (r.cost ?? 0) * r.quantity, 0)

    return {
      period: { from, to },
      inbound,
      inboundValue,
      outbound: Math.abs(outbound),
      items: rows,
    }
  }

  private assertPeriod(from: string, to: string): void {
    assertIsoDate(from, 'From date')
    assertIsoDate(to, 'To date')
    if (from > to) throw new Error('From date cannot be after to date')
  }
}