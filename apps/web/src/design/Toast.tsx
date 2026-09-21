import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

interface ToastState { id: number; message: string }

/** Success confirmations only (1.5 s). Errors are never toasts; they persist inline. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const show = useCallback((message: string) => setToast({ id: Date.now(), message }), [])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1500)
    return () => window.clearTimeout(t)
  }, [toast])
  const api = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-5 z-50 flex h-chip items-center justify-center gap-2 rounded-card bg-ink text-sm font-semibold text-canvas"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

