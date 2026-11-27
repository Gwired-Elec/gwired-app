import { NavLink, Outlet } from 'react-router-dom'
import { useOnline } from '../lib/online'

const TABS = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/jobs', label: 'Jobs', icon: '▤' },
  { to: '/diary', label: 'Diary', icon: '▦' },
  { to: '/todos', label: 'To-dos', icon: '✓' },
  { to: '/more', label: 'More', icon: '≡' },
]

// Phone: bottom tab bar. iPad / desktop (>= 768px): left sidebar. Same links, CSS decides which shows.
export default function Layout() {
  const online = useOnline()
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
      </aside>
      <div className="main">
        <header className="top">
          <span className="topbrand">G | WIRED</span>
          {/* Real sync states (syncing / waiting / error) arrive with the sync engine in Phase 1b. */}
          <span className={'pill ' + (online ? 'good' : 'warn')}>{online ? '✓ Online' : '⚠ Offline'}</span>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
