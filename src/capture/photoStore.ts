import type { DeezDB, MediaRecord } from '../db/schema';
import type { DerivedPlant } from '../types/derived';
import type { MediaId } from '../types/ids';

/**
 * Keeping photographs, and getting rid of the ones that are only taking up
 * room.
 *
 * ## Why this is not automatic
 *
 * The owner, 2026-10-01: "we do NOT want manual curation of every photo."
 * Agreed — but the opposite, an app that decides on its own which
 * photographs are worth keeping, is worse. A photograph is the only evidence
 * in this record that cannot be reconstructed from anything else: an entry
 * says you repotted something, and the picture says what it looked like
 * afterwards. So nothing here deletes anything by itself. It gives the owner
 * a figure, a way to protect what matters, and a way to clear out a batch.
 *
 * ## What deleting actually does, and what it cannot
 *
 * **It removes the image. It does not remove the entry.** The `Photo` entry
 * saying a photograph was taken, when, and of what stays in the log forever,
 * because the log is append-only and rule 5 has no exceptions for images. The
 * screen says so out loud — otherwise deleting a photograph looks like
 * deleting the fact that you took it, and the owner would be right to find
 * that alarming.
 *
 * It is the same shape as the audio release the golden rule already allows:
 * the bytes go, the record of them stands.
 *
 * ## Why `keep` lives on the media record
 *
 * Unlike a review flag — bookkeeping about the next package, deliberately in
 * `meta` and deliberately not backed up — `keep` is a long-lived decision
 * about one photograph. On the record it travels in the full export beside
 * the image it protects, which is the only place it is any use. A flag that
 * vanished on restore would be protection the owner thought they had.
 */

/** What a photograph is costing, and how many there are. */
export interface PhotoStorage {
  count: number;
  bytes: number;
  /** Of those, how many cannot be swept up without a second confirmation. */
  protected_count: number;
}

/**
 * Photographs that a bulk delete must not take quietly.
 *
 * Three ways a photograph earns this, and none of them is a preference: the
 * owner marked it `keep`; it is a plant's hero, which is what every list and
 * the plant page draw; or it is one of the two What works compares, which is
 * a stated argument about that plant that would be left pointing at nothing.
 */
export function protectedPhotos(
  plants: readonly DerivedPlant[],
  records: readonly Pick<MediaRecord, 'media_id' | 'keep'>[],
): Set<MediaId> {
  const out = new Set<MediaId>();
  for (const r of records) if (r.keep) out.add(r.media_id);
  for (const p of plants) {
    if (p.hero) out.add(p.hero);
    // `compare` is a plain string pair on derived state, not a branded id.
    for (const id of p.compare ?? []) out.add(id as MediaId);
  }
  return out;
}

/** Pure: the arithmetic, so the screen and the checks agree on it. */
export function summarisePhotos(
  records: readonly Pick<MediaRecord, 'media_id' | 'keep' | 'blob' | 'thumb'>[],
  protectedIds: ReadonlySet<MediaId>,
): PhotoStorage {
  let bytes = 0;
  for (const r of records) bytes += (r.blob?.size ?? 0) + (r.thumb?.size ?? 0);
  return {
    count: records.length,
    bytes,
    protected_count: records.filter((r) => protectedIds.has(r.media_id)).length,
  };
}

/** Megabytes, to one place, because the figure is for a human deciding
    whether to bother — not for arithmetic. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readPhotoStorage(
  db: DeezDB,
  plants: readonly DerivedPlant[],
): Promise<PhotoStorage> {
  const records = await db.getAll('media');
  return summarisePhotos(records, protectedPhotos(plants, records));
}

export async function setKeep(db: DeezDB, media_id: MediaId, keep: boolean): Promise<void> {
  const record = await db.get('media', media_id);
  if (!record) return;
  await db.put('media', { ...record, keep });
}

/**
 * Remove the images, leave the entries.
 *
 * Returns what it actually deleted rather than assuming — a photograph may
 * have gone already from another device, and the screen should report what
 * happened, not what was asked for.
 */
export async function deletePhotos(db: DeezDB, ids: readonly MediaId[]): Promise<number> {
  let deleted = 0;
  for (const media_id of ids) {
    if (!(await db.get('media', media_id))) continue;
    await db.delete('media', media_id);
    deleted += 1;
  }
  return deleted;
}
