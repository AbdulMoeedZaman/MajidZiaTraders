import { ipcMain } from 'electron'
import { InventoryService } from '../services/inventory.service'
import type { SetOpeningStockDTO } from '@shared/types/inventory'

const inventoryService = new InventoryService()

export function registerInventoryIpc(): void {
  ipcMain.handle('inventory:list-movements', (_, productId: number) => {
    return inventoryService.listMovements(productId)
  })

  ipcMain.handle('inventory:list-movements-with-context', (_, productId: number) => {
    return inventoryService.listMovementsWithContext(productId)
  })

  ipcMain.handle('inventory:get-by-id', (_, id: number) => {
    return inventoryService.getById(id)
  })

  ipcMain.handle('inventory:current-quantity', (_, productId: number) => {
    return inventoryService.getCurrentQuantity(productId)
  })

  ipcMain.handle('inventory:current-quantities', (_, productIds: number[]) => {
    const map = inventoryService.getCurrentQuantities(productIds)
    return Object.fromEntries(map)
  })

  ipcMain.handle('inventory:stock-summary', (_, productId: number) => {
    return inventoryService.getStockSummary(productId)
  })

  ipcMain.handle('inventory:stock-summaries', (_, productIds: number[]) => {
    return inventoryService.getStockSummaries(productIds)
  })

  ipcMain.handle('inventory:low-stock', () => {
    return inventoryService.getLowStock()
  })

  ipcMain.handle('inventory:out-of-stock', () => {
    return inventoryService.getOutOfStock()
  })

  ipcMain.handle('inventory:set-opening-stock', (_, data: SetOpeningStockDTO) => {
    return inventoryService.setOpeningStock(data)
  })
}