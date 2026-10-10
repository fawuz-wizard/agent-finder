import { config } from '@/lib/config'

/** Longest side of the picture the phone sends; a shopfront needs no more. */
export const PHOTO_MAX_SIDE = 1024
export const PHOTO_QUALITY = 0.78

/**
 * Shrink the picture on the phone before it leaves: at most PHOTO_MAX_SIDE on the long side,
 * JPEG, as a data URL. A 12-megapixel shot becomes about 100–150 KB. The phone's own
 * orientation tag is honoured, so a shop photographed upright stays upright.
 */
export async function shrinkPhoto(file: Blob, maxSide = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY): Promise<string> {
  const image = await loadImage(file)
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This phone cannot prepare the picture. Try another one.')
  ctx.drawImage(image, 0, 0, width, height)
  if ('close' in image) image.close()
  return canvas.toDataURL('image/jpeg', quality)
}

async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older WebViews: fall through to an <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('That is not a picture the app can read.'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A picture's address as the API gives it (a path on the API) or as the demo holds it (data). */
export function photoSrc(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith('/') ? `${config.apiBaseUrl}${url}` : url
}
