/** The Open Door mark: ink frame open on the right, orange dot arriving at the gap. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden className={className}>
      <path d="M20 4H8a4 4 0 00-4 4v12a4 4 0 004 4h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 8v3M24 17v3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="14" r="3" className="fill-brand" />
    </svg>
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
