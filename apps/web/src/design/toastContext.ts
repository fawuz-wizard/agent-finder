import { createContext } from 'react'

export interface ToastApi {
  show: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
