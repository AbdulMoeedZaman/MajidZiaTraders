import { BaseRepository } from './base.repository'
import type {
  Restock,
  RestockItem,
  RestockListItem,
  RestockItemWithProduct,
  CreateRestockDTO,
  CreateRestockItemDTO,
  UpdateRestockDTO,
} from '@shared/types/restock'
import { aggregateRestockLines, type RestockHeaderTotalsItem } from '@shared/calc/restock-totals'

function toHeaderTotalsItem(item: CreateRestockItemDTO): RestockHeaderTotalsItem {
  const qtyCartons = item.qtyCartons ?? 0
  const piecesPerCarton = item.piecesPerCarton ?? 1
  const totalRetailValueExcl = item.retailPricePerCarton != null ? qtyCartons * item.retailPricePerCarton : 0
  const salesTaxAmount = item.salesTaxAmount ?? 0
  const advanceTax = item.advanceTax ?? 0
  const tradeDiscountValue = item.tradeDiscountValue ?? 0
  const netSalesValueExcl = item.netSalesValueExcl ?? 0
  const discountedValueInclusive = netSalesValueExcl + salesTaxAmount + advanceTax - tradeDiscountValue
  return { qtyCartons, piecesPerCarton, totalRetailValueExcl, salesTaxAmount, advanceTax, tradeDiscountValue, netSalesValueExcl, discountedValueInclusive }
}

function totalsFromItems(items: CreateRestockItemDTO[]) {
  return aggregateRestockLines(items.map(toHeaderTotalsItem))
}

export class RestockRepository extends BaseRepository {
  findAll(): Restock[] {
    return this.db.prepare('SELECT * FROM restocks ORDER BY createdAt DESC').all() as Restock[]
  }

  findAllWithCounts(): RestockListItem[] {
    return this.db
      .prepare(
        `SELECT r.*,
                (SELECT COUNT(*) FROM restock_items i WHERE i.restockId = r.id) AS itemCount
         FROM restocks r
         ORDER BY r.createdAt DESC`
      )
      .all() as RestockListItem[]
  }

  findById(id: number): Restock | null {
    return this.db.prepare('SELECT * FROM restocks WHERE id = ?').get(id) as Restock | null
  }

  findByStatus(status: Restock['status']): Restock[] {
    return this.db
      .prepare('SELECT * FROM restocks WHERE status = ? ORDER BY createdAt DESC')
      .all(status) as Restock[]
  }

  generateReferenceNumber(): string {
    const maxExisting = (
      this.db
        .prepare(
          "SELECT COALESCE(MAX(CAST(SUBSTR(referenceNumber, 4) AS INTEGER)), 0) AS maxNo FROM restocks WHERE referenceNumber LIKE 'RS-%'"
        )
        .get() as { maxNo: number }
    ).maxNo
    const counter = this.db
      .prepare("SELECT value FROM settings WHERE key = 'restock_next_number'")
      .get() as { value: string } | undefined
    const next = Math.max(Number(counter?.value) || 0, maxExisting + 1)
    this.db
      .prepare(
        `INSERT INTO settings (key, value, type) VALUES ('restock_next_number', ?, 'number')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`
      )
      .run(String(next + 1))
    return `RS-${String(next).padStart(6, '0')}`
  }

