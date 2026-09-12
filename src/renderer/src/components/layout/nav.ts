export type AppView =
  | 'invoices'
  | 'customers'
  | 'products'
  | 'settings'

export interface NavItem {
  key: AppView
  label: string
  icon: string
  enabled: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'invoices', label: 'Invoices', icon: '≡', enabled: true },
  { key: 'customers', label: 'Customers', icon: '◉', enabled: true },
  { key: 'products', label: 'Products', icon: '▤', enabled: true },
  { key: 'settings', label: 'Settings', icon: '⌘', enabled: true },
]

export const VIEW_TITLES: Record<AppView, string> = {
  invoices: 'Invoices',
  customers: 'Customers',
  products: 'Products',
  settings: 'Settings',
}