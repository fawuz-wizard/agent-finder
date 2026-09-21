/** Distance as the server measured it, formatted for reading at a glance. */
export function DistanceLabel({ metres }: { metres: number }) {
  const text = metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`
  return (
    <span className="shrink-0 text-sm text-muted" aria-label={`${text} away`}>
      {text}
    </span>
  )
}
