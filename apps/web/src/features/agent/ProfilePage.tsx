import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'

function Row({ k, v, action }: { k: string; v: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="text-right text-sm font-bold">{action ?? v}</span>
    </div>
  )
}

/**
 * A5 — Profile. The last card is deliberate: an agent who knows exactly what customers
 * can and cannot see about them declares more honestly.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const { state, data, setData } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])

  async function togglePhone(next: boolean) {
    const updated = await operatorApi.setPhoneVisible(ref, next)
    setData(updated)
  }

  if (state === 'loading' || !data) return <p className="p-4 text-base text-muted">Loading…</p>

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">{data.name}</h1>
        <p className="text-xs text-muted">
          {data.ref}
          {data.verified ? ' · verified' : ''}
        </p>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Business</p>
          <Row k="Shop name" v={data.shop_name} />
          <Row k="Location" v={data.area} />
          <Row k="Hours" v={data.hours_text} />
          <Row
            k="Phone shown to customers"
            v=""
            action={
              <button
                type="button"
                role="switch"
                aria-checked={data.phone_visible}
                aria-label="Phone shown to customers"
                onClick={() => togglePhone(!data.phone_visible)}
                className="-mr-1 flex h-control w-14 items-center justify-center"
              >
                <span className={`block h-7 w-12 rounded-full p-1 transition-colors ${data.phone_visible ? 'bg-brand' : 'bg-line'}`}>
                  <span
                    className={`block h-5 w-5 rounded-full bg-paper shadow transition-transform ${data.phone_visible ? 'translate-x-5' : ''}`}
                  />
                </span>
              </button>
            }
          />
          <p className="pt-2 text-xs text-muted">
            Off by default. Customers only see a number if you turn this on, and calls go straight to your phone —
            this app never places or records them.
          </p>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Your dealer</p>
          <Row k={data.dealer_name} v="" action={<span className="text-brand-text">Contact</span>} />
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Security</p>
          {data.devices.map((d) => (
            <Row
              key={d.id}
              k={d.label}
              v={d.last_seen_text}
              action={d.current ? <span className="text-muted">{d.last_seen_text}</span> : <span className="text-danger">Sign out</span>}
            />
          ))}
        </Card>

        <Card className="border-brand-deep bg-brand-faint">
          <p className="text-base font-bold">What customers see about you</p>
          <p className="mt-1 text-sm text-muted">
            Your shop name, area, distance, whether you can likely handle their request, and when you last updated.
            Never your balance, your float, your capacity words, or anything your dealer sees.
          </p>
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
