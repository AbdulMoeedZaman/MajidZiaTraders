import { ipcMain } from 'electron'
import { CSVService } from '../services/csv.service'
import { assertUserFilePath, CSV_READ_EXTENSIONS, CSV_WRITE_EXTENSIONS } from './path-guard'
import type { CSVImportConfig, CSVExportConfig } from '@shared/types/csv'

const csvService = new CSVService()

export function registerCsvIpc(): void {
  ipcMain.handle('csv:preview', (_, config: { filePath: string; delimiter: string; hasHeader: boolean; maxRows?: number }) => {
    const filePath = assertUserFilePath(config?.filePath, CSV_READ_EXTENSIONS, 'CSV import')
    return csvService.preview(filePath, config.delimiter, config.hasHeader, config.maxRows ?? 50)
  })

  ipcMain.handle('csv:import', (_, config: CSVImportConfig) => {
    const filePath = assertUserFilePath(config?.filePath, CSV_READ_EXTENSIONS, 'CSV import')
    return csvService.import({ ...config, filePath })
  })

  ipcMain.handle('csv:export', (_, config: CSVExportConfig) => {
    const filePath = assertUserFilePath(config?.filePath, CSV_WRITE_EXTENSIONS, 'CSV export')
    return csvService.export({ ...config, filePath })
  })
}
