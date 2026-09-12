export interface Broker {
  id: number
  name: string
  phone: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateBrokerDTO {
  name: string
  phone?: string | null
}

export interface UpdateBrokerDTO {
  name?: string
  phone?: string | null
}