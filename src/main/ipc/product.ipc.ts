import { ipcMain } from 'electron'
import { ProductService } from '../services/product.service'
import type { CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

const productService = new ProductService()

export function registerProductIpc(): void {
  ipcMain.handle('products:list', () => productService.list())
  ipcMain.handle('products:search', (_, query: string) => productService.search(query))
  ipcMain.handle('products:create', (_, data: CreateProductDTO) => productService.create(data))
  ipcMain.handle('products:update', (_, id: number, data: UpdateProductDTO) =>
    productService.update(id, data)
  )
  ipcMain.handle('products:delete', (_, id: number) => {
    productService.delete(id)
    return { success: true }
  })
  ipcMain.handle('products:count', () => productService.count())
}