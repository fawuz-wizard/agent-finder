/** Display helpers for operator-owned amounts. Formatting only — nothing is stored here. */
export function formatSle(amount: number): string {
  return `SLE ${amount.toLocaleString('en-US')}`
}
