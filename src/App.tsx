import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configError } from './lib/supabase'
import Layout from './components/Layout'
import SignIn from './pages/SignIn'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import ComingSoon from './pages/ComingSoon'
import More from './pages/More'

export default function App() {
  const { loading, session, profile, recovering } = useAuth()

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

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="jobs/*" element={<ComingSoon title="Jobs" phase="Phase 1b" />} />
        <Route path="diary" element={<ComingSoon title="Diary" phase="Phase 8" />} />
        <Route path="todos" element={<ComingSoon title="To-dos" phase="Phase 8" />} />
        <Route path="more" element={<More />} />
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
