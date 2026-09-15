import { ipcMain } from 'electron'
import { ProductPreferenceService } from '../services/product-preference.service'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { SetPreferenceDTO } from '@shared/types/product-preference'

const prefService = new ProductPreferenceService()

export function registerProductPreferenceIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PRODUCT_PREFERENCES_LIST_BY_CUSTOMER, (_, customerId: number) =>
    prefService.listForCustomer(customerId)
  )
  ipcMain.handle(IPC_CHANNELS.PRODUCT_PREFERENCES_SET, (_, data: SetPreferenceDTO) => prefService.set(data))
  ipcMain.handle(IPC_CHANNELS.PRODUCT_PREFERENCES_REMOVE, (_, customerId: number, productId: number) => {
    prefService.remove(customerId, productId)
    return { success: true }
  })
}