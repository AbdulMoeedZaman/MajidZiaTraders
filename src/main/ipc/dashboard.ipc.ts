import { ipcMain } from 'electron'
import { DashboardService } from '../services/dashboard.service'

const dashboardService = new DashboardService()

export function registerDashboardIpc(): void {
  ipcMain.handle('dashboard:summary', (_event, args: { start: string; end: string }) =>
    dashboardService.summary(args.start, args.end)
  )
}