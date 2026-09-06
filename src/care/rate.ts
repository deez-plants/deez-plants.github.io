import type { DeezDB } from '../db/schema';
import type { ClockTime, DeviceId, EventId, ISODate, PlantId } from '../types/ids';
import type { RateEvent } from '../types/event';
import type { Health } from '../types/plant';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';

/**
 * Writing a rating.
 *
 * Section 4: saving the same value is not a no-op — it is a real `Rate` event,
 * and `derive.ts` is what tells confirming from changing apart (it refreshes
 * `health_confirmed` without moving `health_changed` when the value repeats).
 * This module has no branch for "same vs different" because it needs none: a
 * confirmation and a genuine change are the same write, one `Rate` event, and
 * the distinction lives entirely in how the log is read back.
 *
 * `Rate` is exempt from the pending queue by definition (`db/events.ts`,
 * `db/derive.ts`) — the moment this is written it is live, and the Update
 * commit never touches it.
 */

export interface RateContext {
  device_id: DeviceId;
  date: ISODate;
  time: ClockTime;
}

export function buildRateEvent(plant_id: PlantId, value: Health, ctx: RateContext): RateEvent {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('A rating is an integer from 1 to 10.');
  }
  return {
    event_id: mintEventId(ctx.device_id, ctx.date, ctx.time),
    plant_id,
    type: 'Rate',
    date: ctx.date,
    time: ctx.time,
    to: value,
    source: 'user',
    device_id: ctx.device_id,
  };
}

/** Instant and local, same as a care round's write — never pending, never batched. */
export async function ratePlant(
  db: DeezDB,
  plant_id: PlantId,
  value: Health,
  today: ISODate,
): Promise<EventId> {
  const ctx: RateContext = { device_id: await deviceId(db), date: today, time: nowClockTime() };
  const [written] = await appendEvents(db, [buildRateEvent(plant_id, value, ctx)]);
  return written.event_id;
}
