import { META_KEY, openDeezPlants, type DeezDB } from '../db/schema';
import type { MediaId } from '../types/ids';

/**
 * Photos marked to travel in the next review package.
 *
 * ## Why this is not an event
 *
 * A flag is **an intent about the next package, not a record of the past.** The
 * event log is append-only and permanent; a flag is meaningless a month after
 * the package goes. Writing one entry per flag and another per unflag would
 * grow the record forever to hold something nobody will ever read back.
 *
 * So flags live in `meta`, beside the app's other bookkeeping. Three
 * consequences, all of them wanted:
 *
 * - **They cannot corrupt the record**, because they are not in it.
 * - **They are not carried by a backup or a restore.** Losing them costs one
 *   tap per photo. That is the best property a feature can have — the worst
 *   case is trivial.
 * - **No migration.** An older record simply has none.
 *
 * ## When they clear
 *
 * When a package is CONFIRMED SENT, never when one is built — see
 * `confirmSent` in `package/export.ts`. Answer "no" to "did it save?" and the
 * flags are still there for the retry.
 *
 * That is what keeps the flag meaning exactly one thing: **"going in the next
 * package."** If they persisted across sends, the owner would have to remember
 * what they flagged in July, which is the kind of remembering this app exists
 * to remove.
 */

/**
 * How many photos a package may carry.
 *
 * A review copy is around 150KB, so twenty is roughly 3MB — a chat upload takes
 * that without complaint. The cap is not about storage; it is about a package
 * staying something the AI can actually look at rather than skim.
 */
export const FLAG_CAP = 20;

export async function readFlags(db: DeezDB): Promise<MediaId[]> {
  const meta = await db.get('meta', META_KEY);
  return meta?.review_flags ?? [];
}

async function writeFlags(db: DeezDB, flags: readonly MediaId[]): Promise<void> {
  const meta = await db.get('meta', META_KEY);
  if (!meta) return;
  await db.put('meta', { ...meta, review_flags: [...flags] }, META_KEY);
}

export interface FlagResult {
  flags: MediaId[];
  /** True when the tap was refused because the package is already full. */
  at_cap: boolean;
}

/** Flag or unflag one photo. Unflagging is never refused, whatever the cap. */
export async function toggleFlag(db: DeezDB, media_id: MediaId): Promise<FlagResult> {
  const flags = await readFlags(db);
  if (flags.includes(media_id)) {
    const next = flags.filter((id) => id !== media_id);
    await writeFlags(db, next);
    return { flags: next, at_cap: false };
  }
  if (flags.length >= FLAG_CAP) return { flags, at_cap: true };
  const next = [...flags, media_id];
  await writeFlags(db, next);
  return { flags: next, at_cap: false };
}

/** After a package is confirmed sent. See the note above. */
export async function clearFlags(db: DeezDB): Promise<void> {
  await writeFlags(db, []);
}

/**
 * Flags naming a photo that no longer exists, dropped.
 *
 * A photo can be deleted after being flagged, and a package must not try to
 * carry one that is gone. Read at export time rather than repaired on deletion:
 * the flag store is not the record and does not need to be kept perfect, only
 * to be right at the moment it is used.
 */
export async function liveFlags(db: DeezDB): Promise<MediaId[]> {
  const flags = await readFlags(db);
  if (!flags.length) return [];
  const present = new Set(await db.getAllKeys('media'));
  return flags.filter((id) => present.has(id));
}

/** Convenience for screens that only need the set to render ticks. */
export async function flagSet(): Promise<Set<MediaId>> {
  const db = await openDeezPlants();
  return new Set(await readFlags(db));
}
