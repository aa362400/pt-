import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import ErrorBoundary from './components/ui/ErrorBoundary.tsx'
import './i18n/index.ts'
import { I18nProvider } from './i18n/I18nProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
