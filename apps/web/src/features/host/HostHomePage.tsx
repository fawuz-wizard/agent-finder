import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import frame from './frame.html?raw'
import './host-frame.css'
import { config } from '@/lib/config'
import { setOperatorFeedDemo } from '@/services/customerApi'

/**
 * Demo host shell — the operator super-app home, from the design export the team
 * supplied (a fixed 440×956 frame, scaled to the viewport). It exists only to show
 * where Agent Finder sits once embedded; integration does not exist before the
 * competition.
 *
 * A simulation, not a service: there is no sign-in, transfer or payment control, the
 * figures are the export's placeholders, the code block encodes a placeholder string,
 * and a standing notice says so. The frame is used exactly as exported.
 * The only working control is the Agent Finder banner.
 */

const FRAME_W = 440
const FRAME_H = 956
// The banner's box in the export's coordinate space.
const BANNER = { left: 13, top: 601, width: 414, height: 210 }

export default function HostHomePage() {
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [feed, setFeed] = useState(config.operatorFeed)

  function toggleFeed(on: boolean) {
    setFeed(on)
    setOperatorFeedDemo(on)
  }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(Math.min(1, (el.clientWidth || FRAME_W) / FRAME_W))
    fit()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit)
      return () => window.removeEventListener('resize', fit)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="host-frame mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-[#1E1E1E] text-white">
      <p className="bg-night px-4 py-1.5 text-center text-[11px] font-semibold text-night-text" role="note">
        Demo — simulated host app · placeholder data · not a live service
      </p>

      <div ref={box} className="viewport relative" style={{ height: FRAME_H * scale }}>
        <div
          className="screen"
          style={{ transform: `scale(${scale})` }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: frame }}
        />
        {/* The one live control, laid over the banner in the same coordinate space. */}
        <button
          type="button"
          onClick={() => navigate('/find?from=host')}
          aria-label="Agent Finder"
          className="absolute rounded-[7px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          style={{
            left: BANNER.left * scale,
            top: BANNER.top * scale,
            width: BANNER.width * scale,
            height: BANNER.height * scale,
            background: 'transparent',
          }}
        />
      </div>

      {!config.useLiveApi && (
        <label className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-white/15 px-3 py-2 text-left text-xs text-white/80">
          <span>
            <span className="block font-bold text-white">Orange Money feed (demo)</span>
            {feed
              ? 'On — capacity is read from transactions; agents are never asked to refresh.'
              : 'Off — agents declare their own capacity and confirm it when asked.'}
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={feed}
            aria-label="Orange Money feed (demo)"
            checked={feed}
            onChange={(e) => toggleFeed(e.target.checked)}
            className="h-6 w-6 shrink-0"
          />
        </label>
      )}
      <p className="px-4 pb-2 pt-3 text-center text-[10.5px] leading-snug text-white/40">
        Only the Agent Finder banner is active in this demo — everything else is a placeholder.{' '}
        <Link to="/find" className="underline">
          Skip to Agent Finder
        </Link>
      </p>
    </div>
  )
}
