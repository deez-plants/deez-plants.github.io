/**
 * Thumbnails. Section 6b: generated at import, same as at capture — so the seed
 * and the camera go through this one function and there is no second path.
 */

/** Longest edge. Comfortably retina for a list row or a detail header. */
export const THUMB_MAX_EDGE = 512;
const THUMB_QUALITY = 0.8;

/**
 * iPhone photos are stored unrotated with an EXIF orientation tag. Asking for
 * `from-image` applies it, so a portrait shot does not land on its side in the
 * plants list. Not every engine honours the option, hence the retry.
 */
async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(blob);
  }
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('thumbnail: no 2d context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: THUMB_QUALITY });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('thumbnail: no 2d context');
  ctx.drawImage(bitmap, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('thumbnail: toBlob returned null'))),
      'image/jpeg',
      THUMB_QUALITY,
    );
  });
}

/** Scaled to fit `maxEdge`, never enlarged. Aspect ratio preserved. */
export async function makeThumbnail(blob: Blob, maxEdge = THUMB_MAX_EDGE): Promise<Blob> {
  const bitmap = await decode(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    return await encode(bitmap, width, height);
  } finally {
    bitmap.close();
  }
}
