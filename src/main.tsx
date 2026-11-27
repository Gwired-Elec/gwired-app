import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { LockProvider } from './lib/lock'
import './styles.css'
import { installSelectOnFocus } from './lib/selectOnFocus'

installSelectOnFocus()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LockProvider>
          <App />
        </LockProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
