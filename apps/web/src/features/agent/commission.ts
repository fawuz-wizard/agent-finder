import type { TransactionBand } from '@/types/operator'

/**
 * What an agent earns per transaction, for the demo network. The same INDICATIVE table as
 * apps/api/app/services/commission.py: a flat commission per amount band in new Leones.
 * Orange's official tariff replaces both the moment the team has it.
 */
export const TARIFF_NOTE = "Indicative tariff. Orange's official schedule replaces these figures."

const BANDS: { upper: number | null; cash_out: number; deposit: number }[] = [
  { upper: 500, cash_out: 10, deposit: 6 },
  { upper: 2_000, cash_out: 25, deposit: 15 },
  { upper: 5_000, cash_out: 50, deposit: 30 },
  { upper: 10_000, cash_out: 90, deposit: 55 },
  { upper: 50_000, cash_out: 180, deposit: 110 },
  { upper: null, cash_out: 300, deposit: 180 },
]
const BAND_KEYS: TransactionBand[] = ['≤500', '≤2k', '≤5k', '≤10k', '≤50k', '>50k']

export function commissionFor(transaction: 'cash_out' | 'deposit', amountSle: number): number {
  const band = BANDS.find((b) => b.upper === null || amountSle <= b.upper) ?? BANDS[BANDS.length - 1]!
  return band[transaction]
}

export function commissionForBand(transaction: 'cash_out' | 'deposit', band: TransactionBand): number {
  const i = BAND_KEYS.indexOf(band)
  return BANDS[i === -1 ? BANDS.length - 1 : i]![transaction]
}
