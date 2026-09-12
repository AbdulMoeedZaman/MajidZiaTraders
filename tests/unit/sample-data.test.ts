/**
 * Seeds a realistic MZTraders sample dataset through the real services.
 * - Runs as an ordinary (self-verifying) unit test that checks the data is internally consistent.
 * - When SAMPLE_DATA_OUT is set, it writes the finished database there too, so
 *   `npm run sample-data` can produce sample-data/mztraders-sample.db for restoring in the app.
 */
import fs from 'fs'
import path from 'path'
import { expect, it } from 'vitest'
import { closeDatabase } from '../../src/main/database/connection'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { InventoryService } from '../../src/main/services/inventory.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { PaymentService } from '../../src/main/services/payment.service'
import { RestockService } from '../../src/main/services/restock.service'
import { StockAdjustmentService } from '../../src/main/services/stock-adjustment.service'
import { localDate } from '../../src/shared/date'
import { useTestDatabase, line } from './helpers'

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const { dir } = useTestDatabase()

it('seeds a realistic MZTraders sample dataset and (optionally) writes the portable DB', () => {
  const productService = new ProductService()
  const customerService = new CustomerService()
  const inventoryService = new InventoryService()
  const invoiceService = new InvoiceService()
  const paymentService = new PaymentService()
  const restockService = new RestockService()
  const adjustmentService = new StockAdjustmentService()

  const today = localDate()
  const d1 = today
  const d2 = shiftIsoDate(today, -1)
  const d3 = shiftIsoDate(today, -2)
  const d4 = shiftIsoDate(today, -3)
  const d5 = shiftIsoDate(today, -4)
  const d8 = shiftIsoDate(today, -8)

  // ---- Products (wholesale groceries, prices in paisa: 32000 = Rs. 320.00) ----
  const basmati = productService.create({ sku: 'BAS-001', name: 'Basmati Rice 5kg', minSellingPrice: 28000, sellingPrice: 32000 })
  const sugar = productService.create({ sku: 'SUG-001', name: 'White Sugar 1kg', minSellingPrice: 15500, sellingPrice: 17000 })
  const oil = productService.create({ sku: 'OIL-001', name: 'Cooking Oil 5L', minSellingPrice: 24500, sellingPrice: 27000 })
  const tea = productService.create({ sku: 'TEA-001', name: 'Black Tea 250g', minSellingPrice: 6500, sellingPrice: 7500 })
  const soap = productService.create({ sku: 'SPL-001', name: 'Washing Soap', minSellingPrice: 9500, sellingPrice: 11000 })
  const flour = productService.create({ sku: 'FLR-001', name: 'Wheat Flour 10kg', minSellingPrice: 32000, sellingPrice: 35000 })
  const ghee = productService.create({ sku: 'GHE-001', name: 'Desi Ghee 1kg', minSellingPrice: 18200, sellingPrice: 20000 })
  const biscuit = productService.create({ sku: 'BIS-001', name: 'Assorted Biscuits', minSellingPrice: 8900, sellingPrice: 9800 })

  // ---- Opening stock (pieces in hand at the start) ----
  const opening: Array<[typeof basmati, number]> = [
    [basmati, 1440],
    [sugar, 600],
    [oil, 180],
    [tea, 480],
    [soap, 750],
    [flour, 300],
    [ghee, 480],
    [biscuit, 400],
  ]
  for (const [product, quantity] of opening) {
    inventoryService.setOpeningStock({ productId: product.id, quantity })
  }

  // ---- Customers ----
  const abdul = customerService.create({ name: 'Abdul Rehman Store', address: 'Shop 4, Saddar, Karachi' })
  const faisal = customerService.create({ name: 'Faisal Traders', address: 'Ghall Mandi, Faisalabad' })
  const madina = customerService.create({ name: 'Al-Madina General Store', address: 'University Road, Peshawar' })
  const zainab = customerService.create({ name: 'Zainab Suppliers', address: 'Sanda Road, Lahore' })
  const noor = customerService.create({ name: 'Noor Bakery', address: 'G-9 Markaz, Islamabad' })

  // ---- Restocks ----
  // Direct stock-in (immediately received) raises oil cost basis to 24500.
  restockService.addStock({ productId: oil.id, quantity: 30, costPerUnit: 24500, supplierName: 'Habib Oil Mills' })
  // A purchase order received later; new cost basis for sugar = 16000/piece.
  const sugarRestock = restockService.create({
    supplierName: 'Punjab Sugar Mills',
    date: d2,
    notes: 'Monthly sugar order',
    items: [{ productId: sugar.id, qtyCartons: 10, piecesPerCarton: 24, netSalesValueExcl: 3840000, tradeDiscountValue: 0 }],
  })
  restockService.markReceived(sugarRestock.id)

  // ---- Invoices ----
  // INV-1 Faisal: rice + oil, Rs. 20.00 discount. Large outstanding.
  const invA = invoiceService.create({
    customerId: faisal.id,
    date: d1,
    dueDate: shiftIsoDate(d1, 14),
    discount: 2000,
    items: [line(basmati, 10), line(oil, 6)],
  })
  // INV-2 Abdul: tea, partially paid.
  const invB = invoiceService.create({ customerId: abdul.id, date: d2, items: [line(tea, 20)] })
  // INV-3 Zainab: flour + ghee, paid in full.
  const invC = invoiceService.create({ customerId: zainab.id, date: d5, items: [line(flour, 6), line(ghee, 10)] })
  // INV-4 Noor: sugar + soap, due date has passed -> overdue.
  const invD = invoiceService.create({
    customerId: noor.id,
    date: d8,
    dueDate: shiftIsoDate(today, -6),
    items: [line(sugar, 10), line(soap, 12)],
  })
  // INV-5 Al-Madina: biscuits, then cancelled (stock restored).
  const invE = invoiceService.create({ customerId: madina.id, date: d4, items: [line(biscuit, 15)] })
  invoiceService.cancel(invE.id)
  // INV-6 Abdul: sugar (customer credit from a later payment applies to this debt).
  const invG = invoiceService.create({ customerId: abdul.id, date: d1, items: [line(sugar, 5)] })
  // INV-7 Al-Madina: soap, left unpaid.
  const invF = invoiceService.create({ customerId: madina.id, date: d1, items: [line(soap, 8)] })

  // ---- Payments ----
  paymentService.create({ customerId: abdul.id, invoiceId: invB.id, amount: 50000, method: 'cash', paymentDate: d2 })
  paymentService.create({ customerId: zainab.id, invoiceId: invC.id, amount: 410000, method: 'bank_transfer', paymentDate: d5 })
  paymentService.create({ customerId: abdul.id, amount: 20000, method: 'cash', paymentDate: d1, notes: 'Advance against next order' })

  // ---- Stock adjustment ----
  adjustmentService.create({ productId: soap.id, type: 'damage', quantityAdjustment: -5, reason: 'Two boxes damaged in transit' })
  void d3

  // ---- Self checks: the seeded data must be internally consistent ----
  expect(productService.list()).toHaveLength(8)
  expect(customerService.list()).toHaveLength(5)
  expect(invoiceService.count()).toBe(7)
  expect(restockService.count()).toBe(2)
  expect(adjustmentService.count()).toBe(1)

  // Stock = opening + restocks + adjustments - sales (cancelled invoice nets out).
  const stock = (id: number) => inventoryService.getCurrentQuantity(id)
  expect(stock(basmati.id)).toBe(1430)
  expect(stock(sugar.id)).toBe(825)
  expect(stock(oil.id)).toBe(204)
  expect(stock(tea.id)).toBe(460)
  expect(stock(soap.id)).toBe(725)
  expect(stock(flour.id)).toBe(294)
  expect(stock(ghee.id)).toBe(470)
  expect(stock(biscuit.id)).toBe(400)

  // Sugar restock at 16000/piece became the new cost basis.
  expect(productService.getById(sugar.id)!.minSellingPrice).toBe(16000)

  // INV-1: Rs. 20.00 discount and a profit of sales minus cost.
  expect(invA.total).toBe(480000)
  expect(invA.discount).toBe(2000)
  expect(invA.totalProfit).toBe(53000)

  // Oldest unpaid invoice is overdue once the list is refreshed.
  const overdue = invoiceService.list().find((i) => i.id === invD.id)!
  expect(overdue.status).toBe('overdue')

  // Customer outstanding: debits (invoices) minus credits (payments), cancelled invoices count as nothing.
  expect(customerService.getWithBalance(faisal.id)!.outstanding).toBe(480000)
  expect(customerService.getWithBalance(zainab.id)!.outstanding).toBe(0)
  expect(customerService.getWithBalance(noor.id)!.outstanding).toBe(302000)
  expect(customerService.getWithBalance(madina.id)!.outstanding).toBe(88000)
  expect(customerService.getWithBalance(abdul.id)!.outstanding).toBe(165000)

  // ---- Optional: write the finished database out as a portable sample ----
  const out = process.env.SAMPLE_DATA_OUT
  if (out) {
    closeDatabase()
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.copyFileSync(path.join(dir(), 'inventory.db'), out)
  }
})