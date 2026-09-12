export interface ProjectOwner {
  id: number
  name: string
  phone: string | null
  address: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProjectOwnerDTO {
  name: string
  phone?: string | null
  address?: string | null
}

export interface UpdateProjectOwnerDTO {
  name?: string
  phone?: string | null
  address?: string | null
}