  create(data: CreateRestockDTO, referenceNumber: string): Restock {
    const totals = totalsFromItems(data.items)

    const result = this.db.prepare(
      `INSERT INTO restocks
        (referenceNumber, supplierName, date, status, notes,
         supplierInvoiceNo, supplierRegistrationNo, buyerNtn, buyerCnic, dispatchNoteNo, salesOrderNo,
         totalRetailValueExcl, totalSalesTax, totalAdvanceTax, totalTradeDiscount, totalNetValueExcl, totalCost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      referenceNumber,
      data.supplierName,
      data.date,
      'pending',
      data.notes ?? null,
      data.supplierInvoiceNo ?? null,
      data.supplierRegistrationNo ?? null,
      data.buyerNtn ?? null,
      data.buyerCnic ?? null,
      data.dispatchNoteNo ?? null,
      data.salesOrderNo ?? null,
      totals.totalRetailValueExcl,
      totals.totalSalesTax,
      totals.totalAdvanceTax,
      totals.totalTradeDiscount,
      totals.totalNetValueExcl,
      totals.totalCost
    )

    const restockId = result.lastInsertRowid as number

    for (const item of data.items) {
      this.createItem(restockId, item)
    }

    return this.findById(restockId)!
  }

  createItem(restockId: number, item: CreateRestockItemDTO): RestockItem {
    const totals = toHeaderTotalsItem(item)

    const result = this.db
      .prepare(
        `INSERT INTO restock_items
          (restockId, productId, qtyCartons, piecesPerCarton, mrpPerPiece, salesTaxRate, retailPricePerCarton, totalRetailValueExcl, salesTaxAmount, advanceTaxRate, advanceTax, netSalesValueExcl, tradeDiscountValue, discountedValueInclusive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        restockId,
        item.productId,
        item.qtyCartons,
        item.piecesPerCarton,
        item.mrpPerPiece ?? null,
        item.salesTaxRate,
        item.retailPricePerCarton ?? 0,
        totals.totalRetailValueExcl,
        item.salesTaxAmount ?? totals.salesTaxAmount,
        item.advanceTaxRate,
        item.advanceTax ?? totals.advanceTax,
        item.netSalesValueExcl,
        item.tradeDiscountValue ?? 0,
        totals.discountedValueInclusive
      )

    return this.db.prepare('SELECT * FROM restock_items WHERE id = ?').get(result.lastInsertRowid) as RestockItem
  }

  getItems(restockId: number): RestockItem[] {
    return this.db
      .prepare('SELECT * FROM restock_items WHERE restockId = ?')
      .all(restockId) as RestockItem[]
  }

  getItemsWithProduct(restockId: number): RestockItemWithProduct[] {
    return this.db
      .prepare(
        `SELECT i.*, p.name AS productName, p.sku AS productSku
         FROM restock_items i
         JOIN products p ON p.id = i.productId
         WHERE i.restockId = ?
         ORDER BY i.id ASC`
      )
      .all(restockId) as RestockItemWithProduct[]
  }

  update(id: number, data: UpdateRestockDTO & { status?: Restock['status'] }): Restock {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.supplierName !== undefined) { fields.push('supplierName = ?'); values.push(data.supplierName) }
    if (data.date !== undefined) { fields.push('date = ?'); values.push(data.date) }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes) }
    if (data.supplierInvoiceNo !== undefined) { fields.push('supplierInvoiceNo = ?'); values.push(data.supplierInvoiceNo) }
    if (data.supplierRegistrationNo !== undefined) { fields.push('supplierRegistrationNo = ?'); values.push(data.supplierRegistrationNo) }
    if (data.buyerNtn !== undefined) { fields.push('buyerNtn = ?'); values.push(data.buyerNtn) }
    if (data.buyerCnic !== undefined) { fields.push('buyerCnic = ?'); values.push(data.buyerCnic) }
    if (data.dispatchNoteNo !== undefined) { fields.push('dispatchNoteNo = ?'); values.push(data.dispatchNoteNo) }
    if (data.salesOrderNo !== undefined) { fields.push('salesOrderNo = ?'); values.push(data.salesOrderNo) }

    if (data.items) {
      this.db.prepare('DELETE FROM restock_items WHERE restockId = ?').run(id)
      for (const item of data.items) {
        this.createItem(id, item)
      }
      const totals = totalsFromItems(data.items)
      fields.push('totalRetailValueExcl = ?', 'totalSalesTax = ?', 'totalAdvanceTax = ?', 'totalTradeDiscount = ?', 'totalNetValueExcl = ?', 'totalCost = ?')
      values.push(totals.totalRetailValueExcl, totals.totalSalesTax, totals.totalAdvanceTax, totals.totalTradeDiscount, totals.totalNetValueExcl, totals.totalCost)
    }

    if (fields.length > 0) {
      fields.push("updatedAt = datetime('now')")
      values.push(id)
      this.db.prepare(`UPDATE restocks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM restock_items WHERE restockId = ?').run(id)
    this.db.prepare('DELETE FROM restocks WHERE id = ?').run(id)
  }

  countItemsByProductId(productId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM restock_items WHERE productId = ?')
      .get(productId) as { count: number }
    return result.count
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM restocks').get() as { count: number }).count
  }

  findRangeWithCounts(from: string, to: string): Array<{
    restockId: number
    referenceNumber: string
    supplierName: string
    date: string
    itemCount: number
    totalCost: number
    status: Restock['status']
  }> {
    return this.db
      .prepare(
        `SELECT r.id AS restockId,
                r.referenceNumber,
                r.supplierName,
                r.date,
                (SELECT COUNT(*) FROM restock_items i WHERE i.restockId = r.id) AS itemCount,
                r.totalCost,
                r.status
         FROM restocks r
         WHERE r.date >= ? AND r.date <= ?
         ORDER BY r.date DESC`
      )
      .all(from, to) as Array<{
      restockId: number
      referenceNumber: string
      supplierName: string
      date: string
      itemCount: number
      totalCost: number
      status: Restock['status']
    }>
  }
}