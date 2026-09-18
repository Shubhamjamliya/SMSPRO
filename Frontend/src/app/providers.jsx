import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { Toaster as HotToaster } from 'react-hot-toast'
import { StrictMode, useEffect } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { store } from './store'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@core/context/AuthContext'
import { SettingsProvider } from '@core/context/SettingsContext'
import { ToastProvider } from '@shared/components/ui/Toast'
import { consumeAuthFlashMessage } from '@core/utils/sessionExpiry'
import AppErrorBoundary from '@shared/components/AppErrorBoundary'
import { NetworkStatusBanner } from '@shared/components/NetworkStatusBanner'

// A 401 handler may redirect to a login page via a hard navigation (window.location.href),
// which unmounts the app before a toast shown at that moment would be visible. It stashes a
// message in sessionStorage instead; this picks it up once the app remounts on the new page.
function AuthFlashMessage() {
  useEffect(() => {
    const message = consumeAuthFlashMessage()
    if (message) {
      toast.error(message)
    }
  }, [])
  return null
}

function shouldUseHashRouter() {
  if (typeof window === 'undefined') return false

  const protocol = String(window.location?.protocol || '').toLowerCase()
  const userAgent = String(window.navigator?.userAgent || '').toLowerCase()

  return (
    Boolean(window.flutter_inappwebview) ||
    Boolean(window.ReactNativeWebView) ||
    protocol === 'file:' ||
    userAgent.includes(' wv') ||
    userAgent.includes('; wv')
  )
}

export function AppProviders({ children }) {
  const Router = shouldUseHashRouter() ? HashRouter : BrowserRouter

  return (
    <StrictMode>
      <ThemeProvider 
        attribute="class" 
        defaultTheme="light" 
        storageKey="appTheme"
        enableSystem={false}
      >
        <AppErrorBoundary>
          <AuthProvider>
            <SettingsProvider>
              <ToastProvider>
                <ReduxProvider store={store}>
                  <Router>
                    <NetworkStatusBanner />
                    <AuthFlashMessage />
                    {children}
                    <Toaster position="top-center" richColors offset="80px" />
                    <HotToaster position="top-center" reverseOrder={false} />
                  </Router>
                </ReduxProvider>
              </ToastProvider>
            </SettingsProvider>
          </AuthProvider>
        </AppErrorBoundary>
      </ThemeProvider>
    </StrictMode>
  )
}
