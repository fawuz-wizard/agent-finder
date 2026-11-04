/** Up to two letters from the shop's name: "Aminata Kamara Shop" → "AK". */
export function initialsOf(name: string): string {
  const words = name.replace(/['’]s\b/g, '').split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w))
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}
