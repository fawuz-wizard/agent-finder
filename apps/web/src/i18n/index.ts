import en from './en.json'

type Key = keyof typeof en

/** Minimal string lookup; Krio strings arrive as krio.json with the same keys. */
export function t(key: Key): string {
  return en[key]
}
