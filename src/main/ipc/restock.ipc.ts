import { ipcMain } from 'electron'
import { RestockService } from '../services/restock.service'
import type { CreateRestockDTO, UpdateRestockDTO } from '@shared/types/restock'

const restockService = new RestockService()

export function registerRestockIpc(): void {
  ipcMain.handle('restocks:list', () => {
    return restockService.list()
  })

  ipcMain.handle('restocks:list-with-counts', () => {
    return restockService.listWithCounts()
  })

  ipcMain.handle('restocks:get-by-id', (_, id: number) => {
    return restockService.getById(id)
  })

  ipcMain.handle('restocks:get-with-items', (_, id: number) => {
    return restockService.getWithItems(id)
  })

  ipcMain.handle('restocks:get-items', (_, restockId: number) => {
    return restockService.getItems(restockId)
  })

  ipcMain.handle('restocks:list-by-status', (_, status: string) => {
    return restockService.listByStatus(status as never)
  })

  ipcMain.handle('restocks:create', (_, data: CreateRestockDTO) => {
    return restockService.create(data)
  })

  ipcMain.handle('restocks:update', (_, id: number, data: UpdateRestockDTO) => {
    return restockService.update(id, data)
  })

  ipcMain.handle('restocks:mark-received', (_, id: number, options?: { updateCost?: boolean }) => {
    return restockService.markReceived(id, options)
  })

  ipcMain.handle('restocks:cancel', (_, id: number) => {
    return restockService.cancel(id)
  })

  ipcMain.handle('restocks:delete', (_, id: number) => {
    restockService.delete(id)
    return { success: true }
  })
}