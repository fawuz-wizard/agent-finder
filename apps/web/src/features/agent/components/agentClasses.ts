/** Class strings measured from the approved agent design ("agent platform.html"), shared by its screens. */
export const BODY = 'flex flex-1 flex-col gap-3.5 px-[18px] pb-8 text-finder-ink'
export const BOX = 'rounded-[14px] border border-finder-card-line bg-finder-card'
export const FIELD = 'flex h-14 items-center gap-2 rounded-[14px] border-[1.5px] border-agent-field-line bg-finder-card px-4 focus-within:border-finder-accent'
export const PRIMARY = 'flex h-14 w-full items-center justify-center rounded-[14px] bg-finder-accent text-[15px] font-bold text-finder-on-orange transition-transform duration-150 active:scale-[0.98] disabled:opacity-55'
export const OUTLINE = 'flex h-[54px] w-full items-center justify-center rounded-[14px] border-[1.5px] border-finder-accent bg-finder-card text-[15px] font-bold text-finder-link transition-transform duration-150 active:scale-[0.98]'
export function chip(on: boolean) {
  return `flex h-[34px] shrink-0 items-center rounded-[20px] border px-3.5 text-xs font-semibold transition-colors ${on ? 'border-finder-accent bg-finder-accent text-finder-on-orange' : 'border-agent-field-line bg-agent-chip text-agent-chip-ink'}`
}
