import { ipcMain } from 'electron'
import { ReportService } from '../services/report.service'
import { StockAdjustmentService } from '../services/stock-adjustment.service'
import type { CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'

const reportService = new ReportService()
const stockAdjustmentService = new StockAdjustmentService()

export function registerReportIpc(): void {
  ipcMain.handle('reports:sales', (_, from: string, to: string) => {
    return reportService.getSalesReport(from, to)
  })

  ipcMain.handle('reports:inventory', () => {
    return reportService.getInventoryReport()
  })

  ipcMain.handle('reports:customers', (_, from: string, to: string) => {
    return reportService.getCustomerReport(from, to)
  })

  ipcMain.handle('reports:profit-loss', (_, from: string, to: string) => {
    return reportService.getProfitLossReport(from, to)
  })

  ipcMain.handle('reports:payments', (_, from: string, to: string) => {
    return reportService.getPaymentsReport(from, to)
  })

  ipcMain.handle('reports:restocks', (_, from: string, to: string) => {
    return reportService.getRestocksReport(from, to)
  })

  ipcMain.handle('reports:stock-movements', (_, from: string, to: string) => {
    return reportService.getStockMovementsReport(from, to)
  })

  ipcMain.handle('stock-adjustments:list', () => {
    return stockAdjustmentService.list()
  })

  ipcMain.handle('stock-adjustments:get-by-id', (_, id: number) => {
    return stockAdjustmentService.getById(id)
  })

  ipcMain.handle('stock-adjustments:list-by-product', (_, productId: number) => {
    return stockAdjustmentService.listByProduct(productId)
  })

  ipcMain.handle('stock-adjustments:create', (_, data: CreateStockAdjustmentDTO) => {
    return stockAdjustmentService.create(data)
  })

  ipcMain.handle('stock-adjustments:delete', (_, id: number) => {
    stockAdjustmentService.delete(id)
    return { success: true }
  })
}