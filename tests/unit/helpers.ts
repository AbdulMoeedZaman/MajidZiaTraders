import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach } from 'vitest'
import { closeDatabase, getDatabase } from '../../src/main/database/connection'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { InventoryService } from '../../src/main/services/inventory.service'
import type { Product } from '../../src/shared/types/product'
import type { CreateInvoiceItemDTO } from '../../src/shared/types/invoice'

export const FIXTURE_V3_BACKUP = path.resolve(__dirname, '../e2e/fixtures/v3-empty-backup.db')

/** Gives every test its own empty database (all migrations applied) in a temp folder. */
export function useTestDatabase(): { dir: () => string } {
  let current = ''
  beforeEach(() => {
    closeDatabase()
    current = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-unit-'))
    process.env.TEST_USER_DATA = current
    getDatabase()
  })
  afterEach(() => {
    closeDatabase()
    fs.rmSync(current, { recursive: true, force: true })
  })
  return { dir: () => current }
}

/** A product with 100 in stock and one active customer. */
export function seedBasics(sku = 'W1'): { product: Product; customerId: number } {
  const product = new ProductService().create({
    sku,
    name: `Widget ${sku}`,
    baseCostPrice: 500,
    minSellingPrice: 800,
    sellingPrice: 1000,
  })
  new InventoryService().setOpeningStock({ productId: product.id, quantity: 100 })
  const customer = new CustomerService().create({ name: `Customer ${sku}` })
  return { product, customerId: customer.id }
}

export function line(product: Product, quantity: number, price = product.sellingPrice): CreateInvoiceItemDTO {
  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    quantity,
    costPriceAtSale: product.baseCostPrice,
    minSellingPriceAtSale: product.minSellingPrice,
    actualSellingPrice: price,
  }
}
