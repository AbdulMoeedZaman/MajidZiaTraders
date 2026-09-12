import { NAV_ITEMS, AppView } from './nav'

interface SidebarProps {
  current: AppView
  onNavigate: (view: AppView) => void
}

export function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">▤</span>
        <span>MZTraders</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${current === item.key ? 'active' : ''}`}
            onClick={() => item.enabled && onNavigate(item.key)}
            disabled={!item.enabled}
            title={item.enabled ? item.label : `${item.label} (coming soon)`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer muted">Parts invoicing</div>
    </aside>
  )
}