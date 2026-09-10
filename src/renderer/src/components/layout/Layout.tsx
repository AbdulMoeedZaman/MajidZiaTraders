import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import type { AppView } from './nav'

interface LayoutProps {
  view: AppView
  onNavigate: (view: AppView) => void
  title?: string
  onBack?: () => void
  backLabel?: string
  children: ReactNode
}

export function Layout({ view, onNavigate, title, onBack, backLabel, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar current={view} onNavigate={onNavigate} />
      <div className="app-main">
        <Header view={view} title={title} onBack={onBack} backLabel={backLabel} />
        <main className="content">{children}</main>
      </div>
    </div>
  )
}