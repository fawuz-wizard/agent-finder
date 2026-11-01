/**
 * The aggregator's own picture, kept on this phone so Home shows it at once instead of the
 * initials first. Small (a 256 px avatar); the server's answer always replaces it.
 */
const KEY = 'af.dealerPhoto'

export function readDealerPhoto(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function keepDealerPhoto(photo: string | null | undefined): void {
  try {
    if (photo) localStorage.setItem(KEY, photo)
    else localStorage.removeItem(KEY)
  } catch {
    // Fine without it: Home shows the initials until the answer comes.
  }
}
