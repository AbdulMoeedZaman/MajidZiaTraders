import type { ProjectOwner, CreateProjectOwnerDTO, UpdateProjectOwnerDTO } from '@shared/types/project-owner'
import type { Broker, CreateBrokerDTO, UpdateBrokerDTO } from '@shared/types/broker'
import type { Route, RouteWithCount } from '@shared/types/route'
import type { Product, CreateProductDTO, UpdateProductDTO, ProductImportResult } from '@shared/types/product'
import type { Customer, CustomerWithRoute, CreateCustomerDTO, UpdateCustomerDTO, CustomerImportResult } from '@shared/types/customer'
import type { Invoice, InvoiceWithCustomer, InvoiceDetails, CreateInvoiceDTO, LoadFormSummary } from '@shared/types/invoice'
import type { StockMovement, StockMovementWithProduct, StockLevel, CreateRestockDTO, AdjustStockDTO } from '@shared/types/stock'
import type { ActionLog } from '@shared/types/history'
import type { Setting, UpdateSettingDTO, BulkUpdateSettingsDTO } from '@shared/types/setting'
import type { BackupFileInfo, BackupValidation, BackupRestoreResult, DialogResult } from '@shared/types/backup'
import type { DashboardSummary } from '@shared/types/dashboard'
import type { CreateExpenseDTO, Expense, ExpenseDaySummary, ExpenseRangeSummary } from '@shared/types/expense'
import type { CustomerPayResult, Payment, RecentPayment } from '@shared/types/payment'
import type { CustomerProductPreference, SetPreferenceDTO } from '@shared/types/product-preference'

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

function ipc<T>(channel: string, ...args: unknown[]): Promise<T> {
  const bridge = window.api?.invoke
  if (!bridge) {
    return Promise.reject(
      new Error('Electron bridge is not available. Run the app with `npm run dev` (not a plain browser).')
    )
  }
  return bridge(channel, ...args) as Promise<T>
}

