import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configError } from './lib/supabase'
import Layout from './components/Layout'
import SignIn from './pages/SignIn'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import ComingSoon from './pages/ComingSoon'
import More from './pages/More'
import Users from './pages/Users'
import Security from './pages/Security'
import LockScreen from './components/LockScreen'
import { useLock } from './lib/lock'
import DbGate from './components/DbGate'
import Jobs from './pages/Jobs'
import NewJob from './pages/NewJob'
import JobDetail from './pages/JobDetail'
import { ClientList, ClientDetail } from './pages/Clients'
import SyncLog from './pages/SyncLog'
import PipelineSettings from './pages/PipelineSettings'

export default function App() {
  const { loading, session, profile, recovering } = useAuth()
  const { locked } = useLock()

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
        <Route path="jobs/new" element={<NewJob />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="clients" element={<ClientList />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="diary" element={<ComingSoon title="Diary" phase="Phase 8" />} />
        <Route path="todos" element={<ComingSoon title="To-dos" phase="Phase 8" />} />
        <Route path="more" element={<More />} />
        <Route path="more/users" element={<Users />} />
        <Route path="more/security" element={<Security />} />
        <Route path="more/sync" element={<SyncLog />} />
        <Route path="more/pipeline" element={<PipelineSettings />} />
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
