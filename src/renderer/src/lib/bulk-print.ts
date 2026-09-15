import { api } from './api'
import type { BulkPrintData } from '../features/invoices/components/LoadFormBulkPrint'
import type { InvoiceDetails, LoadFormSummary } from '@shared/types/invoice'

/**
 * Loads everything the bulk print needs that is not already in memory: the
 * global invoice-description setting and the full details of every linked
 * invoice. Shared by the load-form report screen and the app-level Print
 * shortcut.
 */
export async function prepareBulkPrintData(
  summary: LoadFormSummary,
  invoiceIds: number[],
  includeLoadForm = true
): Promise<BulkPrintData> {
  const [description, loaded] = await Promise.all([
    api.settings.getValue('invoice_description').catch(() => ''),
    Promise.all(
      invoiceIds.map(async (id): Promise<InvoiceDetails> => {
        const details = await api.invoices.getWithDetails(id)
        if (!details) {
          throw new Error('Could not load every invoice for printing')
        }
        return details
      })
    ),
  ])
  return { summary, description: description ?? '', invoices: loaded, includeLoadForm }
}