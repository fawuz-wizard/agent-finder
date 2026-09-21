import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { AuditEntry } from '@/types/operator'

const PERMISSION_TEXT: Record<string, string> = {
  [PERMISSIONS.viewAgent]: 'See your agents',
  [PERMISSIONS.viewFinancial]: 'Reveal financial detail (recorded)',
  [PERMISSIONS.manageFloat]: 'Decide float requests',
  [PERMISSIONS.viewHistory]: 'See agent history',
  [PERMISSIONS.contact]: 'Contact agents',
  [PERMISSIONS.escalate]: 'Escalate to the super distributor',
}

/** Dealer profile: who you are, what you may do, and every financial reveal you made. */
export default function DealerProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const audit = useAsync<AuditEntry[]>((s) => operatorApi.audit(s))

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">{session?.name}</h1>
        <p className="text-xs text-muted">Dealer</p>
      </header>
      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">What you may do</p>
          {(session?.permissions ?? []).map((p) => (
            <p key={p} className="border-b border-line py-2 text-sm last:border-b-0">
              {PERMISSION_TEXT[p] ?? p}
            </p>
          ))}
          <p className="pt-2 text-xs text-muted">Permissions are named and granted individually. The server checks every request; this list only decides what the app offers.</p>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Your financial reveals</p>
          {audit.state === 'loading' && <p className="py-2 text-sm text-muted">Loading…</p>}
          {(audit.data ?? []).map((a) => (
            <div key={a.id} className="border-b border-line py-2 last:border-b-0">
              <p className="text-sm font-bold">
                {a.field === 'balance' ? 'Balance' : 'Float position'} · {a.agent_ref}
              </p>
              <p className="text-xs text-muted">
                {new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · “{a.purpose}”
              </p>
            </div>
          ))}
          {audit.state === 'ready' && (audit.data ?? []).length === 0 && <p className="py-2 text-sm text-muted">None yet.</p>}
          <p className="pt-2 text-xs text-muted">The record keeps which field you saw and why. It never keeps the amount.</p>
        </Card>

        <Button
          size="cta"
          variant="secondary"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
