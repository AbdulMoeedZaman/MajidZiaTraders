export type AppView =
  | 'dashboard'
  | 'products'
  | 'inventory'
  | 'invoices'
  | 'customers'
  | 'restocks'
  | 'payments'
  | 'reports'
  | 'settings'
  | 'csv'

export interface NavItem {
  key: AppView
  label: string
  icon: string
  enabled: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '▦', enabled: true },
  { key: 'invoices', label: 'Invoices', icon: '≡', enabled: true },
  { key: 'customers', label: 'Customers', icon: '◉', enabled: true },
  { key: 'products', label: 'Products', icon: '▤', enabled: true },
  { key: 'inventory', label: 'Inventory', icon: '▣', enabled: true },
  { key: 'restocks', label: 'Restocks', icon: '↑', enabled: true },
  { key: 'payments', label: 'Payments', icon: '◈', enabled: true },
  { key: 'reports', label: 'Reports', icon: '∑', enabled: true },
  { key: 'csv', label: 'CSV Tools', icon: '⧉', enabled: true },
  { key: 'settings', label: 'Settings', icon: '⌘', enabled: true },
]

export const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'Dashboard',
  products: 'Products',
  inventory: 'Inventory',
  invoices: 'Invoices',
  customers: 'Customers',
  restocks: 'Restocks',
  payments: 'Payments',
  reports: 'Reports',
  settings: 'Settings',
  csv: 'CSV Tools',
}