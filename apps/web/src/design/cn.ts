/** Tiny class-name joiner. No dependency needed for a handful of conditionals. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
