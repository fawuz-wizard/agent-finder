/** Distance as the server measured it, formatted for reading at a glance. */
export function DistanceLabel({ metres }: { metres: number }) {
  // Locations are deliberately coarse for the prototype, so a rounded point can
  // produce 0 m even when the customer and shop are not at the exact same spot.
  const text = metres < 50 ? 'Very close' : metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`
  return (
    <span className="shrink-0 text-sm text-muted" aria-label={`${text} away`}>
      {text}
    </span>
  )
}
