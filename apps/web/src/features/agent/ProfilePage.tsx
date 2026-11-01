import { Link, useNavigate } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { Icon } from './components/agentIcons'
import { BOX, OUTLINE } from './components/agentClasses'

const ROWS = [
  { to: '/agent/profile/personal', label: 'Personal Information', icon: Icon.user },
  { to: '/agent/settings', label: 'Change PIN', icon: Icon.lock },
  { to: '/agent/settings', label: 'Notification Settings', icon: Icon.bell },
  { to: '/agent/help', label: 'Help & Support', icon: Icon.help },
  { to: '/agent/about', label: 'About', icon: Icon.info },
] as const

/**
 * Profile, the new design's screen 13: who is signed in, five rows that each open a page (the
 * design's › arrows), and Log Out. The shop's photo, pin and hours are on Your shop, from
 * Service Status → Update Location.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const ref = session?.ref ?? 'Agent 024'
  const { data } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const name = data?.name ?? session?.name ?? ''
  const two = name.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Profile" />
      <div className="flex items-center gap-4 px-[22px] pb-[22px] pt-[26px]">
        <span aria-hidden="true" className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-agent-avatar text-xl font-bold text-agent-avatar-ink">
          {data?.photo ? <img src={data.photo} alt="" className="h-full w-full object-cover" /> : two}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="truncate text-lg font-bold">{name}</h2>
          <span className="self-start rounded-[20px] bg-agent-pill px-2.5 py-[3px] text-[11px] font-bold text-agent-pill-ink">Agent</span>
        </div>
      </div>

      <nav aria-label="Profile" className={`${BOX} mx-[18px] flex flex-col overflow-hidden`}>
        {ROWS.map((r, k) => (
          <Link key={r.label} to={r.to} className={`flex h-14 w-full items-center gap-3.5 px-4 text-left text-sm font-semibold transition-colors active:bg-agent-curve ${k ? 'border-t border-agent-divider' : ''}`}>
            <span className="text-agent-chip-ink">{r.icon()}</span>
            <span className="flex-1">{r.label}</span>
            <span className="text-finder-muted">{Icon.chevron(16)}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-[18px] pb-10 pt-8">
        <button
          type="button"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
          className={OUTLINE}
        >
          Log Out
        </button>
      </div>
    </div>
  )
}
