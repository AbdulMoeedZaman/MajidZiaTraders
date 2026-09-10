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
  ownerName?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxId?: string
  taxRate?: number
  logoPath?: string
  currency?: string
  invoiceFooter?: string
  invoicePrefix?: string
  invoiceNextNumber?: number
}
