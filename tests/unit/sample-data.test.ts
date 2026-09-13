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
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProjectOwnerService } from '../../src/main/services/project-owner.service'
import { BrokerService } from '../../src/main/services/broker.service'
import { SettingsService } from '../../src/main/services/settings.service'
import { localDate } from '../../src/shared/date'
import { useTestDatabase, routeIdFor } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

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
  const invoiceService = new InvoiceService()
  const ownerService = new ProjectOwnerService()
  const brokerService = new BrokerService()
  const settingsService = new SettingsService()

  const today = localDate()
  const d1 = today
  const d2 = shiftIsoDate(today, -1)
  const d3 = shiftIsoDate(today, -2)

  // ---- Project owner & bookers ----
  const majid = ownerService.create({ name: 'Majid Zia Motors', phone: '0300-1234567', address: 'Main Bazaar, Multan' })
  const bashir = brokerService.create({ name: 'Bashir Ahmad', phone: '0322-1112223' })
  const rafiq = brokerService.create({ name: 'Rafiq Sons', phone: '0333-4445556' })

  // ---- Products (wholesale parts; prices in paisa 10000 = Rs. 100.00) ----
  const market = productService.create({ name: 'Market Bearings', rate: 10000, boxesPerCarton: 12 })
  const axle = productService.create({ name: 'Axle Bearing 6204', rate: 65000, boxesPerCarton: 10 })
  const rings = productService.create({ name: 'Piston Rings Set', rate: 80000, boxesPerCarton: 8 })
  const gasket = productService.create({ name: 'Gasket Kit', rate: 45000, boxesPerCarton: 6 })
  const valve = productService.create({ name: 'Valve Spring', rate: 15000, boxesPerCarton: 20 })
  const clutch = productService.create({ name: 'Clutch Plate 240mm', rate: 320000, boxesPerCarton: 5 })

  // ---- Customers spread across the six delivery routes ----
  const routes = ['Monday', 'Tuesday', 'Wednesday', 'Thursday']
  const bilal = customerService.create({ code: 'MK-001', shopName: 'Bilal Auto Shop', ownerName: 'Bilal', phone: '0322-0000001', address: 'Liaquat Road', routeId: routeIdFor(routes[0]) })
  const wazir = customerService.create({ code: 'MK-002', shopName: 'Wazir & Sons', ownerName: 'Wazir Ahmad', phone: '0322-0000002', address: 'Bokhari Market', routeId: routeIdFor(routes[0]) })
  const emerald = customerService.create({ code: 'WK-001', shopName: 'Emerald Parts', ownerName: 'Imran', phone: '0322-0000003', address: 'Water Pump Chowk', routeId: routeIdFor(routes[1]) })
  const metro = customerService.create({ code: 'WK-002', shopName: 'Metro Auto', ownerName: 'Metro Group', phone: '0322-0000004', address: 'Canal Road', routeId: routeIdFor(routes[2]) })
  const shahzad = customerService.create({ code: 'TH-001', shopName: 'Shahzad Spares', ownerName: 'Shahzad', phone: '0322-0000005', address: 'Rice Market', routeId: routeIdFor(routes[3]) })

  // ---- Invoice description used at the bottom of the printed sheet ----
  settingsService.set(
    'invoice_description',
    'Goods once sold will not be taken back.<br>Payment due within 7 days.<br>Thank you for your business.',
    'richtext'
  )

  // ---- Invoices ----
  const base = (customerId: number): Omit<CreateInvoiceDTO, 'items' | 'brokerId'> => ({
    customerId,
    date: d2,
    filerStatus: 'filer',
    tax: null,
  })

  // INV-1 Bilal: market bearings + axle bearings, 5 cartons + 6 loose boxes.
  //   10000*5 + 10000*6/12 = 55000 ; 65000*2 = 130000 → subtotal 185000
  const invA = invoiceService.create({
    ...base(bilal.id),
    brokerId: bashir.id,
    date: d1,
    items: [
      { productId: market.id, rate: 10000, cartonCount: 5, boxCount: 6 },
      { productId: axle.id, rate: 65000, cartonCount: 2, boxCount: 0 },
    ],
  })
  // INV-2 Wazir: piston rings + clutch plate.
  const invB = invoiceService.create({
    ...base(wazir.id),
    brokerId: rafiq.id,
    date: d2,
    items: [
      { productId: rings.id, rate: 80000, cartonCount: 2, boxCount: 0 },
      { productId: clutch.id, rate: 320000, cartonCount: 1, boxCount: 0 },
    ],
  })
  // INV-3 Emerald: gasket kits with 3 loose boxes of 6/carton.
  const invC = invoiceService.create({
    ...base(emerald.id),
    brokerId: bashir.id,
    date: d3,
    items: [{ productId: gasket.id, rate: 45000, cartonCount: 0, boxCount: 3 }],
  })
  // INV-4 Metro: valve springs, one rate held exactly at the minimum.
  const invD = invoiceService.create({
    ...base(metro.id),
    brokerId: rafiq.id,
    items: [{ productId: valve.id, rate: 15000, cartonCount: 4, boxCount: 0 }],
  })

  // ---- Self checks: the seeded data must be internally consistent ----
  expect(productService.list()).toHaveLength(6)
  expect(customerService.list()).toHaveLength(5)
  expect(ownerService.list()).toHaveLength(1)
  expect(brokerService.list()).toHaveLength(2)
  expect(invoiceService.count()).toBe(4)
  expect(settingsService.getValue('invoice_description')).toContain('Payment due')

  expect(invA.invoiceNumber).toBe('INV-000001')
  expect(invA.subtotal).toBe(185000)
  expect(invB.subtotal).toBe(480000)
  expect(invC.subtotal).toBe(22500)
  expect(invD.subtotal).toBe(60000)

  const detailsB = invoiceService.getWithDetails(invB.id)!
  expect(detailsB.invoice.items).toHaveLength(2)
  expect(detailsB.invoice.items[0].productName).toBe('Piston Rings Set')
  expect(detailsB.invoice.items[0].amount).toBe(160000)
  expect(detailsB.customer!.code).toBe('MK-002')
  expect(detailsB.owner!.name).toBe('Majid Zia Motors')
  expect(detailsB.broker!.name).toBe('Rafiq Sons')

  // ---- Optional: write the finished database out as a portable sample ----
  const out = process.env.SAMPLE_DATA_OUT
  if (out) {
    closeDatabase()
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.copyFileSync(path.join(dir(), 'majidzia.db'), out)
  }
})