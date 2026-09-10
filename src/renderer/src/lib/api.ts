import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'
import type { Category, CreateCategoryDTO, UpdateCategoryDTO } from '@shared/types/category'
import type {
  StockMovement,
  RecordMovementDTO,
  SetOpeningStockDTO,
  ProductWithStock,
  StockSummary,
} from '@shared/types/inventory'
import type { Customer, CreateCustomerDTO, UpdateCustomerDTO, CustomerWithBalance, CustomerStatusFilter } from '@shared/types/customer'
import type {
  CustomerLedgerEntry,
  CustomerLedgerEntryWithBalance,
  CustomerLedgerSummary,
  CreateCustomerLedgerDTO,
} from '@shared/types/customer-ledger'
import type { CustomerPayment, CustomerPaymentWithCustomer, CreateCustomerPaymentDTO } from '@shared/types/customer-payment'
import type { Invoice, InvoiceItem, InvoiceWithCustomer, InvoiceWithItems, CreateInvoiceDTO, UpdateInvoiceDTO } from '@shared/types/invoice'
import type { Restock, RestockListItem, RestockWithItems, CreateRestockDTO, UpdateRestockDTO } from '@shared/types/restock'
import type { BusinessProfile, UpdateBusinessProfileDTO } from '@shared/types/business-profile'
import type { Setting, UpdateSettingDTO, BulkUpdateSettingsDTO } from '@shared/types/setting'
import type { StockAdjustment, CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'
import type {
  SalesReport,
  InventoryReport,
  CustomerReport,
  ProfitLossReport,
  PaymentsReport,
  RestocksReport,
  StockMovementsReport,
} from '@shared/types/report'
import type {
  CSVImportConfig,
  CSVImportResult,
  CSVExportConfig,
  CSVPreviewRow,
  CSVImportEntityType,
  CSVExportEntityType,
} from '@shared/types/csv'
import type { DashboardOverview } from '@shared/types/dashboard'
import type { BackupValidation, BackupMetadata, BackupRestoreResult } from '@shared/types/backup'

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

export interface FileDialogResult {
  canceled: boolean
  filePaths?: string[]
  filePath?: string | null
}

function ipc<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.api.invoke(channel, ...args) as Promise<T>
}

