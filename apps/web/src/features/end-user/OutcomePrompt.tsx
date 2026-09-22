import { useState } from 'react'
import { Sheet } from '@/design'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import { OutcomeForm } from './OutcomeForm'

/**
 * Asks for the outcome on the next visit to the home screen, at least 15 minutes after the
 * customer said they were going. Asked once per visit: answering, skipping or closing the
 * sheet all end it, and simply looking at a map never starts it.
 */
export function OutcomePrompt() {
  const { visit, due, clear } = usePendingVisit()
  const [open, setOpen] = useState(true)
  if (!visit || !due || !open) return null

  return (
    <Sheet
      open
      onClose={() => {
        clear()
        setOpen(false)
      }}
      title={`Did it work at ${visit.agentName}?`}
    >
      <OutcomeForm
        embedded
        agentId={visit.agentId}
        agentName={visit.agentName}
        transaction={visit.transaction}
        amount={visit.amount}
        source="search"
        onDone={() => {
          clear()
          setOpen(false)
        }}
        onSkip={() => {
          clear()
          setOpen(false)
        }}
      />
    </Sheet>
  )
}
