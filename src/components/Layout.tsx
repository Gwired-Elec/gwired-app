import { NavLink, Outlet } from 'react-router-dom'
import SyncIndicator from './SyncIndicator'
import { useAuth } from '../lib/auth'
import { useXeroAutoCheck } from '../lib/xero/xero'
import { useStarterCleanup } from '../lib/planner/starterCleanup'

const TABS = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/jobs', label: 'Jobs', icon: '▤' },
  { to: '/diary', label: 'Diary', icon: '▦' },
  { to: '/todos', label: 'To-dos', icon: '✓' },
  { to: '/more', label: 'More', icon: '≡' },
]

// Phone: bottom tab bar. iPad / desktop (>= 768px): left sidebar. Same links, CSS decides which shows.
export default function Layout() {
  const { can } = useAuth()
  useXeroAutoCheck(can('estimates.edit'))
  useStarterCleanup(can('todos'))
  return (
    <div className="shell">
      <aside className="side" aria-label="Main">
        <div className="brand">G | WIRED<span>ELECTRICAL SERVICES</span></div>
        <nav>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="tab">
              <span className="ico" aria-hidden>{t.icon}</span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidesync"><SyncIndicator /></div>
      </aside>
      <div className="main">
        <header className="top">
          <span className="topbrand">G | WIRED</span>
          <SyncIndicator />
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
