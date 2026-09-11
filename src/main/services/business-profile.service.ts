import { BusinessProfileRepository } from '../repositories/business-profile.repository'
import type { BusinessProfile, UpdateBusinessProfileDTO } from '@shared/types/business-profile'

export class BusinessProfileService {
  private profileRepo = new BusinessProfileRepository()

  get(): BusinessProfile | null {
    return this.profileRepo.get()
  }

  update(data: UpdateBusinessProfileDTO): BusinessProfile {
    if (data.name !== undefined && !data.name.trim()) {
      throw new Error('Business name cannot be empty')
    }
    if (data.invoiceNextNumber !== undefined && (!Number.isInteger(data.invoiceNextNumber) || data.invoiceNextNumber < 1)) {
      throw new Error('Invoice next number must be at least 1')
    }

    return this.profileRepo.update(data)
  }
}
