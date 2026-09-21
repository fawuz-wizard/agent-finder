import type { StatusKind } from './StatusDot'

export const statusLabel: Record<StatusKind, string> = {
  fresh: 'Fresh',
  limited: 'Limited',
  ageing: 'Ageing',
  expired: 'Expired',
  hidden: 'Hidden',
  closed: 'Closed',
  notset: 'Not set',
}
