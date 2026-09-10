import { CategoryRepository } from '../repositories/category.repository'
import { ProductRepository } from '../repositories/product.repository'
import type { Category, CreateCategoryDTO, UpdateCategoryDTO } from '@shared/types/category'

export class CategoryService {
  private categoryRepo = new CategoryRepository()
  private productRepo = new ProductRepository()

  list(): Category[] {
    return this.categoryRepo.findAll()
  }

  listActive(): Category[] {
    return this.categoryRepo.findActive()
  }

  getById(id: number): Category | null {
    return this.categoryRepo.findById(id)
  }

  create(data: CreateCategoryDTO): Category {
    if (!data.name?.trim()) {
      throw new Error('Category name is required')
    }
    const existing = this.categoryRepo.findByName(data.name)
    if (existing) {
      throw new Error('A category with this name already exists')
    }

    return this.categoryRepo.create(data)
  }

  update(id: number, data: UpdateCategoryDTO): Category {
    const existing = this.categoryRepo.findById(id)
    if (!existing) {
      throw new Error('Category not found')
    }
    if (data.name !== undefined && !data.name.trim()) {
      throw new Error('Category name cannot be empty')
    }
    if (data.name) {
      const conflict = this.categoryRepo.findByName(data.name)
      if (conflict && conflict.id !== id) {
        throw new Error('A category with this name already exists')
      }
    }

    return this.categoryRepo.update(id, data)
  }

  delete(id: number): void {
    const existing = this.categoryRepo.findById(id)
    if (!existing) {
      throw new Error('Category not found')
    }
    const products = this.productRepo.findByCategoryIdAll(id)
    if (products.length > 0) {
      throw new Error(
        `Cannot delete category: ${products.length} product(s) still belong to it. Reassign or remove them first.`
      )
    }
    this.categoryRepo.delete(id)
  }

  setActive(id: number, isActive: boolean): Category {
    const existing = this.categoryRepo.findById(id)
    if (!existing) {
      throw new Error('Category not found')
    }
    return this.categoryRepo.update(id, { isActive: isActive ? 1 : 0 })
  }

  count(): number {
    return this.categoryRepo.count()
  }
}