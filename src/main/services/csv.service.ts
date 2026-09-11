import fs from 'fs'
import { parseCSV, toCSV, parseMoneyCell, parseIntCell } from './csv/parser'
import type {
  CSVImportConfig,
  CSVImportResult,
  CSVExportConfig,
  CSVPreviewRow,
} from '@shared/types/csv'
import { ProductService } from './product.service'
import { CustomerService } from './customer.service'
import { RestockService } from './restock.service'
import { ReportService } from './report.service'
import { CategoryRepository } from '../repositories/category.repository'
import { ProductRepository } from '../repositories/product.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import type { CreateProductDTO } from '@shared/types/product'
import type { CreateCustomerDTO } from '@shared/types/customer'
import type { CreateRestockDTO, CreateRestockItemDTO } from '@shared/types/restock'
import type { CSVExportEntityType } from '@shared/types/csv'
import { localDate, isValidIsoDate } from '@shared/date'

function today(): string {
  return localDate()
}

export class CSVService {
  private productService = new ProductService()
  private customerService = new CustomerService()
  private restockService = new RestockService()
  private reportService = new ReportService()
  private categoryRepo = new CategoryRepository()
  private productRepo = new ProductRepository()
  private invoiceRepo = new InvoiceRepository()

  preview(filePath: string, delimiter: string, hasHeader: boolean, maxRows = 50): CSVPreviewRow {
    const text = fs.readFileSync(filePath, 'utf8')
    const { header, rows } = parseCSV(text, delimiter || ',')

    const columns =
      hasHeader && header.length > 0
        ? header.map((h, i) => h.trim() || `column_${i + 1}`)
        : rows[0]?.map((_, i) => `column_${i + 1}`) ?? []

    const dataStart = hasHeader && header.length > 0 ? 1 : 0
    const dataRows = rows.slice(dataStart).filter((r) => r.some((c) => c.trim() !== ''))

    return {
      columns,
      rows: dataRows.slice(0, maxRows),
      totalRows: dataRows.length,
    }
  }

  import(config: CSVImportConfig): CSVImportResult {
    if (!config.filePath || !fs.existsSync(config.filePath)) {
      throw new Error('Source file not found')
    }

    const text = fs.readFileSync(config.filePath, (config.encoding || 'utf8') as BufferEncoding)
    const { header, rows } = parseCSV(text, config.delimiter || ',')
    const columnCount = (header.length > 0 ? header : rows[0] ?? []).length
    const columns =
      header.length > 0 && config.hasHeader
        ? header.map((h, i) => h.trim() || `column_${i + 1}`)
        : Array.from({ length: columnCount }, (_, i) => `column_${i + 1}`)

    const dataStart = config.hasHeader && header.length > 0 ? 1 : 0
    const indexedRows = rows
      .slice(dataStart)
      .map((row, offset) => ({ row, sourceIndex: dataStart + offset }))
      .filter(({ row }) => row.some((c) => c.trim() !== ''))
    const dataRows = indexedRows.map((r) => r.row)

    const result: CSVImportResult = {
      totalRows: dataRows.length,
      imported: 0,
      skipped: 0,
      duplicates: 0,
      errors: [],
    }

    const recordError = (index: number, message: string): void => {
      const displayRow = indexedRows[index].sourceIndex + 1
      result.errors.push({ row: displayRow, message })
      result.skipped += 1
    }

    const rowValues = (index: number): Record<string, string> => {
      const values: Record<string, string> = {}
      for (const mapping of config.columnMappings) {
        const colIndex = columns.indexOf(mapping.sourceColumn)
        if (colIndex >= 0 && dataRows[index][colIndex] !== undefined) {
          values[mapping.targetField] = dataRows[index][colIndex].trim()
        }
      }
      return values
    }

    if (config.entityType === 'products') {
      this.importProducts(dataRows, rowValues, result, recordError)
    } else if (config.entityType === 'customers') {
      this.importCustomers(dataRows, rowValues, result, recordError)
    } else if (config.entityType === 'restocks') {
      this.importRestocks(dataRows, rowValues, result, recordError)
    } else {
      throw new Error(`Import is not supported for "${config.entityType}"`)
    }

    return result
  }

