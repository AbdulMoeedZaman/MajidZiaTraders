export interface BusinessProfile {
  id: number
  name: string
  ownerName: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  country: string | null
  taxId: string | null
  taxRate: number
  logoPath: string | null
  currency: string
  invoiceFooter: string | null
  invoicePrefix: string
  invoiceNextNumber: number
  createdAt: string
  updatedAt: string
}

export interface UpdateBusinessProfileDTO {
  name?: string
  ownerName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  taxId?: string | null
  taxRate?: number
  logoPath?: string | null
  currency?: string
  invoiceFooter?: string | null
  invoicePrefix?: string
  invoiceNextNumber?: number
}
