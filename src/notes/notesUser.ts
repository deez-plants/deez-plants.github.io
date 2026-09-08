import type { DeezDB } from '../db/schema';
import type { ISODate, PlantId } from '../types/ids';
import { editPlantFields } from '../care/editField';

/**
 * `notes_user` — yours alone (section 6c). Editable inline, never touched by
 * any import (`package/validate.ts` rejects a file naming it under any
 * circumstances). A plain `Edit` event like any other user-only field, so
 * this is a thin wrapper over the same `editPlantFields` Info and settings
 * already uses — kept as its own module because the intended file layout
 * calls it out as its own concern, not because the write itself is special.
 */
export async function setNotesUser(db: DeezDB, plant_id: PlantId, from: string, to: string, as_of: ISODate): Promise<void> {
  if (from === to) return;
  await editPlantFields(db, plant_id, [{ field: 'notes_user', from, to }], as_of);
}
