import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach } from 'vitest'
import { closeDatabase, getDatabase } from '../../src/main/database/connection'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { ProjectOwnerService } from '../../src/main/services/project-owner.service'
import { BrokerService } from '../../src/main/services/broker.service'
import { StockService } from '../../src/main/services/stock.service'
import { RouteRepository } from '../../src/main/repositories/route.repository'
import type { Product } from '../../src/shared/types/product'

/** Gives every test its own empty database (all migrations applied) in a temp folder. */
export function useTestDatabase(): { dir: () => string } {
  let current = ''
  beforeEach(() => {
    closeDatabase()
    current = fs.mkdtempSync(path.join(os.tmpdir(), 'mztraders-unit-'))
    process.env.TEST_USER_DATA = current
    getDatabase()
  })
  afterEach(() => {
    closeDatabase()
    fs.rmSync(current, { recursive: true, force: true })
  })
  return { dir: () => current }
}

/** Returns the id of the route seeded by the migration for a delivery day. */
export function routeIdFor(name: string): number {
  const route = new RouteRepository().findByName(name)
  if (!route) throw new Error(`Route "${name}" not seeded`)
  return route.id
}

/** A product, project owner, broker, and a customer on the given route. */
export function seedBasics(routeName = 'Monday'): {
  product: Product
  customerId: number
  ownerId: number
  brokerId: number
  routeId: number
} {
  const product = new ProductService().create({
    name: 'Widget 1',
    rate: 500,
    piecesPerCarton: 12,
  })
  const owner = new ProjectOwnerService().create({ name: 'Majid Zia', phone: '0300-1234567', address: 'Main Bazaar' })
  const broker = new BrokerService().create({ name: 'Bashir', phone: '0301-7654321' })
  const routeId = routeIdFor(routeName)
  const customer = new CustomerService().create({
    code: 'C-001',
    shopName: 'Bilal Auto Shop',
    ownerName: 'Bilal',
    phone: '0322-0000000',
    address: 'Liaquat Road',
    routeId,
  })
  return { product, customerId: customer.id, ownerId: owner.id, brokerId: broker.id, routeId }
}

/**
 * `seedBasics()` plus `quantity` stock for the seeded product — invoices can no
 * longer be created without enough stock (negative stock is blocked), so tests
 * that create invoices must start from stock.
 */
export function seedStocked(quantity = 100): ReturnType<typeof seedBasics> {
  const seed = seedBasics()
  new StockService().restock({ productId: seed.product.id, quantity })
  return seed
}