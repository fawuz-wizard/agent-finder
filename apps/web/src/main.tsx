import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/design/tokens.css'
import { AppRouter } from '@/app/router'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'

// Phones that got an earlier APK registered a service worker from the PWA setup. Inside the
// shell it is only a source of stale chunks, so remove it (and its caches) once, on launch.
const native = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
if (native && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister())))
  if ('caches' in window) void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    </ToastProvider>
  </StrictMode>,
)
