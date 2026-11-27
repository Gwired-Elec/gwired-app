import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configError } from './lib/supabase'
import Layout from './components/Layout'
import SignIn from './pages/SignIn'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import XeroSettings from './pages/XeroSettings'
import TodosPage from './pages/planner/Todos'
import DiaryPage from './pages/planner/Diary'
import More from './pages/More'
import Users from './pages/Users'
import CompanyDetails from './pages/CompanyDetails'
import Security from './pages/Security'
import Help from './pages/Help'
import QuotePortal from './pages/QuotePortal'
import LockScreen from './components/LockScreen'
import { useLock } from './lib/lock'
import DbGate from './components/DbGate'
import Jobs from './pages/Jobs'
import NewJob from './pages/NewJob'
import JobDetail from './pages/JobDetail'
import { ClientList, ClientDetail } from './pages/Clients'
import SyncLog from './pages/SyncLog'
import PipelineSettings from './pages/PipelineSettings'
import EstHub from './pages/estimating/Hub'
import Clauses from './pages/estimating/Clauses'
import { MaterialList, MaterialDetail } from './pages/estimating/Materials'
import ImportPrices from './pages/estimating/Import'
import { Suppliers, LabourRates, PointRates, Prelims, Defaults } from './pages/estimating/Rates'
import { AssemblyList, AssemblyDetail } from './pages/estimating/Assemblies'

export default function App() {
  const { loading, session, profile, recovering } = useAuth()
  const { locked } = useLock()
  const loc = useLocation()

  // the client's quote link: public, no sign-in, never touches the staff app
  const q = /^\/q\/([0-9a-f]{32,128})\/?$/.exec(loc.pathname)
  if (q) return <QuotePortal token={q[1]} preview={new URLSearchParams(loc.search).get('p') === '1'} />

  if (configError) return <div className="centre"><div className="card"><h1>Setup needed</h1><p>{configError}</p></div></div>
  if (loading) return <div className="centre"><p className="muted">Loading…</p></div>
  if (recovering) return <ResetPassword />

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (!profile || !profile.active) {
    return <NoAccess hasProfile={!!profile} />
  }

  // the local database opens (and syncing starts) even while the app is locked: the lock only hides the screen
  return (
    <DbGate>
      {locked ? <LockScreen /> : <AppRoutes />}
    </DbGate>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/archive" element={<Jobs archive />} />
        <Route path="jobs/new" element={<NewJob />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="clients" element={<ClientList />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="diary" element={<DiaryPage />} />
        <Route path="todos" element={<TodosPage />} />
        <Route path="more" element={<More />} />
        <Route path="more/users" element={<Users />} />
        <Route path="more/dashboard" element={<Dashboard />} />
        <Route path="more/xero" element={<XeroSettings />} />
        <Route path="more/company" element={<CompanyDetails />} />
        <Route path="more/security" element={<Security />} />
        <Route path="more/help" element={<Help />} />
        <Route path="more/sync" element={<SyncLog />} />
        <Route path="more/pipeline" element={<PipelineSettings />} />
        <Route path="more/estimating" element={<EstHub />} />
        <Route path="more/estimating/materials" element={<MaterialList />} />
        <Route path="more/estimating/materials/:id" element={<MaterialDetail />} />
        <Route path="more/estimating/import" element={<ImportPrices />} />
        <Route path="more/estimating/suppliers" element={<Suppliers />} />
        <Route path="more/estimating/labour" element={<LabourRates />} />
        <Route path="more/estimating/points" element={<PointRates />} />
        <Route path="more/estimating/prelims" element={<Prelims />} />
        <Route path="more/estimating/defaults" element={<Defaults />} />
        <Route path="more/estimating/clauses" element={<Clauses />} />
        <Route path="more/estimating/assemblies" element={<AssemblyList />} />
        <Route path="more/estimating/assemblies/:id" element={<AssemblyDetail />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function NoAccess({ hasProfile }: { hasProfile: boolean }) {
  const { signOut } = useAuth()
  return (
    <div className="centre">
      <div className="card">
        <h1>No access</h1>
        <p>{hasProfile ? 'Your account has been switched off.' : "Your account isn't set up in G|Wired yet."} Ask the owner to invite you.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