  export(config: CSVExportConfig): string {
    if (!config.filePath) {
      throw new Error('Export destination is required')
    }

    const filter = config.filters ?? {}
    const from = typeof filter.from === 'string' && filter.from ? filter.from : undefined
    const to = typeof filter.to === 'string' && filter.to ? filter.to : undefined

    let rows: Array<Record<string, unknown>>

    switch (config.entityType) {
      case 'products': {
        const all = this.productService.listWithStock()
        const isActive = filter.isActive
        rows = all
          .filter((p) => (isActive === undefined ? true : p.isActive === (isActive === 'active' ? 1 : 0)))
          .map((p) => ({
            ...p,
            category: this.categoryRepo.findById(p.categoryId ?? -1)?.name ?? '',
          }))
        break
      }
      case 'customers': {
        const all = this.customerService.list()
        rows = all.map((c) => ({ ...c }))
        break
      }
      case 'restocks': {
        const all = this.restockService.listWithCounts()
        const status = typeof filter.status === 'string' ? filter.status : undefined
        rows = all
          .filter((r) => (from ? r.date >= from : true))
          .filter((r) => (to ? r.date <= to : true))
          .filter((r) => (status ? r.status === status : true))
          .map((r) => ({ ...r }))
        break
      }
      case 'invoices': {
        const invoices = this.invoiceRepo.findAllWithCustomer({ from, to })
        const status = typeof filter.status === 'string' ? filter.status : undefined
        rows = invoices
          .filter((i) => (status ? i.status === status : true))
          .map((i) => ({ ...i }))
        break
      }
      case 'sales_report': {
        const fromDate = from ?? '2000-01-01'
        const toDate = to ?? today()
        rows = this.reportService.getSalesReport(fromDate, toDate).items.map((i) => ({ ...i }))
        break
      }
      case 'customer_payments': {
        const fromDate = from ?? '2000-01-01'
        const toDate = to ?? today()
        const report = this.reportService.getPaymentsReport(fromDate, toDate)
        rows = report.items.map((i) => ({
          paymentDate: i.date,
          customerName: i.customerName,
          invoiceNumber: i.invoiceNumber,
          amount: i.amount,
          method: i.method,
          reference: i.reference,
        }))
        break
      }
      case 'stock_movements': {
        const fromDate = from ?? '2000-01-01'
        const toDate = to ?? today()
        const report = this.reportService.getStockMovementsReport(fromDate, toDate)
        rows = report.items.map((i) => ({
          createdAt: i.date,
          productSku: i.productSku,
          productName: i.productName,
          type: i.type,
          quantity: i.quantity,
          referenceType: i.referenceType,
          referenceId: i.referenceId,
          newQuantity: i.newQuantity,
        }))
        break
      }
      default:
        throw new Error(`Export is not supported for "${config.entityType}"`)
    }

    const MONEY_FIELD_KEYS: Partial<Record<CSVExportEntityType, string[]>> = {
    products: ['baseCostPrice', 'minSellingPrice', 'sellingPrice'],
    restocks: ['totalRetailValueExcl', 'totalSalesTax', 'totalAdvanceTax', 'totalTradeDiscount', 'totalNetValueExcl', 'totalCost'],
    invoices: ['subtotal', 'discount', 'taxAmount', 'total', 'totalCost', 'totalProfit', 'paid', 'outstanding'],
    sales_report: ['revenue', 'cost', 'profit'],
    customer_payments: ['amount'],
  }

  const moneyKeys = MONEY_FIELD_KEYS[config.entityType] ?? []
  rows = rows.map((r) => {
    const copy: Record<string, unknown> = { ...r }
    for (const key of moneyKeys) {
      const value = copy[key]
      if (typeof value === 'number') copy[key] = (value / 100).toFixed(2)
    }
    return copy
  })

  const csv = toCSV(config.columns, rows)
    const body =
      config.includeHeaders === false
        ? csv.includes('\r\n')
          ? csv.slice(csv.indexOf('\r\n') + 2)
          : ''
        : csv
    const enc = (config.encoding || 'utf8') as BufferEncoding
    fs.writeFileSync(config.filePath, body, {
      encoding: enc,
    })
    return config.filePath
  }

