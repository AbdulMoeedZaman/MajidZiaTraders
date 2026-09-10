export interface Category {
  id: number
  name: string
  description: string | null
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryDTO {
  name: string
  description?: string
}

export interface UpdateCategoryDTO {
  name?: string
  description?: string
  isActive?: number
}
