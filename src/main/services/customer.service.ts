import { CustomerRepository } from '../repositories/customer.repository'
import { RouteRepository } from '../repositories/route.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import type { Customer, CreateCustomerDTO, UpdateCustomerDTO, CustomerWithRoute } from '@shared/types/customer'

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

  private assertRoute(routeId: number): void {
    if (!Number.isInteger(routeId) || !this.routeRepo.findById(routeId)) {
      throw new Error('Customer must be assigned to a valid delivery route')
    }
  }
}