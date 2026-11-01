import { AgentTitle } from './components/agentKit'
import { BOX } from './components/agentClasses'
import pkg from '../../../package.json'

/** About, from Profile: what the app is, its version, and the one promise about money. */
export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="About" back="/agent/profile" />
      <div className="flex flex-col gap-3 px-[18px] pb-8 pt-5">
        <div className={`${BOX} px-4 py-4`}>
          <p className="text-sm font-bold">Agent Finder · Agent App</p>
          <p className="text-[13px] text-finder-muted">Pilot build {pkg.version}</p>
          <p className="mt-2 text-[13px] text-finder-muted">Customers find agents who can likely serve them. Your balance is never shown to anyone.</p>
        </div>
      </div>
    </div>
  )
}
