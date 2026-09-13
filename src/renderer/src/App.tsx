import { useState } from 'react'
import { Layout } from './components/layout/Layout'
import type { AppView } from './components/layout/nav'
import { InvoiceList } from './features/invoices/components/InvoiceList'
import { InvoiceDetailPage } from './features/invoices/components/InvoiceDetailPage'
import { InvoiceFormPage } from './features/invoices/components/InvoiceFormPage'
import { CustomerList } from './features/customers/components/CustomerList'
import { CustomerDetailPage } from './features/customers/components/CustomerDetailPage'
import { ProductList } from './features/products/components/ProductList'
import { ProductDetailPage } from './features/products/components/ProductDetailPage'
import { SettingsPage } from './features/settings/components/SettingsPage'
import { DashboardPage } from './features/dashboard/components/DashboardPage'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  const [view, setView] = useState<AppView>('invoices')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [customerDetailId, setCustomerDetailId] = useState<number | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [invoiceDraft, setInvoiceDraft] = useState<{ open: boolean; customerId: number | null }>({
    open: false,
    customerId: null,
  })

  const navigate = (next: AppView) => {
    setView(next)
    setSelectedInvoiceId(null)
    setCustomerDetailId(null)
    setSelectedProductId(null)
    setInvoiceDraft({ open: false, customerId: null })
  }

  const openNewInvoice = (customerId: number | null) => {
    setSelectedInvoiceId(null)
    setCustomerDetailId(null)
    setSelectedProductId(null)
    setView('invoices')
    setInvoiceDraft({ open: true, customerId })
  }

  const title =
    view === 'invoices' && selectedInvoiceId !== null
      ? 'Invoice'
      : view === 'invoices' && invoiceDraft.open
        ? 'New Invoice'
        : view === 'customers' && customerDetailId !== null
          ? 'Customer Details'
          : view === 'products' && selectedProductId !== null
            ? 'Product Details'
            : undefined

  const headers: Array<{ cond: boolean; label: string; back: () => void }> = [
    {
      cond: view === 'invoices' && selectedInvoiceId !== null,
      label: 'Back to Invoices',
      back: () => setSelectedInvoiceId(null),
    },
    {
      cond: view === 'invoices' && invoiceDraft.open,
      label: 'Back to Invoices',
      back: () => setInvoiceDraft({ open: false, customerId: null }),
    },
    {
      cond: view === 'customers' && customerDetailId !== null,
      label: 'Back to Customers',
      back: () => setCustomerDetailId(null),
    },
    {
      cond: view === 'products' && selectedProductId !== null,
      label: 'Back to Products',
      back: () => setSelectedProductId(null),
    },
  ]
  const header = headers.find((h) => h.cond)

  return (
    <Layout
      view={view}
      onNavigate={navigate}
      title={title}
      onBack={header?.back}
      backLabel={header?.label}
    >
      <ErrorBoundary key={`${view}-${selectedInvoiceId}-${selectedProductId}-${customerDetailId}-${invoiceDraft.open}`}>
        {view === 'invoices' &&
          (selectedInvoiceId !== null ? (
            <InvoiceDetailPage
              invoiceId={selectedInvoiceId}
              onBack={() => setSelectedInvoiceId(null)}
            />
          ) : invoiceDraft.open ? (
            <InvoiceFormPage
              preselectCustomerId={invoiceDraft.customerId}
              onCreated={(id) => {
                setInvoiceDraft({ open: false, customerId: null })
                setSelectedInvoiceId(id)
              }}
            />
          ) : (
            <InvoiceList
              onOpen={(id) => setSelectedInvoiceId(id)}
              onNewInvoice={() => setInvoiceDraft({ open: true, customerId: null })}
            />
          ))}

        {view === 'customers' &&
          (customerDetailId !== null ? (
            <CustomerDetailPage
              customerId={customerDetailId}
              onBack={() => setCustomerDetailId(null)}
              onNewInvoice={(customerId) => openNewInvoice(customerId)}
              onOpenInvoice={(invoiceId) => { setCustomerDetailId(null); setView('invoices'); setSelectedInvoiceId(invoiceId) }}
            />
          ) : (
            <CustomerList
              onSelect={(c) => setCustomerDetailId(c.id)}
              onNewInvoice={(customerId) => openNewInvoice(customerId)}
            />
          ))}

        {view === 'products' &&
          (selectedProductId !== null ? (
            <ProductDetailPage
              productId={selectedProductId}
              onBack={() => setSelectedProductId(null)}
            />
          ) : (
            <ProductList onOpen={(id) => setSelectedProductId(id)} />
          ))}
        {view === 'dashboard' && <DashboardPage onNavigate={setView} />}
        {view === 'settings' && <SettingsPage />}
      </ErrorBoundary>
    </Layout>
  )
}