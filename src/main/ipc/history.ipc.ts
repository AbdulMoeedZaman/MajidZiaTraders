import { ipcMain } from 'electron'
import { HistoryService } from '../services/history.service'

const historyService = new HistoryService()

export function registerHistoryIpc(): void {
  ipcMain.handle('history:list', () => historyService.list())
  ipcMain.handle('history:recent', (_event, limit: number) => historyService.recent(limit ?? 8))
}