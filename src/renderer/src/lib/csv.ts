import { api } from './api'
import type { CSVExportConfig, CSVExportEntityType, CSVImportEntityType } from '@shared/types/csv'

export interface ExportOptions {
  entityType: CSVExportEntityType
  filePath: string
  columns: string[]
  filters?: Record<string, unknown>
  delimiter?: string
  includeHeaders?: boolean
}

export async function createCsvExport(options: ExportOptions): Promise<string> {
  const config: CSVExportConfig = {
    entityType: options.entityType,
    filePath: options.filePath,
    delimiter: options.delimiter ?? ',',
    encoding: 'utf8',
    includeHeaders: options.includeHeaders ?? true,
    columns: options.columns,
    filters: options.filters ?? {},
  }
  return api.csv.export(config)
}

export interface ImportPlan {
  entityType: CSVImportEntityType
  filePath: string
  delimiter: string
  hasHeader: boolean
}

export interface ImportOptions extends ImportPlan {
  columnMappings: Array<{ sourceColumn: string; targetField: string }>
}

export function defaultExportColumns(entityType: CSVExportEntityType): string[] {
  switch (entityType) {
    case 'products':
      return ['sku', 'name', 'category', 'unit', 'baseCostPrice', 'minSellingPrice', 'sellingPrice', 'reorderLevel', 'currentStock', 'isActive']
    case 'customers':
      return ['name', 'phone', 'email', 'address', 'notes', 'isActive']
    case 'restocks':
      return ['referenceNumber', 'supplierName', 'date', 'totalCost', 'status', 'notes']
    case 'invoices':
      return ['invoiceNumber', 'customerName', 'date', 'dueDate', 'subtotal', 'taxAmount', 'total', 'totalCost', 'totalProfit', 'paid', 'outstanding', 'status']
    case 'sales_report':
      return ['productSku', 'productName', 'quantitySold', 'revenue', 'cost', 'profit']
    case 'customer_payments':
      return ['paymentDate', 'customerName', 'invoiceNumber', 'amount', 'method', 'reference']
    case 'stock_movements':
      return ['createdAt', 'productSku', 'productName', 'type', 'quantity', 'referenceType', 'referenceId', 'newQuantity']
    default:
      return []
  }
}