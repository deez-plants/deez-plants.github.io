import type { DeezDB } from '../db/schema';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import { mintDatedId } from '../db/counters';
import type { EditEvent } from '../types/event';
import type { InstructionId, ISODate, PlantId } from '../types/ids';

/**
 * Section 6c: `care_instructions` is a list, not a blob, and "deletion is
 * yours alone" — an update file may only `add` or `replace` (section 11
 * rule 6b, enforced in `package/validate.ts`); `delete` exists here and only
 * here. Both writes are plain `Edit` events with `op`/`instruction_id`,
 * exactly the shape `derive.ts`'s `applyInstructionOp` already folds.
 */

const MAX_TEXT = 200;

export async function addCareInstruction(
  db: DeezDB,
  plant_id: PlantId,
  text: string,
  as_of: ISODate,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_TEXT) throw new Error(`A care instruction must be ${MAX_TEXT} characters or fewer.`);

  const time = nowClockTime();
  const device_id = await deviceId(db);
  const instruction_id = await mintDatedId(db, 'INS', as_of) as InstructionId;

  const event: EditEvent = {
    event_id: mintEventId(device_id, as_of, time),
    plant_id,
    type: 'Edit',
    field: 'care_instructions',
    from: null,
    to: trimmed,
    op: 'add',
    instruction_id,
    date: as_of,
    time,
    source: 'user',
    device_id,
  };
  await appendEvents(db, [event]);
}

export async function deleteCareInstruction(
  db: DeezDB,
  plant_id: PlantId,
  instruction_id: InstructionId,
  as_of: ISODate,
): Promise<void> {
  const time = nowClockTime();
  const device_id = await deviceId(db);

  const event: EditEvent = {
    event_id: mintEventId(device_id, as_of, time),
    plant_id,
    type: 'Edit',
    field: 'care_instructions',
    from: null,
    to: null,
    op: 'delete',
    instruction_id,
    date: as_of,
    time,
    source: 'user',
    device_id,
  };
  await appendEvents(db, [event]);
}
