import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { BOX, PRIMARY } from './components/agentClasses'

/** Help & Support, from Profile: the agent's aggregator, and a call when their number is on file. */
export default function HelpPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const { data } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Help & Support" back="/agent/profile" />
      <div className="flex flex-col gap-3 px-[18px] pb-8 pt-5">
        <div className={`${BOX} px-4 py-4`}>
          <p className="text-sm font-bold">Your aggregator: {data?.dealer_name || '…'}</p>
          <p className="mt-1 text-[13px] text-finder-muted">For float, a wrong record, a forgotten PIN or the map pin, ask your aggregator. They can call you from their app and fix your record with Orange.</p>
        </div>
        {data?.dealer_call_url && (
          <a href={data.dealer_call_url} className={PRIMARY}>
            Call {data.dealer_name}
          </a>
        )}
      </div>
    </div>
  )
}
