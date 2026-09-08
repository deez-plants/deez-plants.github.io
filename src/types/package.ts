import type { ISODate, PackageId, PlantId } from './ids';
import type { CareInstruction, Health, StatusLabel } from './plant';

/**
 * The review-set manifest and the update file it comes back as.
 * FIELD_DEFINITIONS.md sections 7 and 10.
 *
 * "The manifest is the schema. Whatever fields it contains are the only
 * fields that exist, and the AI should treat any field absent from it as
 * out of scope" — so this type is deliberately explicit about every field
 * rather than reusing `DerivedPlant`, which also carries bookkeeping
 * (`pending_event_ids`, `last_set_by`, `photos`) that has no business
 * leaving the device.
 */
export interface ManifestPlant {
  plant_id: PlantId;
  name: string;
  species: string;
  acquired: string | null;
  room: string;
  pot: string;
  planter: string | null;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
  status_label: StatusLabel | null;
  do_next: string | null;
  notes_user: string;
  care_instructions: CareInstruction[];
  health: Health | null;
  health_confirmed: ISODate | null;
  health_stale: boolean;
  adherence_state: 'on' | 'slip' | 'behind';
  on_time_count: number;
  care_count: number;
  last_checked: ISODate | null;
}

export interface Manifest {
  package_id: PackageId;
  generated: ISODate;
  plants: ManifestPlant[];
}

/** FIELD_DEFINITIONS.md section 10. One field on one plant per row — the AI
    never returns a manifest or invents structure, only this flat list. */
export interface UpdateChange {
  plant_id: string;
  field: string;
  value: unknown;
  reason: string;
  /** `care_instructions` only. */
  op?: string;
  instruction_id?: string;
  replaces?: string;
}

export interface UpdateFile {
  package_id: string;
  generated: string;
  changes: UpdateChange[];
  unaddressed: string[];
  notes?: string;
}

/** What review.tsx shows per proposed change, after validation has already
    passed the file as a whole (section 11's conflict rule 13 is the one
    check that flags a row rather than rejecting the file). */
export interface ReviewRow {
  plant_id: PlantId;
  plant_name: string;
  field: string;
  /** Human-readable, already formatted for display. */
  current_display: string;
  proposed_display: string;
  /** The decoded current/proposed values, typed — what import.ts diffs and
      writes for a plain field edit. `health` and `care_instructions` route
      through their own event shape (Rate, and Edit-with-op) instead, so
      both are `null` for those two. */
  value_from: string | number | null;
  value_to: string | number | null;
  reason: string;
  conflict: { your_value: string; your_date: ISODate } | null;
  /** Internal shape used when the row is approved and turned into an event. */
  change: UpdateChange;
}

export interface ValidationOk {
  ok: true;
  rows: ReviewRow[];
  unaddressed: PlantId[];
  notes: string | null;
}

export interface ValidationFailed {
  ok: false;
  reason: string;
}

export type ValidationResult = ValidationOk | ValidationFailed;
