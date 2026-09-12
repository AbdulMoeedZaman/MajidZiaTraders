import { ProjectOwnerRepository } from '../repositories/project-owner.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import type {
  ProjectOwner,
  CreateProjectOwnerDTO,
  UpdateProjectOwnerDTO,
} from '@shared/types/project-owner'

export class ProjectOwnerService {
  private ownerRepo = new ProjectOwnerRepository()
  private invoiceRepo = new InvoiceRepository()

  list(): ProjectOwner[] {
    return this.ownerRepo.findAll()
  }

  getById(id: number): ProjectOwner | null {
    return this.ownerRepo.findById(id)
  }

  findFirst(): ProjectOwner | null {
    return this.ownerRepo.findFirst()
  }

  create(data: CreateProjectOwnerDTO): ProjectOwner {
    if (this.ownerRepo.count() > 0) {
      throw new Error('Only one project owner is supported. Edit the existing owner instead.')
    }
    const name = data.name?.trim()
    if (!name) {
      throw new Error('Owner name is required')
    }
    return this.ownerRepo.create(data)
  }

  update(id: number, data: UpdateProjectOwnerDTO): ProjectOwner {
    const existing = this.ownerRepo.findById(id)
    if (!existing) {
      throw new Error('Project owner not found')
    }
    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new Error('Owner name cannot be empty')
      }
      const conflict = this.ownerRepo.findByNameExcludingId(data.name.trim(), id)
      if (conflict) {
        throw new Error('An owner with this name already exists')
      }
    }
    return this.ownerRepo.update(id, data)
  }

  delete(id: number): void {
    const existing = this.ownerRepo.findById(id)
    if (!existing) {
      throw new Error('Project owner not found')
    }
    if (this.invoiceRepo.countByOwner(id) > 0) {
      throw new Error('This project owner is used on invoices and cannot be deleted')
    }
    this.ownerRepo.delete(id)
  }

  count(): number {
    return this.ownerRepo.count()
  }
}