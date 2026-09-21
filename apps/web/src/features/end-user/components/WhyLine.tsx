/** The server's explanation of why this result leads, or why a nearer one may not serve. */
export function WhyLine({ text, tone = 'why' }: { text: string; tone?: 'why' | 'note' }) {
  if (tone === 'note') return <p className="text-sm italic text-muted">{text}</p>
  return (
    <p className="flex gap-2 rounded-card bg-brand-faint px-3 py-2 text-sm text-ink">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 shrink-0 text-brand-deep">
        <path d="M8 1.5l1.9 4 4.4.6-3.2 3.1.8 4.3L8 11.5l-3.9 2 .8-4.3L1.7 6.1l4.4-.6z" fill="currentColor" />
      </svg>
      <span>{text}</span>
    </p>
  )
}
