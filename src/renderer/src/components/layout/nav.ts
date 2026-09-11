export type AppView =
  | 'dashboard'
  | 'products'
  | 'invoices'
  | 'customers'
  | 'payments'
  | 'settings'

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
  { key: 'payments', label: 'Payments', icon: '◈', enabled: true },
  { key: 'settings', label: 'Settings', icon: '⌘', enabled: true },
]

export const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'Dashboard',
  products: 'Products',
  invoices: 'Invoices',
  customers: 'Customers',
  payments: 'Payments',
  settings: 'Settings',
}