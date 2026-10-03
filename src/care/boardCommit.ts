import type { DeezDB } from '../db/schema';
import type { CareEvent } from '../types/event';
import type { DerivedState } from '../types/derived';
import type { EventId, ISODate, PlantId } from '../types/ids';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import { deferDays } from './inspect';
import type { Basket } from './board';

/**
 * Turning a basket of ticks into entries.
 *
 * ## One pass, one write
 *
 * The owner walks round the flat ticking, then commits once. Every tick becomes
 * an ordinary entry — a `Water` for a watering, an `Inspect` carrying a recheck
 * for a check — and they are appended together so a half-written round cannot
 * exist. Nothing here is a new kind of record: a watering logged from the board
 * is the same entry as one logged from the plant's own screen, which is what
 * keeps the history readable in five years.
 *
 * ## Why the checks carry no reason
 *
 * The chips live on the plant's own Log care screen, one tap away by the row's
 * name. From the board a check is the fast answer — *looked at it, not ready* —
 * and making the owner classify every plant on a walk is exactly the friction
 * this screen exists to remove. The recheck is the plant's own default, shown
 * on the button before it is tapped so the wait is never hidden.
 */

export interface BoardCommit {
  /** Every entry written, in order — what `undoBoard` takes back. */
  event_ids: EventId[];
  watered: number;
  checked: number;
}

export async function logBoard(
  db: DeezDB,
  state: DerivedState,
  basket: Basket,
  as_of: ISODate,
): Promise<BoardCommit> {
  const device_id = await deviceId(db);
  const time = nowClockTime();
  const events: CareEvent[] = [];
  let watered = 0;
  let checked = 0;

  for (const [plant_id, action] of basket) {
    const plant = state.plants[plant_id];
    // A plant that vanished between ticking and committing — archived on
    // another device, say. Skipped rather than written against nothing.
    if (!plant || plant.archived) continue;

    const common = {
      event_id: mintEventId(device_id, as_of, time),
      plant_id: plant_id as PlantId,
      date: as_of,
      time,
      source: 'user' as const,
      device_id,
    };

    if (action === 'watered') {
      events.push({ ...common, type: 'Water' });
      watered += 1;
    } else {
      events.push({
        ...common,
        type: 'Inspect',
        // The plant's own default, which is what the button showed. No reason:
        // from here a check is "looked at it, not ready", and the chips are on
        // the plant's screen for when it deserves the thought.
        recheck_days: deferDays(null, plant.adherence.interval_days),
      });
      checked += 1;
    }
  }

  const written = await appendEvents(db, events);
  return { event_ids: written.map((e) => e.event_id), watered, checked };
}

/**
 * Take back everything a commit wrote.
 *
 * **Never a deletion.** Each entry gets a `Void` naming it: both stay in the
 * log, neither counts, and history shows both. That is rule 5, and the reason
 * for it is that a deleted entry could return from a backup with no record of
 * the intent to remove it.
 *
 * This is the immediate undo, for the mis-tap noticed straight away. Taking
 * something back later is Void from history, which is its own screen.
 */
export async function undoBoard(
  db: DeezDB,
  event_ids: readonly EventId[],
  as_of: ISODate,
): Promise<void> {
  const device_id = await deviceId(db);
  const time = nowClockTime();
  const all = await db.getAll('events');
  const byId = new Map(all.map((e) => [e.event_id, e]));

  const voids = event_ids
    .map((id) => byId.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e, i) => ({
      // The minted id carries the minute, so several voids written in the same
      // breath need distinguishing. The index does that without inventing a
      // second clock.
      event_id: `${mintEventId(device_id, as_of, time)}-${i}` as EventId,
      plant_id: e.plant_id,
      type: 'Void' as const,
      date: as_of,
      time,
      voids: e.event_id,
      source: 'user' as const,
      device_id,
    }));

  await appendEvents(db, voids);
}
