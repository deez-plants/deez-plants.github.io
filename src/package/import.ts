import type { DeezDB, AppliedUpdateRecord } from '../db/schema';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import { mintDatedId } from '../db/counters';
import { encodeFieldValue } from '../db/fieldCodec';
import type { EditableField, Health } from '../types/plant';
import type { InstructionId, ISODate, PackageId } from '../types/ids';
import type { PlantEvent } from '../types/event';
import type { ReviewRow } from '../types/package';

/**
 * Apply AI update (screen 20), after the review table's per-row approval.
 * Rule 4 (no apply-all, ever): the caller has already reduced `approved` to
 * exactly the rows a human accepted — this module writes precisely those,
 * one event per row, and nothing else.
 *
 * `health` becomes a `Rate` event (source `ai`) rather than an `Edit` — health
 * is a judgement, not a field, even when the judgement is the AI's read of a
 * photo (rule 1: the app never computes health, but an event can still carry
 * one *as a value someone or something asserted*, same as a user's own Rate).
 * `care_instructions` becomes an `Edit` carrying `op`/`instruction_id`,
 * minting the id here since "derive is pure and cannot mint one"
 * (`derive.ts`'s own note on `applyInstructionOp`). Every other field is a
 * plain `Edit` from the row's own typed `value_from`/`value_to`.
 */

export interface ImportOutcome {
  accepted_count: number;
  rejected_count: number;
}

export async function applyUpdateFile(
  db: DeezDB,
  package_id: string,
  total_rows: number,
  approved: readonly ReviewRow[],
  as_of: ISODate,
): Promise<ImportOutcome> {
  const device_id = await deviceId(db);
  const events: PlantEvent[] = [];

  for (const row of approved) {
    const time = nowClockTime();
    const common = {
      event_id: mintEventId(device_id, as_of, time),
      plant_id: row.plant_id,
      date: as_of,
      time,
      source: 'ai' as const,
      device_id,
      package_id: package_id as PackageId,
    };

    if (row.field === 'health') {
      events.push({ ...common, type: 'Rate', to: row.change.value as Health });
      continue;
    }

    if (row.field === 'care_instructions') {
      const instruction_id = await mintDatedId(db, 'INS', as_of) as InstructionId;
      events.push({
        ...common,
        type: 'Edit',
        field: 'care_instructions',
        from: null,
        to: row.change.value as string,
        op: row.change.op as 'add' | 'replace',
        instruction_id,
        replaces: row.change.op === 'replace' ? (row.change.replaces as InstructionId) : undefined,
      });
      continue;
    }

    if (row.value_from === row.value_to) continue; // nothing actually changed

    const field = row.field as EditableField;
    events.push({
      ...common,
      type: 'Edit',
      field,
      from: encodeFieldValue(field, row.value_from),
      to: encodeFieldValue(field, row.value_to),
    });
  }

  if (events.length) await appendEvents(db, events);

  const record: AppliedUpdateRecord = {
    package_id: package_id as PackageId,
    applied: as_of,
    accepted_count: approved.length,
    rejected_count: total_rows - approved.length,
  };
  await db.put('applied_updates', record);

  return { accepted_count: approved.length, rejected_count: record.rejected_count };
}
