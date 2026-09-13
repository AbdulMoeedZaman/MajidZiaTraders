import * as XLSX from 'xlsx'
import { CustomerRepository } from '../repositories/customer.repository'
import { RouteRepository } from '../repositories/route.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import type {
  Customer,
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerWithRoute,
  CustomerImportResult,
} from '@shared/types/customer'

export class CustomerService {
  private customerRepo = new CustomerRepository()
  private routeRepo = new RouteRepository()
  private invoiceRepo = new InvoiceRepository()

  list(): Customer[] {
    return this.customerRepo.findAll()
  }

  listByRoute(routeId: number): CustomerWithRoute[] {
    this.assertRoute(routeId)
    return this.customerRepo.findByRoute(routeId)
  }

  getById(id: number): Customer | null {
    return this.customerRepo.findById(id)
  }

  getByIdWithRoute(id: number): CustomerWithRoute | null {
    return this.customerRepo.findByIdWithRoute(id)
  }

  search(query: string): CustomerWithRoute[] {
    return this.customerRepo.search(query)
  }

  create(data: CreateCustomerDTO): Customer {
    const code = data.code?.trim()
    if (!code) {
      throw new Error('Customer code is required')
    }
    if (this.customerRepo.findByCode(code)) {
      throw new Error('A customer with this code already exists')
    }
    if (!(data.shopName?.trim() || data.ownerName?.trim())) {
      throw new Error('A customer needs a shop name or an owner name')
    }
    this.assertRoute(data.routeId)
    return this.customerRepo.create(data)
  }

  update(id: number, data: UpdateCustomerDTO): Customer {
    const existing = this.customerRepo.findById(id)
    if (!existing) {
      throw new Error('Customer not found')
    }
    if (data.code !== undefined) {
      if (!data.code.trim()) {
        throw new Error('Customer code cannot be empty')
      }
      const conflict = this.customerRepo.findByCodeExcludingId(data.code.trim(), id)
      if (conflict) {
        throw new Error('A customer with this code already exists')
      }
    }
    const shop = data.shopName?.trim() ?? existing.shopName.trim()
    const owner = data.ownerName?.trim() ?? existing.ownerName.trim()
    if (!shop && !owner) {
      throw new Error('A customer needs a shop name or an owner name')
    }
    if (data.routeId !== undefined) {
      this.assertRoute(data.routeId)
    }
    return this.customerRepo.update(id, data)
  }

  delete(id: number): void {
    const existing = this.customerRepo.findById(id)
    if (!existing) {
      throw new Error('Customer not found')
    }
    if (this.invoiceRepo.countByCustomer(id) > 0) {
      throw new Error('This customer has invoices and cannot be deleted')
    }
    this.customerRepo.delete(id)
  }

  count(): number {
    return this.customerRepo.count()
  }

  /**
   * Imports customers from an Excel (.xlsx) store listing. The sheet with the
   * "Store Code" header is used and columns are matched by name (Store Code,
   * Store Name, Owner Name, Owner Contact #, Address). Every imported customer
   * is assigned to the given single route. Rows duplicating an existing store
   * code are skipped and reported.
   */
  importFromExcel(filePath: string, routeId: number): CustomerImportResult {
    this.assertRoute(routeId)

    const workbook = XLSX.readFile(filePath, { cellDates: false })
    let dataRows: string[][] | null = null
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        blankrows: false,
      }) as string[][]
      if (rows.length > 0 && rows[0].some((h) => h.trim() === 'Store Code')) {
        dataRows = rows
        break
      }
    }
    if (!dataRows) {
      throw new Error('Could not find a sheet with a "Store Code" column')
    }

    const header = dataRows[0]
    const idxByName = (label: string): number => header.findIndex((h) => h.trim() === label)
    const iCode = idxByName('Store Code')
    const iName = idxByName('Store Name')
    const iOwner = idxByName('Owner Name')
    const iPhone = idxByName('Owner Contact #')
    const iAddress = idxByName('Address')

    const result: CustomerImportResult = {
      file: filePath,
      created: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      customers: [],
    }

    for (const row of dataRows.slice(1)) {
      const code = iCode >= 0 ? String(row[iCode] ?? '').trim() : ''
      const shopName = iName >= 0 ? String(row[iName] ?? '').trim() : ''
      const ownerName = iOwner >= 0 ? String(row[iOwner] ?? '').trim() : ''
      if (!code) {
        result.skippedInvalid++
        continue
      }
      if (!shopName && !ownerName) {
        result.skippedInvalid++
        continue
      }
      if (this.customerRepo.findByCode(code)) {
        result.skippedDuplicate++
        continue
      }

      const phone = iPhone >= 0 ? String(row[iPhone] ?? '').trim() : ''
      const address = iAddress >= 0 ? String(row[iAddress] ?? '').trim() : ''
      const customer = this.customerRepo.create({
        code,
        shopName,
        ownerName,
        phone: phone || null,
        address: address || null,
        routeId,
      })
      result.created++
      result.customers.push(customer)
    }

    return result
  }

  private assertRoute(routeId: number): void {
    if (!Number.isInteger(routeId) || !this.routeRepo.findById(routeId)) {
      throw new Error('Customer must be assigned to a valid delivery route')
    }
  }
}