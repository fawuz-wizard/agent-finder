import type { OperatorValue as Value } from '@/types/operator'
import { formatSle } from '../money'

function readTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * An operator-owned number, always shown with where it came from and when it was read.
 * When the adapter is not connected the value is absent and we say so — we never invent
 * a financial figure, and we never store one.
 */
export function OperatorValueRow({ label, value, big = false }: { label: string; value: Value | null; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      {value ? (
        <span className="text-right">
          <span className={big ? 'block text-2xl font-bold' : 'block text-base font-bold'}>
            {formatSle(value.amount_sle)}
          </span>
          <span className="text-xs font-semibold text-muted">
            from {value.source} · {readTime(value.read_at)}
          </span>
        </span>
      ) : (
        <span className="text-right text-sm font-semibold text-muted">Not connected</span>
      )}
    </div>
  )
}
