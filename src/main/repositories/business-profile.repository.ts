import { BaseRepository } from './base.repository'
import type { BusinessProfile, UpdateBusinessProfileDTO } from '@shared/types/business-profile'

export class BusinessProfileRepository extends BaseRepository {
  get(): BusinessProfile | null {
    return this.db.prepare('SELECT * FROM business_profile LIMIT 1').get() as BusinessProfile | null
  }

  create(data: Partial<BusinessProfile>): BusinessProfile {
    const result = this.db
      .prepare(
        `INSERT INTO business_profile (name, ownerName, phone, email, address, city, country, logoPath, currency, invoiceFooter, invoicePrefix, invoiceNextNumber)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name ?? '',
        data.ownerName ?? null,
        data.phone ?? null,
        data.email ?? null,
        data.address ?? null,
        data.city ?? null,
        data.country ?? null,
        data.logoPath ?? null,
        data.currency ?? 'PKR',
        data.invoiceFooter ?? null,
        data.invoicePrefix ?? 'INV-',
        data.invoiceNextNumber ?? 1
      )

    return this.db.prepare('SELECT * FROM business_profile WHERE id = ?').get(result.lastInsertRowid) as BusinessProfile
  }

  update(data: UpdateBusinessProfileDTO): BusinessProfile {
    const existing = this.get()
    if (!existing) {
      return this.create(data as Partial<BusinessProfile>)
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.ownerName !== undefined) { fields.push('ownerName = ?'); values.push(data.ownerName) }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone) }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email) }
    if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address) }
    if (data.city !== undefined) { fields.push('city = ?'); values.push(data.city) }
    if (data.country !== undefined) { fields.push('country = ?'); values.push(data.country) }
    if (data.logoPath !== undefined) { fields.push('logoPath = ?'); values.push(data.logoPath) }
    if (data.currency !== undefined) { fields.push('currency = ?'); values.push(data.currency) }
    if (data.invoiceFooter !== undefined) { fields.push('invoiceFooter = ?'); values.push(data.invoiceFooter) }
    if (data.invoicePrefix !== undefined) { fields.push('invoicePrefix = ?'); values.push(data.invoicePrefix) }
    if (data.invoiceNextNumber !== undefined) { fields.push('invoiceNextNumber = ?'); values.push(data.invoiceNextNumber) }

    if (fields.length === 0) return existing

    fields.push("updatedAt = datetime('now')")
    values.push(existing.id)

    this.db.prepare(`UPDATE business_profile SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.get()!
  }

  incrementInvoiceNumber(): number {
    const profile = this.get()
    if (!profile) throw new Error('Business profile not found')

    let nextNumber = Number.isInteger(profile.invoiceNextNumber) && profile.invoiceNextNumber >= 1
      ? profile.invoiceNextNumber
      : 1
    const prefix = profile.invoicePrefix || 'INV-'
    const taken = this.db.prepare('SELECT 1 AS ok FROM invoices WHERE invoiceNumber = ?')
    while (taken.get(`${prefix}${String(nextNumber).padStart(6, '0')}`)) {
      nextNumber += 1
    }

    this.db
      .prepare("UPDATE business_profile SET invoiceNextNumber = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(nextNumber + 1, profile.id)
    return nextNumber
  }
}
