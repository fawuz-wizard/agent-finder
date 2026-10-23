import markUrl from './agent-finder-mark.png'

/** The Agent Finder mark: the orange A with the agent magnifier, on its black tile. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const rem = size / 16
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center bg-black ${className ?? ''}`}
      style={{ width: `${rem}rem`, height: `${rem}rem`, borderRadius: `${rem * 0.23}rem` }}
    >
      <img src={markUrl} alt="" draggable={false} style={{ width: '78%', height: 'auto' }} />
    </span>
  )
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight text-ink" style={{ fontSize: size * 0.64 }}>
      <LogoMark size={size} />
      Agent Finder
    </span>
  )
}
