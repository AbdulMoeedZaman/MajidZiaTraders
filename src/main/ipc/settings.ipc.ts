import { ipcMain } from 'electron'
import { SettingsService } from '../services/settings.service'
import type { UpdateSettingDTO, BulkUpdateSettingsDTO } from '@shared/types/setting'

const settingsService = new SettingsService()

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:list', () => {
    return settingsService.list()
  })

  ipcMain.handle('settings:get', (_, key: string) => {
    return settingsService.get(key)
  })

  ipcMain.handle('settings:get-value', (_, key: string) => {
    return settingsService.getValue(key)
  })

  ipcMain.handle('settings:set', (_, key: string, value: string, type: string) => {
    return settingsService.set(key, value, type)
  })

  ipcMain.handle('settings:update', (_, key: string, data: UpdateSettingDTO) => {
    return settingsService.update(key, data)
  })

  ipcMain.handle('settings:bulk-update', (_, data: BulkUpdateSettingsDTO) => {
    settingsService.bulkUpdate(data)
    return { success: true }
  })

  ipcMain.handle('settings:delete', (_, key: string) => {
    settingsService.delete(key)
    return { success: true }
  })
}