export const api = {
  projectOwners: {
    list: () => ipc<ProjectOwner[]>('project-owners:list'),
    getById: (id: number) => ipc<ProjectOwner | null>('project-owners:get-by-id', id),
    create: (data: CreateProjectOwnerDTO) => ipc<ProjectOwner>('project-owners:create', data),
    update: (id: number, data: UpdateProjectOwnerDTO) =>
      ipc<ProjectOwner>('project-owners:update', id, data),
    delete: (id: number) => ipc<{ success: boolean }>('project-owners:delete', id),
    count: () => ipc<number>('project-owners:count'),
  },

  brokers: {
    list: () => ipc<Broker[]>('brokers:list'),
    getById: (id: number) => ipc<Broker | null>('brokers:get-by-id', id),
    create: (data: CreateBrokerDTO) => ipc<Broker>('brokers:create', data),
    update: (id: number, data: UpdateBrokerDTO) => ipc<Broker>('brokers:update', id, data),
    delete: (id: number) => ipc<{ success: boolean }>('brokers:delete', id),
    count: () => ipc<number>('brokers:count'),
  },

  routes: {
    list: () => ipc<Route[]>('routes:list'),
    listWithCounts: () => ipc<RouteWithCount[]>('routes:list-with-counts'),
    rename: (id: number, name: string) => ipc<Route>('routes:rename', id, name),
  },

  products: {
    list: () => ipc<Product[]>('products:list'),
    search: (query: string) => ipc<Product[]>('products:search', query),
    getById: (id: number) => ipc<Product | null>('products:get-by-id', id),
    create: (data: CreateProductDTO) => ipc<Product>('products:create', data),
    update: (id: number, data: UpdateProductDTO) => ipc<Product>('products:update', id, data),
    delete: (id: number) => ipc<{ success: boolean }>('products:delete', id),
    count: () => ipc<number>('products:count'),
    importCsv: (filePath: string) => ipc<ProductImportResult>('products:import-csv', filePath),
  },

  customers: {
    list: () => ipc<Customer[]>('customers:list'),
    listByRoute: (routeId: number) => ipc<CustomerWithRoute[]>('customers:list-by-route', routeId),
    getById: (id: number) => ipc<CustomerWithRoute | null>('customers:get-by-id', id),
    search: (query: string) => ipc<CustomerWithRoute[]>('customers:search', query),
    create: (data: CreateCustomerDTO) => ipc<Customer>('customers:create', data),
    update: (id: number, data: UpdateCustomerDTO) => ipc<Customer>('customers:update', id, data),
    delete: (id: number) => ipc<{ success: boolean }>('customers:delete', id),
    count: () => ipc<number>('customers:count'),
    importExcel: (filePath: string, routeId: number) =>
      ipc<CustomerImportResult>('customers:import-excel', filePath, routeId),
    pay: (customerId: number, amount: number) =>
      ipc<CustomerPayResult>('customers:pay', customerId, amount),
  },

  productPreferences: {
    listByCustomer: (customerId: number) =>
      ipc<CustomerProductPreference[]>('product-preferences:list-by-customer', customerId),
    set: (data: SetPreferenceDTO) =>
      ipc<CustomerProductPreference>('product-preferences:set', data),
    remove: (customerId: number, productId: number) =>
      ipc<{ success: boolean }>('product-preferences:remove', customerId, productId),
  },

  payments: {
    listByInvoice: (invoiceId: number) => ipc<Payment[]>('payments:list-by-invoice', invoiceId),
    listByCustomer: (customerId: number) => ipc<Payment[]>('payments:list-by-customer', customerId),
    listRecent: (limit = 50) => ipc<RecentPayment[]>('payments:list-recent', limit),
    remove: (paymentId: number) => ipc<Payment>('payments:remove', paymentId),
  },

  invoices: {
    list: () => ipc<InvoiceWithCustomer[]>('invoices:list'),
    listByDate: (from: string, to: string) =>
      ipc<InvoiceWithCustomer[]>('invoices:list-by-date', { from, to }),
    getById: (id: number) => ipc<Invoice | null>('invoices:get-by-id', id),
    getWithDetails: (id: number) => ipc<InvoiceDetails | null>('invoices:get-with-details', id),
    listByCustomer: (customerId: number) =>
      ipc<InvoiceWithCustomer[]>('invoices:list-by-customer', customerId),
    create: (data: CreateInvoiceDTO) => ipc<Invoice>('invoices:create', data),
    buildLoadForm: (invoiceIds: number[]) => ipc<LoadFormSummary>('invoices:build-load-form', invoiceIds),
    delete: (id: number) => ipc<{ success: boolean }>('invoices:delete', id),
    cancel: (id: number) => ipc<Invoice | null>('invoices:cancel', id),
    pay: (id: number, amount: number) => ipc<Invoice>('invoices:pay', id, amount),
    count: () => ipc<number>('invoices:count'),
  },

  stock: {
    list: () => ipc<StockMovementWithProduct[]>('stock:list'),
    listByProduct: (productId: number) => ipc<StockMovementWithProduct[]>('stock:list-by-product', productId),
    restock: (data: CreateRestockDTO) => ipc<StockMovement>('stock:restock', data),
    adjust: (data: AdjustStockDTO) => ipc<StockMovement>('stock:adjust', data),
    levels: () => ipc<StockLevel[]>('stock:levels'),
  },

  history: {
    list: () => ipc<ActionLog[]>('history:list'),
    recent: (limit = 8) => ipc<ActionLog[]>('history:recent', limit),
  },

  settings: {
    list: () => ipc<Setting[]>('settings:list'),
    get: (key: string) => ipc<Setting | null>('settings:get', key),
    getValue: (key: string) => ipc<string | null>('settings:get-value', key),
    set: (key: string, value: string, type: string) =>
      ipc<Setting>('settings:set', key, value, type),
    update: (key: string, data: UpdateSettingDTO) => ipc<Setting>('settings:update', key, data),
    bulkUpdate: (data: BulkUpdateSettingsDTO) =>
      ipc<{ success: boolean }>('settings:bulk-update', data),
    delete: (key: string) => ipc<{ success: boolean }>('settings:delete', key),
  },

  dialogs: {
    saveBackup: () => ipc<DialogResult>('dialog:save-backup'),
    openBackup: () => ipc<DialogResult>('dialog:open-backup'),
    openCsv: () => ipc<DialogResult>('dialog:open-csv'),
    openExcel: () => ipc<DialogResult>('dialog:open-excel'),
  },

  backup: {
    create: (destinationPath: string) => ipc<BackupFileInfo>('backup:create', destinationPath),
    validate: (sourcePath: string) => ipc<BackupValidation>('backup:validate', sourcePath),
    restore: (sourcePath: string) => ipc<BackupRestoreResult>('backup:restore', sourcePath),
  },

  dashboard: {
    summary: (start: string, end: string) =>
      ipc<DashboardSummary>('dashboard:summary', { start, end }),
  },

  expenses: {
    listByDate: (date: string) => ipc<Expense[]>('expenses:list-by-date', date),
    daySummary: (date: string) => ipc<ExpenseDaySummary>('expenses:day-summary', date),
    rangeSummary: (from: string, to: string) =>
      ipc<ExpenseRangeSummary>('expenses:range-summary', { from, to }),
    save: (data: CreateExpenseDTO) => ipc<Expense>('expenses:save', data),
    remove: (id: number) => ipc<{ success: boolean }>('expenses:delete', id),
  },
}