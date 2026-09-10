import { ipcMain } from 'electron'
import { DashboardService } from '../services/dashboard.service'

const dashboardService = new DashboardService()

export function registerDashboardIpc(): void {
  ipcMain.handle('dashboard:overview', () => {
    return dashboardService.getOverview()
  })
}