export const api = {
  products: {
    list: () => ipc<Product[]>('products:list'),
    listActive: () => ipc<Product[]>('products:list-active'),
    listInactive: () => ipc<Product[]>('products:list-inactive'),
    listWithStock: () => ipc<ProductWithStock[]>('products:list-with-stock'),
    listActiveWithStock: () => ipc<ProductWithStock[]>('products:list-active-with-stock'),
    getById: (id: number) => ipc<Product | null>('products:get-by-id', id),
    getBySku: (sku: string) => ipc<Product | null>('products:get-by-sku', sku),
    getByCategory: (categoryId: number) => ipc<Product[]>('products:get-by-category', categoryId),
    search: (query: string) => ipc<Product[]>('products:search', query),
    searchWithStock: (query: string) => ipc<ProductWithStock[]>('products:search-with-stock', query),
    create: (data: CreateProductDTO) => ipc<Product>('products:create', data),
    update: (id: number, data: UpdateProductDTO) => ipc<Product>('products:update', id, data),
    setActive: (id: number, isActive: boolean) => ipc<Product>('products:set-active', id, isActive),
    delete: (id: number) => ipc<{ success: boolean }>('products:delete', id),
    count: () => ipc<number>('products:count'),
    countActive: () => ipc<number>('products:count-active'),
  },

  categories: {
    list: () => ipc<Category[]>('categories:list'),
    listActive: () => ipc<Category[]>('categories:list-active'),
    getById: (id: number) => ipc<Category | null>('categories:get-by-id', id),
    create: (data: CreateCategoryDTO) => ipc<Category>('categories:create', data),
    update: (id: number, data: UpdateCategoryDTO) => ipc<Category>('categories:update', id, data),
    setActive: (id: number, isActive: boolean) => ipc<Category>('categories:set-active', id, isActive),
    delete: (id: number) => ipc<{ success: boolean }>('categories:delete', id),
    count: () => ipc<number>('categories:count'),
  },

  inventory: {
    listMovements: (productId: number) =>
      ipc<StockMovement[]>('inventory:list-movements', productId),
    getById: (id: number) => ipc<StockMovement | null>('inventory:get-by-id', id),
    recordMovement: (data: RecordMovementDTO) =>
      ipc<StockMovement>('inventory:record-movement', data),
    currentQuantity: (productId: number) =>
      ipc<number>('inventory:current-quantity', productId),
    currentQuantities: (productIds: number[]) =>
      ipc<Record<number, number>>('inventory:current-quantities', productIds),
    stockSummary: (productId: number) =>
      ipc<StockSummary>('inventory:stock-summary', productId),
    stockSummaries: (productIds: number[]) =>
      ipc<StockSummary[]>('inventory:stock-summaries', productIds),
    lowStock: () => ipc<StockSummary[]>('inventory:low-stock'),
    outOfStock: () => ipc<StockSummary[]>('inventory:out-of-stock'),
    setOpeningStock: (data: SetOpeningStockDTO) =>
      ipc<StockMovement>('inventory:set-opening-stock', data),
  },

  customers: {
    list: () => ipc<Customer[]>('customers:list'),
    listActive: () => ipc<Customer[]>('customers:list-active'),
    listInactive: () => ipc<Customer[]>('customers:list-inactive'),
    listWithBalance: (filter: CustomerStatusFilter = 'all') =>
      ipc<CustomerWithBalance[]>('customers:list-with-balance', filter),
    getById: (id: number) => ipc<Customer | null>('customers:get-by-id', id),
    getWithBalance: (id: number) => ipc<CustomerWithBalance | null>('customers:get-with-balance', id),
    search: (query: string, status: CustomerStatusFilter = 'active') =>
      ipc<Customer[]>('customers:search', query, status),
    create: (data: CreateCustomerDTO) => ipc<Customer>('customers:create', data),
    update: (id: number, data: UpdateCustomerDTO) => ipc<Customer>('customers:update', id, data),
    setActive: (id: number, isActive: boolean) => ipc<Customer>('customers:set-active', id, isActive),
    delete: (id: number) => ipc<{ success: boolean }>('customers:delete', id),
    count: () => ipc<number>('customers:count'),
    countActive: () => ipc<number>('customers:count-active'),
  },

  customerLedger: {
    listByCustomer: (customerId: number) =>
      ipc<CustomerLedgerEntry[]>('customer-ledger:list-by-customer', customerId),
    list: (customerId: number, from?: string, to?: string) =>
      ipc<CustomerLedgerEntryWithBalance[]>('customer-ledger:list', customerId, from, to),
    latest: (customerId: number, limit: number) =>
      ipc<CustomerLedgerEntryWithBalance[]>('customer-ledger:latest', customerId, limit),
    getById: (id: number) => ipc<CustomerLedgerEntry | null>('customer-ledger:get-by-id', id),
    getBalance: (customerId: number) => ipc<number>('customer-ledger:get-balance', customerId),
    getOutstanding: (customerId: number) =>
      ipc<number>('customer-ledger:get-outstanding', customerId),
    balanceAtDate: (customerId: number, date: string) =>
      ipc<number>('customer-ledger:balance-at-date', customerId, date),
    summary: (customerId: number) =>
      ipc<CustomerLedgerSummary>('customer-ledger:summary', customerId),
    create: (data: CreateCustomerLedgerDTO) =>
      ipc<CustomerLedgerEntry>('customer-ledger:create', data),
  },

  payments: {
    list: () => ipc<CustomerPaymentWithCustomer[]>('payments:list'),
    getById: (id: number) => ipc<CustomerPayment | null>('payments:get-by-id', id),
    listByCustomer: (customerId: number) =>
      ipc<CustomerPaymentWithCustomer[]>('payments:list-by-customer', customerId),
    listByInvoice: (invoiceId: number) =>
      ipc<CustomerPaymentWithCustomer[]>('payments:list-by-invoice', invoiceId),
    listBetween: (from: string, to: string) =>
      ipc<CustomerPaymentWithCustomer[]>('payments:list-between', from, to),
    create: (data: CreateCustomerPaymentDTO) =>
      ipc<CustomerPayment>('payments:create', data),
    delete: (id: number) => ipc<{ success: boolean }>('payments:delete', id),
  },

  invoices: {
    list: () => ipc<InvoiceWithCustomer[]>('invoices:list'),
    getById: (id: number) => ipc<Invoice | null>('invoices:get-by-id', id),
    getWithItems: (invoiceId: number) =>
      ipc<InvoiceWithItems | null>('invoices:get-with-items', invoiceId),
    getItems: (invoiceId: number) => ipc<InvoiceItem[]>('invoices:get-items', invoiceId),
    listByCustomer: (customerId: number) =>
      ipc<InvoiceWithCustomer[]>('invoices:list-by-customer', customerId),
    listByStatus: (status: Invoice['status']) =>
      ipc<InvoiceWithCustomer[]>('invoices:list-by-status', status),
    listBetween: (from: string, to: string) =>
      ipc<InvoiceWithCustomer[]>('invoices:list-between', from, to),
    create: (data: CreateInvoiceDTO) => ipc<Invoice>('invoices:create', data),
    update: (id: number, data: UpdateInvoiceDTO) => ipc<Invoice>('invoices:update', id, data),
    cancel: (id: number) => ipc<Invoice>('invoices:cancel', id),
    refreshOverdue: () => ipc<{ changed: number }>('invoices:refresh-overdue'),
    delete: (id: number) => ipc<{ success: boolean }>('invoices:delete', id),
  },

  restocks: {
    list: () => ipc<Restock[]>('restocks:list'),
    listWithCounts: () => ipc<RestockListItem[]>('restocks:list-with-counts'),
    getById: (id: number) => ipc<Restock | null>('restocks:get-by-id', id),
    getWithItems: (id: number) => ipc<RestockWithItems | null>('restocks:get-with-items', id),
    getItems: (restockId: number) => ipc<Restock[]>('restocks:get-items', restockId),
    listByStatus: (status: Restock['status']) =>
      ipc<Restock[]>('restocks:list-by-status', status),
    create: (data: CreateRestockDTO) => ipc<Restock>('restocks:create', data),
    update: (id: number, data: UpdateRestockDTO) => ipc<Restock>('restocks:update', id, data),
    markReceived: (id: number, options?: { updateCost?: boolean }) =>
      ipc<Restock>('restocks:mark-received', id, options ?? { updateCost: true }),
    cancel: (id: number) => ipc<Restock>('restocks:cancel', id),
    delete: (id: number) => ipc<{ success: boolean }>('restocks:delete', id),
  },

  businessProfile: {
    get: () => ipc<BusinessProfile | null>('business-profile:get'),
    update: (data: UpdateBusinessProfileDTO) =>
      ipc<BusinessProfile>('business-profile:update', data),
  },

  settings: {
    list: () => ipc<Setting[]>('settings:list'),
    get: (key: string) => ipc<Setting | null>('settings:get', key),
    getValue: (key: string) => ipc<string | null>('settings:get-value', key),
    set: (key: string, value: string, type: string) =>
      ipc<Setting>('settings:set', key, value, type),
    update: (key: string, data: UpdateSettingDTO) =>
      ipc<Setting>('settings:update', key, data),
    bulkUpdate: (data: BulkUpdateSettingsDTO) =>
      ipc<{ success: boolean }>('settings:bulk-update', data),
    delete: (key: string) => ipc<{ success: boolean }>('settings:delete', key),
  },

  reports: {
    sales: (from: string, to: string) => ipc<SalesReport>('reports:sales', from, to),
    inventory: () => ipc<InventoryReport>('reports:inventory'),
    customers: (from: string, to: string) => ipc<CustomerReport>('reports:customers', from, to),
    profitLoss: (from: string, to: string) =>
      ipc<ProfitLossReport>('reports:profit-loss', from, to),
    payments: (from: string, to: string) => ipc<PaymentsReport>('reports:payments', from, to),
    restocks: (from: string, to: string) => ipc<RestocksReport>('reports:restocks', from, to),
    stockMovements: (from: string, to: string) =>
      ipc<StockMovementsReport>('reports:stock-movements', from, to),
  },

  stockAdjustments: {
    list: () => ipc<StockAdjustment[]>('stock-adjustments:list'),
    getById: (id: number) => ipc<StockAdjustment | null>('stock-adjustments:get-by-id', id),
    listByProduct: (productId: number) =>
      ipc<StockAdjustment[]>('stock-adjustments:list-by-product', productId),
    create: (data: CreateStockAdjustmentDTO) =>
      ipc<StockAdjustment>('stock-adjustments:create', data),
    delete: (id: number) => ipc<{ success: boolean }>('stock-adjustments:delete', id),
  },

  csv: {
    preview: (config: { filePath: string; delimiter: string; hasHeader: boolean; maxRows?: number }) =>
      ipc<CSVPreviewRow>('csv:preview', config),
    import: (config: CSVImportConfig) => ipc<CSVImportResult>('csv:import', config),
    export: (config: CSVExportConfig) => ipc<string>('csv:export', config),
  },

  dashboard: {
    overview: () => ipc<DashboardOverview>('dashboard:overview'),
  },

  backup: {
    create: (destinationPath: string) => ipc<BackupMetadata>('backup:create', destinationPath),
    validate: (filePath: string) => ipc<BackupValidation>('backup:validate', filePath),
    restore: (filePath: string) => ipc<BackupRestoreResult>('backup:restore', filePath),
  },

  dialogs: {
    selectFile: (options?: { filters?: unknown[] }) =>
      ipc<FileDialogResult>('dialog:select-file', options),
    selectDirectory: () => ipc<FileDialogResult>('dialog:select-directory'),
    saveFile: (options?: { defaultPath?: string; filters?: unknown[] }) =>
      ipc<FileDialogResult>('dialog:save-file', options),
  },
}
