import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/design/tokens.css'
import { AppRouter } from '@/app/router'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    </ToastProvider>
  </StrictMode>,
)
