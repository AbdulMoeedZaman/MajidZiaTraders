import { ipcMain } from 'electron'
import { RouteService } from '../services/route.service'

const routeService = new RouteService()

export function registerRouteIpc(): void {
  ipcMain.handle('routes:list', () => routeService.list())
  ipcMain.handle('routes:list-with-counts', () => routeService.listWithCounts())
}