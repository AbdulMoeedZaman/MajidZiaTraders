export interface CSVColumnMapping {
  sourceColumn: string
  targetField: string
}

export type CSVImportEntityType = 'products' | 'customers' | 'restocks'

export type CSVExportEntityType =
  | 'products'
  | 'customers'
  | 'restocks'
  | 'invoices'
  | 'sales_report'
  | 'customer_payments'
  | 'stock_movements'

export interface CSVImportConfig {
  entityType: CSVImportEntityType
  filePath: string
  delimiter: string
  hasHeader: boolean
  encoding: string
  columnMappings: CSVColumnMapping[]
}

export interface CSVImportResult {
  totalRows: number
  imported: number
  skipped: number
  duplicates: number
  errors: Array<{ row: number; message: string }>
}

export interface CSVExportConfig {
  entityType: CSVExportEntityType
  filePath: string
  delimiter: string
  encoding: string
  includeHeaders: boolean
  columns: string[]
  filters?: Record<string, unknown>
}

export interface CSVPreviewRow {
  columns: string[]
  rows: string[][]
  totalRows: number
}

export interface CSVFieldDefinition {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'date' | 'boolean'
}

export const CSV_IMPORT_FIELDS: Record<CSVImportEntityType, CSVFieldDefinition[]> = {
  products: [
    { key: 'sku', label: 'SKU', required: true, type: 'string' },
    { key: 'name', label: 'Name', required: true, type: 'string' },
    { key: 'description', label: 'Description', required: false, type: 'string' },
    { key: 'category', label: 'Category name', required: false, type: 'string' },
    { key: 'unit', label: 'Unit', required: false, type: 'string' },
    { key: 'piecesPerCarton', label: 'Pieces per carton', required: false, type: 'number' },
    { key: 'baseCostPrice', label: 'Base cost price', required: false, type: 'number' },
    { key: 'minSellingPrice', label: 'Min. selling price', required: false, type: 'number' },
    { key: 'sellingPrice', label: 'Selling price', required: false, type: 'number' },
    { key: 'reorderLevel', label: 'Reorder level', required: false, type: 'number' },
  ],
  customers: [
    { key: 'name', label: 'Name', required: true, type: 'string' },
    { key: 'phone', label: 'Phone', required: false, type: 'string' },
    { key: 'email', label: 'Email', required: false, type: 'string' },
    { key: 'address', label: 'Address', required: false, type: 'string' },
    { key: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
  restocks: [
    { key: 'supplierName', label: 'Supplier name', required: true, type: 'string' },
    { key: 'date', label: 'Date (YYYY-MM-DD)', required: false, type: 'date' },
    { key: 'productSKU', label: 'Product SKU', required: true, type: 'string' },
    { key: 'quantity', label: 'Quantity', required: true, type: 'number' },
    { key: 'unitCost', label: 'Unit cost', required: true, type: 'number' },
    { key: 'unit', label: 'Unit', required: false, type: 'string' },
    { key: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
}

export interface CSVExportField {
  key: string
  label: string
}

export const CSV_EXPORT_FIELDS: Record<CSVExportEntityType, CSVExportField[]> = {
  products: [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'unit', label: 'Unit' },
    { key: 'baseCostPrice', label: 'Base cost price' },
    { key: 'minSellingPrice', label: 'Min. selling price' },
    { key: 'sellingPrice', label: 'Selling price' },
    { key: 'reorderLevel', label: 'Reorder level' },
    { key: 'currentStock', label: 'Current stock' },
    { key: 'isActive', label: 'Active' },
  ],
  customers: [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Address' },
    { key: 'notes', label: 'Notes' },
    { key: 'isActive', label: 'Active' },
  ],
  restocks: [
    { key: 'referenceNumber', label: 'Reference' },
    { key: 'supplierName', label: 'Supplier' },
    { key: 'date', label: 'Date' },
    { key: 'totalCost', label: 'Total cost' },
    { key: 'status', label: 'Status' },
    { key: 'notes', label: 'Notes' },
  ],
  invoices: [
    { key: 'invoiceNumber', label: 'Invoice number' },
    { key: 'customerName', label: 'Customer' },
    { key: 'date', label: 'Date' },
    { key: 'dueDate', label: 'Due date' },
    { key: 'subtotal', label: 'Subtotal' },
    { key: 'taxAmount', label: 'Tax' },
    { key: 'total', label: 'Total' },
    { key: 'totalCost', label: 'Cost' },
    { key: 'totalProfit', label: 'Profit' },
    { key: 'paid', label: 'Paid' },
    { key: 'outstanding', label: 'Outstanding' },
    { key: 'status', label: 'Status' },
  ],
  sales_report: [
    { key: 'productSku', label: 'SKU' },
    { key: 'productName', label: 'Product' },
    { key: 'quantitySold', label: 'Quantity sold' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'cost', label: 'Cost' },
    { key: 'profit', label: 'Profit' },
  ],
  customer_payments: [
    { key: 'paymentDate', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'invoiceNumber', label: 'Invoice' },
    { key: 'amount', label: 'Amount' },
    { key: 'method', label: 'Method' },
    { key: 'reference', label: 'Reference' },
  ],
  stock_movements: [
    { key: 'createdAt', label: 'Date' },
    { key: 'productSku', label: 'SKU' },
    { key: 'productName', label: 'Product' },
    { key: 'type', label: 'Type' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'referenceType', label: 'Reference type' },
    { key: 'referenceId', label: 'Reference id' },
    { key: 'newQuantity', label: 'New quantity' },
  ],
}
