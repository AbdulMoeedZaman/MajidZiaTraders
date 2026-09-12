import { ipcMain } from 'electron'
import { StockService } from '../services/stock.service'
import type { CreateRestockDTO } from '@shared/types/stock'

const stockService = new StockService()

export function registerStockIpc(): void {
  ipcMain.handle('stock:list', () => stockService.list())
  ipcMain.handle('stock:list-by-product', (_event, productId: number) =>
    stockService.listByProduct(productId)
  )
  ipcMain.handle('stock:restock', (_event, data: CreateRestockDTO) => stockService.restock(data))
}