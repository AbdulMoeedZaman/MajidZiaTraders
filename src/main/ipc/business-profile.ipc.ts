import { ipcMain } from 'electron'
import { BusinessProfileService } from '../services/business-profile.service'
import type { UpdateBusinessProfileDTO } from '@shared/types/business-profile'

const businessProfileService = new BusinessProfileService()

export function registerBusinessProfileIpc(): void {
  ipcMain.handle('business-profile:get', () => {
    return businessProfileService.get()
  })

  ipcMain.handle('business-profile:update', (_, data: UpdateBusinessProfileDTO) => {
    return businessProfileService.update(data)
  })
}
