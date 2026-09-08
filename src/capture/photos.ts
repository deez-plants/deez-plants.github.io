import type { DeezDB, MediaRecord } from '../db/schema';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import type { ClockTime, ISODate, MediaId, PlantId } from '../types/ids';
import type { MediaLabel } from '../types/plant';

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

/* -------------------------------------------------------------------------- */
/* Capture — one tap, one label. Section 6b: never a text field.               */
/* -------------------------------------------------------------------------- */

/** `NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg` (section 6b) — `NN` disambiguates more
    than one photo of the same plant on the same day, which the seed's own
    single-photo-per-plant import never has to. */
async function mintMediaId(db: DeezDB, plant_id: PlantId, date: ISODate, time: ClockTime): Promise<MediaId> {
  const existing = await db.getAllFromIndex('media', 'by-plant', plant_id);
  const n = existing.filter((m) => m.date === date).length + 1;
  return `${plant_id}_${date}_${time.replace(':', '')}_${String(n).padStart(2, '0')}.jpg` as MediaId;
}

/**
 * Stores the photo (full image and thumbnail, both as Blobs — section 6b's
 * "on iOS, the bytes," since there is no synced folder for this device to
 * hand the full-size file off to yet) and logs the `Photo` care event in the
 * same call, so a photo is never captured without becoming part of the
 * record: the two writes are what "captured" means here.
 */
export async function capturePhoto(
  db: DeezDB,
  plant_id: PlantId,
  file: Blob,
  label: MediaLabel,
  as_of: ISODate,
): Promise<MediaId> {
  const time = nowClockTime();
  const [thumb, media_id, device_id] = await Promise.all([
    makeThumbnail(file),
    mintMediaId(db, plant_id, as_of, time),
    deviceId(db),
  ]);

  const record: MediaRecord = {
    media_id, plant_id, date: as_of, labels: [label], shared_frame: false, blob: file, thumb,
  };
  await db.put('media', record);

  await appendEvents(db, [{
    event_id: mintEventId(device_id, as_of, time),
    plant_id,
    type: 'Photo',
    date: as_of,
    time,
    media: [media_id],
    media_labels: [label],
    source: 'user',
    device_id,
  }]);

  return media_id;
}
