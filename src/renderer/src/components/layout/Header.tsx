import type { AppView } from './nav'
import { VIEW_TITLES } from './nav'

interface HeaderProps {
  view: AppView
  title?: string
  onBack?: () => void
  backLabel?: string
}

export function Header({ view, title, onBack, backLabel }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        {onBack && (
          <button className="btn ghost back-btn" onClick={onBack}>
            ← {backLabel ?? 'Back'}
          </button>
        )}
        <h2>{title ?? VIEW_TITLES[view]}</h2>
      </div>
    </header>
  )
}