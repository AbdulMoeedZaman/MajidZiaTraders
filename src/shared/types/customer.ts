export interface Customer {
  id: number
  /** Unique customer code. */
  code: string
  shopName: string
  ownerName: string
  phone: string | null
  address: string | null
  /** Assigned delivery route (one of the six fixed routes). */
  routeId: number
  /** Optional project owner association (not required). */
  ownerId: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateCustomerDTO {
  code: string
  shopName?: string
  ownerName?: string
  phone?: string | null
  address?: string | null
  routeId: number
  ownerId?: number | null
}

export interface UpdateCustomerDTO {
  code?: string
  shopName?: string
  ownerName?: string
  phone?: string | null
  address?: string | null
  routeId?: number
  ownerId?: number | null
}

export interface CustomerWithRoute extends Customer {
  routeName: string
}