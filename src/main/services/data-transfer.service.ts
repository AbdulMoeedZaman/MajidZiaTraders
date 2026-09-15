import fs from 'fs'
import path from 'path'
import { parseCsv, toCsvText, type CsvValue } from '@shared/csv'
import type {
  DataTransferEntity,
  DataTransferFile,
  DataTransferResult,
  DataTransferRowResult,
} from '@shared/types/data-transfer'
import type { FilerStatus } from '@shared/types/invoice'
import { assertIsoDate } from '@shared/date'
import { ProductService } from './product.service'
import { CustomerService } from './customer.service'
import { InvoiceService } from './invoice.service'
import { ProductRepository } from '../repositories/product.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { RouteRepository } from '../repositories/route.repository'
import { BrokerRepository } from '../repositories/broker.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { SettingsRepository } from '../repositories/settings.repository'
import type { Route } from '@shared/types/route'
import type { CreateInvoiceItemDTO } from '@shared/types/invoice'

interface ColumnSpec {
  key: string
  label: string
  required: boolean
}

const COLUMNS: Record<DataTransferEntity, ColumnSpec[]> = {
  products: [
    { key: 'name', label: 'Name', required: true },
    { key: 'rate', label: 'Minimum rate (Rs.)', required: true },
    { key: 'salesPrice', label: 'Sales price (Rs.)', required: false },
    { key: 'piecesPerCarton', label: 'Pieces per carton', required: false },
  ],
  customers: [
    { key: 'code', label: 'Code', required: true },
    { key: 'shopName', label: 'Shop name', required: false },
    { key: 'ownerName', label: 'Owner name', required: false },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'address', label: 'Address', required: false },
    { key: 'route', label: 'Route', required: true },
  ],
  invoices: [
    { key: 'invoiceNumber', label: 'Invoice number', required: true },
    { key: 'customer', label: 'Customer', required: true },
    { key: 'broker', label: 'Booker', required: true },
    { key: 'date', label: 'Date', required: true },
    { key: 'filerStatus', label: 'Filer status', required: false },
    { key: 'tax', label: 'Tax (Rs.)', required: false },
    { key: 'product', label: 'Product', required: true },
    { key: 'rate', label: 'Rate (Rs.)', required: true },
    { key: 'quantity', label: 'Quantity (pcs)', required: true },
  ],
}

const FILES: Record<DataTransferEntity, string> = {
  products: 'products.csv',
  customers: 'customers.csv',
  invoices: 'invoices.csv',
}

const INVOICE_COUNTER_KEY = 'invoice_next_number'

