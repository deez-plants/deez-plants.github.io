import type { DeezDB } from '../db/schema';
import type { ClockTime, DeviceId, EventId, ISODate, PlantId } from '../types/ids';
import type { EditEvent } from '../types/event';
import type { EditableField } from '../types/plant';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import { encodeFieldValue, type FieldValue } from '../db/fieldCodec';

/**
 * Writing identity/placement/care-spec edits — Info and settings' in-place
 * editing (DESIGN_REFERENCE.md screen 10).
 *
 * An `Edit` event is not exempt from the pending queue the way `Rate` and
 * `Archive` are (`db/derive.ts`'s fold skips the pending filter only for
 * those two) — so a saved field, like a logged care event, takes effect on
 * the next Update, not immediately. That is the existing model working as
 * designed, not a shortcut: rule 10 rebuilds everything from the log on
 * every commit, and a field edit is exactly as much "the log" as a watering
 * is.
 */

export interface EditContext {
  device_id: DeviceId;
  date: ISODate;
  time: ClockTime;
}

export interface FieldChange {
  field: EditableField;
  from: FieldValue;
  to: FieldValue;
}

export function buildEditEvent(plant_id: PlantId, change: FieldChange, ctx: EditContext): EditEvent {
  return {
    event_id: mintEventId(ctx.device_id, ctx.date, ctx.time),
    plant_id,
    type: 'Edit',
    field: change.field,
    from: encodeFieldValue(change.field, change.from),
    to: encodeFieldValue(change.field, change.to),
    date: ctx.date,
    time: ctx.time,
    source: 'user',
    device_id: ctx.device_id,
  };
}

/** One event per field that actually changed — comparing the typed values,
    not their encoded strings, so `10` and `'10'` are never mistaken for a
    real edit. Returns the ids written, empty when nothing changed. */
export async function editPlantFields(
  db: DeezDB,
  plant_id: PlantId,
  changes: FieldChange[],
  as_of: ISODate,
): Promise<EventId[]> {
  const real = changes.filter((c) => c.from !== c.to);
  if (!real.length) return [];
  const ctx: EditContext = { device_id: await deviceId(db), date: as_of, time: nowClockTime() };
  const written = await appendEvents(db, real.map((c) => buildEditEvent(plant_id, c, ctx)));
  return written.map((w) => w.event_id);
}
