import { ipcMain } from 'electron'
import { ProjectOwnerService } from '../services/project-owner.service'
import type { CreateProjectOwnerDTO, UpdateProjectOwnerDTO } from '@shared/types/project-owner'

const ownerService = new ProjectOwnerService()

export function registerProjectOwnerIpc(): void {
  ipcMain.handle('project-owners:list', () => ownerService.list())
  ipcMain.handle('project-owners:get-by-id', (_, id: number) => ownerService.getById(id))
  ipcMain.handle('project-owners:create', (_, data: CreateProjectOwnerDTO) => ownerService.create(data))
  ipcMain.handle('project-owners:update', (_, id: number, data: UpdateProjectOwnerDTO) =>
    ownerService.update(id, data)
  )
  ipcMain.handle('project-owners:delete', (_, id: number) => {
    ownerService.delete(id)
    return { success: true }
  })
  ipcMain.handle('project-owners:count', () => ownerService.count())
}