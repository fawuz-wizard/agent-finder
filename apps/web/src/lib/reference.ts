/**
 * Product reference data that is NOT demo data: the outcome reasons the report form offers.
 * The customer's place is never a fixed list: it is the phone's position, or a place they
 * searched on the map.
 *
 * This lives outside `services/` so the home screen never pulls the demo network (or the API
 * client) into its chunk. In live mode the reason list should come from the server with the
 * search/report contract; until then this is the single client-side copy.
 */

export const OUTCOME_REASONS = [
  { code: 'could_not_complete', label: 'Agent could not complete the transaction' },
  { code: 'less_than_requested', label: 'Agent had less than requested' },
  { code: 'charged_extra', label: 'Agent charged extra on top of the official fee' },
  { code: 'refused_small', label: 'Agent refused to serve a small amount' },
  { code: 'closed', label: 'Agent was closed' },
  { code: 'unavailable', label: 'Agent was unavailable' },
  { code: 'other', label: 'Other' },
] as const
