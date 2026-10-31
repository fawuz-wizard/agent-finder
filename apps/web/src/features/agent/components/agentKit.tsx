import type { ReactNode } from 'react'
import { useBack } from '@/hooks/useBack'
import { ArrowLeft } from 'lucide-react'

/**
 * The agent app's pieces from the approved agent design ("agent platform.html", 2026-10-29):
 * the title row (back arrow, 19 px title, 22 px sides), and outline icons at 1.8 stroke.
 */
export function AgentTitle({ title, back = '/agent', action }: { title: string; back?: string; action?: ReactNode }) {
  const goBack = useBack(back)
  return (
    <div className="flex items-center gap-[18px] px-[22px] pb-1 pt-7 text-finder-ink">
      <button type="button" aria-label="Back" onClick={goBack} className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center">
        <ArrowLeft size={22} strokeWidth={2} aria-hidden />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold">{title}</h1>
      {action}
    </div>
  )
}

