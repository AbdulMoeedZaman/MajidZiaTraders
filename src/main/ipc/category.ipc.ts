import { ipcMain } from 'electron'
import { CategoryService } from '../services/category.service'
import type { CreateCategoryDTO, UpdateCategoryDTO } from '@shared/types/category'

const categoryService = new CategoryService()

export function registerCategoryIpc(): void {
  ipcMain.handle('categories:list', () => {
    return categoryService.list()
  })

  ipcMain.handle('categories:list-active', () => {
    return categoryService.listActive()
  })

  ipcMain.handle('categories:get-by-id', (_, id: number) => {
    return categoryService.getById(id)
  })

  ipcMain.handle('categories:create', (_, data: CreateCategoryDTO) => {
    return categoryService.create(data)
  })

  ipcMain.handle('categories:update', (_, id: number, data: UpdateCategoryDTO) => {
    return categoryService.update(id, data)
  })

  ipcMain.handle('categories:set-active', (_, id: number, isActive: boolean) => {
    return categoryService.setActive(id, isActive)
  })

  ipcMain.handle('categories:delete', (_, id: number) => {
    categoryService.delete(id)
    return { success: true }
  })

  ipcMain.handle('categories:count', () => {
    return categoryService.count()
  })
}