import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import type { DeezDB } from '../db/schema';
import type { ArchiveEvent } from '../types/event';
import type { ClockTime, DeviceId, EventId, ISODate, PlantId } from '../types/ids';

/**
 * Archiving a plant. Rule 8: this is an `Archive` **event**, never a state
 * patch — `archived`, `archived_date` and `archived_reason` are always derived
 * from it, with no mutation exception anywhere in the model.
 *
 * Which is also why there is no `unarchive` here, and why adding one would be
 * wrong. Events are append-only (rule 5), and `derive.ts` takes the *first*
 * Archive for a plant and ignores any later one, deliberately, so a duplicate
 * arriving from another device cannot move the date. A plant brought back
 * would need an `Unarchive` event type and a rule for how the two interleave —
 * a real change to the model, not a button.
 *
 * The reason is required. An archived plant with no reason is a row that
 * answers "what happened to this one?" with silence, and the answer is the
 * whole point of keeping the record rather than deleting it.
 */

/** Section 4: `archived_reason` is capped at 120 characters. */
export const ARCHIVE_REASON_MAX = 120;

export function buildArchiveEvent(
  plant_id: PlantId,
  reason: string,
  ctx: { date: ISODate; time: ClockTime; device_id: DeviceId },
): ArchiveEvent {
  const note = reason.trim();
  if (!note) throw new Error('An archived plant needs a reason.');
  if (note.length > ARCHIVE_REASON_MAX) {
    throw new Error(`Keep the reason to ${ARCHIVE_REASON_MAX} characters or fewer.`);
  }
  return {
    event_id: mintEventId(ctx.device_id, ctx.date, ctx.time),
    plant_id,
    date: ctx.date,
    time: ctx.time,
    type: 'Archive',
    note,
    source: 'user',
    device_id: ctx.device_id,
  };
}

/**
 * Appends the event. Pending like any other write, so the plant stays in the
 * active list until Update — the same way a logged watering does. Archiving
 * something by accident and noticing before you commit is the one recovery
 * this design offers, and it comes free from the pending model.
 */
export async function archivePlant(
  db: DeezDB,
  plant_id: PlantId,
  reason: string,
  as_of: ISODate,
): Promise<EventId> {
  const ctx = { date: as_of, time: nowClockTime(), device_id: await deviceId(db) };
  const [written] = await appendEvents(db, [buildArchiveEvent(plant_id, reason, ctx)]);
  return written.event_id;
}
