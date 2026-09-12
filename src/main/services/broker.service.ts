import { BrokerRepository } from '../repositories/broker.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import type { Broker, CreateBrokerDTO, UpdateBrokerDTO } from '@shared/types/broker'

export class BrokerService {
  private brokerRepo = new BrokerRepository()
  private invoiceRepo = new InvoiceRepository()

  list(): Broker[] {
    return this.brokerRepo.findAll()
  }

  getById(id: number): Broker | null {
    return this.brokerRepo.findById(id)
  }

  create(data: CreateBrokerDTO): Broker {
    const name = data.name?.trim()
    if (!name) {
      throw new Error('Broker name is required')
    }
    if (this.brokerRepo.findByName(name)) {
      throw new Error('A broker with this name already exists')
    }
    return this.brokerRepo.create(data)
  }

  update(id: number, data: UpdateBrokerDTO): Broker {
    const existing = this.brokerRepo.findById(id)
    if (!existing) {
      throw new Error('Broker not found')
    }
    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new Error('Broker name cannot be empty')
      }
      const conflict = this.brokerRepo.findByNameExcludingId(data.name.trim(), id)
      if (conflict) {
        throw new Error('A broker with this name already exists')
      }
    }
    return this.brokerRepo.update(id, data)
  }

  delete(id: number): void {
    const existing = this.brokerRepo.findById(id)
    if (!existing) {
      throw new Error('Broker not found')
    }
    if (this.invoiceRepo.countByBroker(id) > 0) {
      throw new Error('This broker is used on invoices and cannot be deleted')
    }
    this.brokerRepo.delete(id)
  }

  count(): number {
    return this.brokerRepo.count()
  }
}