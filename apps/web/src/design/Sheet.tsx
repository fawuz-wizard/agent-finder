import { useEffect, type ReactNode } from 'react'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** Bottom sheet: one question, two or three buttons. Escape/scrim closes. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button aria-label="Close" className="absolute inset-0 bg-ink/35" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-sheet bg-paper px-4 pb-6 pt-5 shadow-sheet"
      >
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