  private importProducts(
    rows: string[][],
    rowValues: (index: number) => Record<string, string>,
    result: CSVImportResult,
    recordError: (index: number, message: string) => void
  ): void {
    const seenSkus = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const values = rowValues(i)
      const sku = values.sku
      if (!sku) {
        recordError(i, 'SKU is required')
        continue
      }
      const key = sku.toLowerCase()
      if (seenSkus.has(key)) {
        result.duplicates += 1
        recordError(i, `Duplicate SKU "${sku}" within the file`)
        continue
      }
      seenSkus.add(key)

      if (!values.name) {
        recordError(i, 'Name is required')
        continue
      }

      const dto: CreateProductDTO = {
        sku,
        name: values.name,
        unit: values.unit || undefined,
      }

      let invalid = false

      if (values.piecesPerCarton) {
        const parsed = parseIntCell(values.piecesPerCarton, 'Pieces per carton')
        if (parsed.error) {
          recordError(i, parsed.error)
          continue
        }
        dto.piecesPerCarton = parsed.value
      }

      for (const [field, label] of [
        ['baseCostPrice', 'Base cost price'],
        ['minSellingPrice', 'Min. selling price'],
        ['sellingPrice', 'Selling price'],
      ] as const) {
        if (values[field]) {
          const parsed = parseMoneyCell(values[field], label)
          if (parsed.error) {
            recordError(i, parsed.error)
            invalid = true
            break
          }
          dto[field] = parsed.value
        }
      }
      if (invalid) continue

      if (values.reorderLevel) {
        const parsed = parseIntCell(values.reorderLevel, 'Reorder level')
        if (parsed.error) {
          recordError(i, parsed.error)
          continue
        }
        dto.reorderLevel = parsed.value
      }

      if (values.category) {
        let category = this.categoryRepo.findByName(values.category.trim())
        if (!category) {
          category = this.categoryRepo.create({ name: values.category.trim() })
        }
        dto.categoryId = category.id
      }

      try {
        this.productService.create(dto)
        result.imported += 1
      } catch (error) {
        recordError(i, String(error))
      }
    }
  }

  private importCustomers(
    rows: string[][],
    rowValues: (index: number) => Record<string, string>,
    result: CSVImportResult,
    recordError: (index: number, message: string) => void
  ): void {
    const seenNames = new Set<string>()
    const seenPhones = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const values = rowValues(i)
      if (!values.name) {
        recordError(i, 'Name is required')
        continue
      }
      const nameKey = values.name.trim().toLowerCase()
      if (seenNames.has(nameKey)) {
        result.duplicates += 1
        recordError(i, `Duplicate customer name "${values.name}" within the file`)
        continue
      }
      seenNames.add(nameKey)

      if (values.phone) {
        const phoneKey = values.phone.trim()
        if (seenPhones.has(phoneKey)) {
          result.duplicates += 1
          recordError(i, `Duplicate phone "${values.phone}" within the file`)
          continue
        }
        seenPhones.add(phoneKey)
      }

      const dto: CreateCustomerDTO = {
        name: values.name.trim(),
        phone: values.phone || undefined,
      }

      try {
        this.customerService.create(dto)
        result.imported += 1
      } catch (error) {
        recordError(i, String(error))
      }
    }
  }

  private importRestocks(
    rows: string[][],
    rowValues: (index: number) => Record<string, string>,
    result: CSVImportResult,
    recordError: (index: number, message: string) => void
  ): void {
    interface Group {
      supplierName: string
      date: string
      notes: string
      supplierInvoiceNo: string
      supplierRegistrationNo: string
      buyerNtn: string
      buyerCnic: string
      dispatchNoteNo: string
      salesOrderNo: string
      items: CreateRestockItemDTO[]
      rows: number[]
    }
    const groups = new Map<string, Group>()

    for (let i = 0; i < rows.length; i++) {
      const values = rowValues(i)
      if (!values.supplierName) {
        recordError(i, 'Supplier name is required')
        continue
      }
      const sku = values.productSKU
      if (!sku) {
        recordError(i, 'Product SKU is required')
        continue
      }
      const product = this.productRepo.findBySku(sku.trim())
      if (!product) {
        recordError(i, `Unknown product SKU "${sku}"`)
        continue
      }
      const qtyCartons = parseIntCell(values.qtyCartons || '', 'Qty cartons')
      if (qtyCartons.error || qtyCartons.value <= 0) {
        recordError(i, qtyCartons.error ?? 'Qty cartons must be a positive whole number')
        continue
      }
      const piecesPerCarton = parseIntCell(values.piecesPerCarton || '', 'Pieces per carton')
      if (piecesPerCarton.error || piecesPerCarton.value < 1) {
        recordError(i, piecesPerCarton.error ?? 'Pieces per carton must be at least 1')
        continue
      }
      const netSalesValueExcl = parseMoneyCell(values.netSalesValueExcl || '', 'Net sales value (excl.)')
      if (netSalesValueExcl.error) {
        recordError(i, netSalesValueExcl.error)
        continue
      }

      const date = values.date || today()
      if (!isValidIsoDate(date)) {
        recordError(i, 'Date must be in YYYY-MM-DD format')
        continue
      }

      const groupKey = `${values.supplierName.trim().toLowerCase()}|${date}`
      let group = groups.get(groupKey)
      if (!group) {
        group = {
          supplierName: values.supplierName.trim(),
          date,
          notes: values.notes || '',
          supplierInvoiceNo: values.supplierInvoiceNo || '',
          supplierRegistrationNo: values.supplierRegistrationNo || '',
          buyerNtn: values.buyerNtn || '',
          buyerCnic: values.buyerCnic || '',
          dispatchNoteNo: values.dispatchNoteNo || '',
          salesOrderNo: values.salesOrderNo || '',
          items: [],
          rows: [],
        }
        groups.set(groupKey, group)
      }
      group.rows.push(i)

      const item: CreateRestockItemDTO = {
        productId: product.id,
        qtyCartons: qtyCartons.value,
        piecesPerCarton: piecesPerCarton.value,
        netSalesValueExcl: netSalesValueExcl.value,
      }
      if (values.tradeDiscountValue) {
        const td = parseMoneyCell(values.tradeDiscountValue, 'Trade discount')
        if (td.error) {
          recordError(i, td.error)
          continue
        }
        item.tradeDiscountValue = td.value
      }
      group.items.push(item)
    }

    for (const group of groups.values()) {
      const dto: CreateRestockDTO = {
        supplierName: group.supplierName,
        date: group.date,
        notes: group.notes || undefined,
        supplierInvoiceNo: group.supplierInvoiceNo || undefined,
        supplierRegistrationNo: group.supplierRegistrationNo || undefined,
        buyerNtn: group.buyerNtn || undefined,
        buyerCnic: group.buyerCnic || undefined,
        dispatchNoteNo: group.dispatchNoteNo || undefined,
        salesOrderNo: group.salesOrderNo || undefined,
        items: group.items,
      }
      try {
        this.restockService.create(dto)
        result.imported += 1
      } catch (error) {
        for (const rowIndex of group.rows) {
          recordError(rowIndex, String(error))
        }
      }
    }
  }
}