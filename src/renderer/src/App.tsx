import { useEffect, useState } from 'react'
import { Layout } from './components/layout/Layout'
import type { AppView } from './components/layout/nav'
import { Dashboard } from './features/dashboard/components/Dashboard'
import { ProductList } from './features/products/components/ProductList'
import { InventoryList } from './features/inventory/components/InventoryList'
import { InvoiceList } from './features/invoices/components/InvoiceList'
import { InvoiceDetailPage } from './features/invoices/components/InvoiceDetailPage'
import { CustomerList } from './features/customers/components/CustomerList'
import { CustomerDetailPage } from './features/customers/components/CustomerDetailPage'
import { RestockList } from './features/restocks/components/RestockList'
import { RestockDetailPage } from './features/restocks/components/RestockDetailPage'
import { PaymentsList } from './features/payments/components/PaymentsList'
import { ReportsPage } from './features/reports/components/ReportsPage'
import { SettingsPage } from './features/settings/components/SettingsPage'
import { CsvWizard } from './features/csv/components/CsvWizard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { api } from './lib/api'
import { setCurrency } from './lib/format'

export default function App() {
  const [view, setView] = useState<AppView>('dashboard')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [selectedRestockId, setSelectedRestockId] = useState<number | null>(null)
  const [currencyVersion, setCurrencyVersion] = useState(0)

  // Re-read the currency whenever the screen changes, and re-render if it changed.
  useEffect(() => {
    api.businessProfile
      .get()
      .then((p) => {
        if (p && setCurrency(p.currency)) setCurrencyVersion((v) => v + 1)
      })
      .catch(() => {})
  }, [view])

  const navigate = (next: AppView) => {
    setView(next)
    setSelectedCustomerId(null)
    setSelectedInvoiceId(null)
    setSelectedRestockId(null)
  }

  const title =
    view === 'customers' && selectedCustomerId !== null
      ? 'Customer Details'
      : view === 'invoices' && selectedInvoiceId !== null
        ? 'Invoice Details'
        : view === 'restocks' && selectedRestockId !== null
          ? 'Restock Details'
          : undefined

  const onBack =
    view === 'customers' && selectedCustomerId !== null
      ? () => setSelectedCustomerId(null)
      : view === 'invoices' && selectedInvoiceId !== null
        ? () => setSelectedInvoiceId(null)
        : view === 'restocks' && selectedRestockId !== null
          ? () => setSelectedRestockId(null)
          : undefined

  const backLabel =
    view === 'customers' && selectedCustomerId !== null
      ? 'Back to Customers'
      : view === 'invoices' && selectedInvoiceId !== null
        ? 'Back to Invoices'
        : view === 'restocks' && selectedRestockId !== null
          ? 'Back to Restocks'
          : undefined

  return (
    <Layout view={view} onNavigate={navigate} title={title} onBack={onBack} backLabel={backLabel}>
      <ErrorBoundary key={view}>
      {view === 'dashboard' && (
        <Dashboard
          onOpenInvoice={(id) => {
            setSelectedInvoiceId(id)
            setView('invoices')
          }}
          onOpenPayments={() => setView('payments')}
        />
      )}
      {view === 'products' && <ProductList />}
      {view === 'inventory' && <InventoryList />}
      {view === 'invoices' &&
        (selectedInvoiceId !== null ? (
          <InvoiceDetailPage
            invoiceId={selectedInvoiceId}
            onBack={() => setSelectedInvoiceId(null)}
          />
        ) : (
          <InvoiceList onSelect={(i) => setSelectedInvoiceId(i.id)} />
        ))}
      {view === 'customers' &&
        (selectedCustomerId !== null ? (
          <CustomerDetailPage
            customerId={selectedCustomerId}
            onBack={() => setSelectedCustomerId(null)}
          />
        ) : (
          <CustomerList onSelect={(c) => setSelectedCustomerId(c.id)} />
        ))}
      {view === 'restocks' &&
        (selectedRestockId !== null ? (
          <RestockDetailPage
            restockId={selectedRestockId}
            onBack={() => setSelectedRestockId(null)}
          />
        ) : (
          <RestockList onSelect={(r) => setSelectedRestockId(r.id)} />
        ))}
      {view === 'payments' && <PaymentsList />}
      {view === 'reports' && <ReportsPage />}
      {view === 'settings' && <SettingsPage />}
      {view === 'csv' && <CsvWizard />}
      </ErrorBoundary>
    </Layout>
  )
}