/** Lower-cases a header, collapses whitespace and strips the required `*` marker. */
function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/\*/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export class DataTransferService {
  private productService = new ProductService()
  private customerService = new CustomerService()
  private invoiceService = new InvoiceService()
  private productRepo = new ProductRepository()
  private customerRepo = new CustomerRepository()
  private routeRepo = new RouteRepository()
  private brokerRepo = new BrokerRepository()
  private invoiceRepo = new InvoiceRepository()
  private settingsRepo = new SettingsRepository()

  template(entity: DataTransferEntity): DataTransferFile {
    const header = COLUMNS[entity].map((col) => (col.required ? `${col.label}*` : col.label))
    return { entity, filename: FILES[entity], csv: '\uFEFF' + toCsvText([header]) }
  }

  export(entity: DataTransferEntity): DataTransferFile {
    const header = COLUMNS[entity].map((col) => col.label)
    let rows: CsvValue[][] = [header]

    if (entity === 'products') {
      for (const product of this.productRepo.findAll()) {
        rows.push([
          product.name,
          this.money(product.rate),
          product.salesPrice != null ? this.money(product.salesPrice) : '',
          product.piecesPerCarton,
        ])
      }
    } else if (entity === 'customers') {
      for (const customer of this.customerRepo.findAllWithRoute()) {
        rows.push([
          customer.code,
          customer.shopName,
          customer.ownerName,
          customer.phone ?? '',
          customer.address ?? '',
          customer.routeName,
        ])
      }
    } else {
      const brokerNames = new Map(this.brokerRepo.findAll().map((b) => [b.id, b.name]))
      for (const invoice of this.invoiceRepo.findAllWithCustomer()) {
        for (const item of this.invoiceRepo.getItems(invoice.id)) {
          rows.push([
            invoice.invoiceNumber,
            invoice.customerCode,
            brokerNames.get(invoice.brokerId) ?? '',
            invoice.date,
            invoice.filerStatus,
            invoice.tax != null ? this.money(invoice.tax) : '',
            item.productName,
            this.money(item.rate),
            item.cartonCount * item.piecesPerCarton + item.boxCount,
          ])
        }
      }
    }

    return { entity, filename: FILES[entity], csv: '\uFEFF' + toCsvText(rows) }
  }

  import(entity: DataTransferEntity, filePath: string): DataTransferResult {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
    const rows = parseCsv(text)
    if (rows.length < 2) {
      throw new Error('CSV has no data rows')
    }

    const headerIndex = this.buildHeaderIndex(rows[0], entity)
    const result: DataTransferResult = {
      entity,
      file: path.basename(filePath),
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      rows: [],
    }

    if (entity === 'products') this.importProducts(rows, headerIndex, result)
    else if (entity === 'customers') this.importCustomers(rows, headerIndex, result)
    else this.importInvoices(rows, headerIndex, result)

    return result
  }

  // -------------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------------

  private importProducts(
    rows: string[][],
    headerIndex: Map<string, number>,
    result: DataTransferResult
  ): void {
    for (let i = 1; i < rows.length; i++) {
      if (this.isBlank(rows[i])) continue
      try {
        const name = this.cell(rows[i], headerIndex, 'name').trim()
        if (!name) throw new Error('Product name is required')
        const rate = this.requiredMoney(this.cell(rows[i], headerIndex, 'rate').trim(), 'Minimum rate (Rs.)')
        const salesPriceCell = this.cell(rows[i], headerIndex, 'salesPrice').trim()
        const salesPrice = salesPriceCell === '' ? null : this.requiredMoney(salesPriceCell, 'Sales price (Rs.)')
        const piecesCell = this.cell(rows[i], headerIndex, 'piecesPerCarton').trim()
        const piecesPerCarton = piecesCell === '' ? 1 : this.requiredInt(piecesCell, 'Pieces per carton')

        const existing = this.productRepo.findByName(name)
        if (existing) {
          const data: {
            rate: number
            salesPrice: number | null
            piecesPerCarton?: number
          } = { rate, salesPrice }
          // Blank carton size on update means "leave unchanged" so existing
          // histories are not accidentally broken; on create it defaults to 1.
          if (piecesCell !== '') data.piecesPerCarton = piecesPerCarton
          this.productService.update(existing.id, data)
          result.updated++
          result.rows.push({ row: i + 1, status: 'updated' })
        } else {
          this.productService.create({ name, rate, salesPrice, piecesPerCarton })
          result.created++
          result.rows.push({ row: i + 1, status: 'created' })
        }
      } catch (error) {
        this.recordFailure(result, i, error)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------

  private importCustomers(
    rows: string[][],
    headerIndex: Map<string, number>,
    result: DataTransferResult
  ): void {
    for (let i = 1; i < rows.length; i++) {
      if (this.isBlank(rows[i])) continue
      try {
        const code = this.cell(rows[i], headerIndex, 'code').trim()
        if (!code) throw new Error('Customer code is required')
        const shopName = this.cell(rows[i], headerIndex, 'shopName').trim() || undefined
        const ownerName = this.cell(rows[i], headerIndex, 'ownerName').trim() || undefined
        if (!shopName && !ownerName) throw new Error('A customer needs a shop name or an owner name')
        const phone = this.cell(rows[i], headerIndex, 'phone').trim() || null
        const address = this.cell(rows[i], headerIndex, 'address').trim() || null
        const route = this.resolveRoute(this.cell(rows[i], headerIndex, 'route').trim())
        if (!route) {
          throw new Error(`Route "${this.cell(rows[i], headerIndex, 'route').trim()}" not found`)
        }

        const existing = this.customerRepo.findByCode(code)
        if (existing) {
          this.customerService.update(existing.id, {
            shopName,
            ownerName,
            phone,
            address,
            routeId: route.id,
          })
          result.updated++
          result.rows.push({ row: i + 1, status: 'updated' })
        } else {
          this.customerService.create({
            code,
            shopName,
            ownerName,
            phone,
            address,
            routeId: route.id,
          })
          result.created++
          result.rows.push({ row: i + 1, status: 'created' })
        }
      } catch (error) {
        this.recordFailure(result, i, error)
      }
    }
  }

  private resolveRoute(value: string): Route | null {
    const target = value.trim()
    if (!target) return null
    const routes = this.routeRepo.findAll()
    const exact = routes.find((r) => r.name.toLowerCase() === target.toLowerCase())
    if (exact) return exact
    const byDay = routes.find((r) => r.day.toLowerCase() === target.toLowerCase())
    return byDay ?? null
  }

  // -------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------

  private importInvoices(
    rows: string[][],
    headerIndex: Map<string, number>,
    result: DataTransferResult
  ): void {
    const groups = new Map<string, number[]>()
    for (let i = 1; i < rows.length; i++) {
      if (this.isBlank(rows[i])) continue
      const number = this.cell(rows[i], headerIndex, 'invoiceNumber').trim()
      const group = groups.get(number)
      if (group) group.push(i)
      else groups.set(number, [i])
    }

    let highestImported: number | null = null

    for (const [invoiceNumber, groupRows] of groups) {
      if (!invoiceNumber) {
        for (const idx of groupRows) {
          this.recordFailure(result, idx, new Error('Invoice number is required'))
        }
        continue
      }
      if (this.invoiceRepo.findByInvoiceNumber(invoiceNumber)) {
        for (const idx of groupRows) {
          result.skipped++
          result.rows.push({ row: idx + 1, status: 'skipped', reason: `Invoice ${invoiceNumber} already exists` })
        }
        continue
      }

      const first = groupRows[0]
      const customerCode = this.cell(rows[first], headerIndex, 'customer').trim()
      const brokerName = this.cell(rows[first], headerIndex, 'broker').trim()
      const date = this.cell(rows[first], headerIndex, 'date').trim()

      if (!customerCode) {
        this.failGroup(result, groupRows, new Error('Customer code is required'))
        continue
      }
      if (!brokerName) {
        this.failGroup(result, groupRows, new Error('Booker name is required'))
        continue
      }

      const customer = this.customerRepo.findByCode(customerCode)
      if (!customer) {
        this.failGroup(result, groupRows, new Error(`Customer "${customerCode}" not found`))
        continue
      }
      const broker = this.brokerRepo.findByName(brokerName)
      if (!broker) {
        this.failGroup(result, groupRows, new Error(`Booker "${brokerName}" not found`))
        continue
      }

      let filerStatus: FilerStatus = 'filer'
      let tax: number | null | undefined
      try {
        assertIsoDate(date, 'Date')
        const normalized = this.normalizeFiler(this.cell(rows[first], headerIndex, 'filerStatus'))
        if (normalized === null) throw new Error('Filer status must be "filer" or "non filer"')
        filerStatus = normalized
        const taxCell = this.cell(rows[first], headerIndex, 'tax').trim()
        tax = taxCell === '' ? null : this.requiredMoney(taxCell, 'Tax (Rs.)')
      } catch (error) {
        this.failGroup(result, groupRows, error)
        continue
      }

      // Item-level validation first so each failing line is reported exactly.
      const items: CreateInvoiceItemDTO[] = []
      const itemErrors: DataTransferRowResult[] = []
      for (const idx of groupRows) {
        const productName = this.cell(rows[idx], headerIndex, 'product').trim()
        if (!productName) {
          itemErrors.push({ row: idx + 1, status: 'failed', reason: 'Product is required' })
          continue
        }
        const product = this.productRepo.findByName(productName)
        if (!product) {
          itemErrors.push({ row: idx + 1, status: 'failed', reason: `Product "${productName}" not found` })
          continue
        }
        try {
          const rate = this.requiredMoney(this.cell(rows[idx], headerIndex, 'rate').trim(), 'Rate (Rs.)')
          const quantity = this.requiredInt(this.cell(rows[idx], headerIndex, 'quantity').trim(), 'Quantity (pcs)')
          items.push({ productId: product.id, rate, quantity })
        } catch (error) {
          itemErrors.push({ row: idx + 1, status: 'failed', reason: (error as Error).message })
        }
      }

      if (itemErrors.length > 0) {
        result.failed += itemErrors.length
        result.rows.push(...itemErrors)
        for (const idx of groupRows) {
          if (!itemErrors.some((e) => e.row === idx + 1)) {
            result.skipped++
            result.rows.push({
              row: idx + 1,
              status: 'skipped',
              reason: 'Invoice not imported because another line failed',
            })
          }
        }
        continue
      }

      try {
        const invoice = this.invoiceService.create({
          customerId: customer.id,
          brokerId: broker.id,
          date,
          filerStatus,
          tax,
          items,
        })
        if (invoice.invoiceNumber !== invoiceNumber) {
          this.invoiceRepo.renameInvoiceNumber(invoice.id, invoiceNumber)
        }
        const derivedNext = this.deriveNextNumber(invoiceNumber)
        if (derivedNext != null) {
          highestImported = highestImported == null ? derivedNext : Math.max(highestImported, derivedNext)
        }
        for (const idx of groupRows) {
          result.created++
          result.rows.push({ row: idx + 1, status: 'created' })
        }
      } catch (error) {
        this.failGroup(result, groupRows, error)
      }
    }

    if (highestImported != null) {
      this.settingsRepo.ensureCounterAtLeast(INVOICE_COUNTER_KEY, highestImported)
    }
  }

  private normalizeFiler(raw: string): FilerStatus | null {
    // The filer column is optional; blank rows count as "filer".
    const cleaned = raw.trim()
    if (!cleaned) return 'filer'
    const value = cleaned.toLowerCase().replace(/[^a-z]/g, '')
    if (value === 'filer') return 'filer'
    if (value === 'nonfiler' || value === 'nonfilers') return 'non_filer'
    return null
  }

  /** Extracts the trailing whole number from an invoice number (INV-000042 → 43). */
  private deriveNextNumber(invoiceNumber: string): number | null {
    const match = /\d+$/.exec(invoiceNumber)
    if (!match) return null
    const number = parseInt(match[0], 10)
    return Number.isInteger(number) ? number + 1 : null
  }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  private buildHeaderIndex(header: string[], entity: DataTransferEntity): Map<string, number> {
    const index = new Map<string, number>()
    for (const col of COLUMNS[entity]) {
      const expected = normalizeHeader(col.label)
      const position = header.findIndex((cell) => normalizeHeader(cell) === expected)
      if (col.required && position < 0) {
        throw new Error(`CSV is missing required column "${col.required ? `${col.label}*` : col.label}"`)
      }
      if (position >= 0) index.set(col.key, position)
    }
    return index
  }

  private cell(row: string[], headerIndex: Map<string, number>, key: string): string {
    const idx = headerIndex.get(key)
    if (idx === undefined || idx >= row.length) return ''
    return row[idx] ?? ''
  }

  private isBlank(row: string[]): boolean {
    return row.every((cell) => cell.trim() === '')
  }

  private recordFailure(result: DataTransferResult, row: number, error: unknown): void {
    result.failed++
    result.rows.push({ row: row + 1, status: 'failed', reason: (error as Error).message })
  }

  private failGroup(result: DataTransferResult, groupRows: number[], error: unknown): void {
    const reason = (error as Error).message
    for (const idx of groupRows) {
      result.failed++
      result.rows.push({ row: idx + 1, status: 'failed', reason })
    }
  }

  private requiredMoney(cell: string, label: string): number {
    if (!cell) throw new Error(`${label} is required`)
    const parsed = parseMoney(cell)
    if (parsed == null) throw new Error(`${label} must be a non-negative amount (Rs.)`)
    return parsed
  }

  private requiredInt(cell: string, label: string): number {
    if (!cell) throw new Error(`${label} is required`)
    const value = Number(cell.trim().replace(/,/g, ''))
    if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a whole number of at least 1`)
    return value
  }

  private money(paisa: number): string {
    return (paisa / 100).toFixed(2)
  }
}

/** Parses a rupee amount into integer minor units (paisa/cents). */
function parseMoney(value: string): number | null {
  const number = Number(value.trim().replace(/,/g, ''))
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round(number * 100)
}