import { ipcMain } from 'electron'
import { ProductService } from '../services/product.service'
import { RestockService } from '../services/restock.service'
import type { CreateProductDTO, UpdateProductDTO } from '@shared/types/product'
import type { AddStockDTO } from '@shared/types/restock'

const productService = new ProductService()
const restockService = new RestockService()

export function registerProductIpc(): void {
  ipcMain.handle('products:list', () => {
    return productService.list()
  })

  ipcMain.handle('products:list-active', () => {
    return productService.listActive()
  })

  ipcMain.handle('products:list-inactive', () => {
    return productService.listInactive()
  })

  ipcMain.handle('products:list-with-stock', () => {
    return productService.listWithStock()
  })

  ipcMain.handle('products:list-active-with-stock', () => {
    return productService.listActiveWithStock()
  })

  ipcMain.handle('products:get-by-id', (_, id: number) => {
    return productService.getById(id)
  })

  ipcMain.handle('products:get-by-sku', (_, sku: string) => {
    return productService.getBySku(sku)
  })

  ipcMain.handle('products:get-by-category', (_, categoryId: number) => {
    return productService.getByCategory(categoryId)
  })

  ipcMain.handle('products:search', (_, query: string) => {
    return productService.search(query)
  })

  ipcMain.handle('products:search-with-stock', (_, query: string) => {
    return productService.searchWithStock(query)
  })

  ipcMain.handle('products:create', (_, data: CreateProductDTO) => {
    return productService.create(data)
  })

  ipcMain.handle('products:update', (_, id: number, data: UpdateProductDTO) => {
    return productService.update(id, data)
  })

  ipcMain.handle('products:set-active', (_, id: number, isActive: boolean) => {
    return productService.setActive(id, isActive)
  })

  ipcMain.handle('products:add-stock', (_, data: AddStockDTO) => {
    return restockService.addStock(data)
  })

  ipcMain.handle('products:delete', (_, id: number) => {
    productService.delete(id)
    return { success: true }
  })

  ipcMain.handle('products:count', () => {
    return productService.count()
  })

  ipcMain.handle('products:count-active', () => {
    return productService.countActive()
  })
}