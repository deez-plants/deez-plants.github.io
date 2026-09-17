import type { ISODate, PackageId, PlantId } from './ids';
import type { CareInstruction, Health, HealthSource, StatusLabel } from './plant';

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
  /** Where in the room, in the owner's own words. Section 4, Placement. */
  spot: string;
  pot: string;
  planter: string | null;
  /** True when the planter's registry entry says one soak serves the group —
      so the AI can see that two plants share one body of soil rather than
      reading their two intervals as independent schedules. */
  planter_shared_water: boolean;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
  /**
   * Section 4, Reference. `editable_by: both`, and the validator has accepted
   * proposals naming them since they were added — but the manifest did not
   * export them, so the AI was being asked to fill in fields whose current
   * values it could not see. Added 2026-09-16 after the first real review
   * found exactly that.
   */
  environment: string | null;
  repotting: string | null;
  pruning: string | null;
  pests: string | null;
  season: string | null;
  propagation: string | null;
  status_label: StatusLabel | null;
  do_next: string | null;
  notes_user: string;
  care_instructions: CareInstruction[];
  health: Health | null;
  /** Who last wrote the number — `Me` or `AI`. Never a reason to trust it more. */
  health_source: HealthSource | null;
  health_confirmed: ISODate | null;
  /** When the value last actually moved, which is not when it was last
      confirmed. "Confirmed Aug 14 · unchanged since Jun 2" needs both. */
  health_changed: ISODate | null;
  health_stale: boolean;
  /** Section 4 calls this `adherence`. It was exported as `adherence_state`
      until 2026-09-16 — one name, chosen to be the spec's. */
  adherence: 'on' | 'slip' | 'behind';
  on_time_count: number;
  care_count: number;
  /** Mean lateness of the late waterings only. Null when nothing was late. */
  avg_days_late: number | null;
  /** The interval in force today — summer or winter, already resolved. */
  interval_days: number | null;
  next_due: ISODate | null;
  /**
   * Days past `next_due`; negative means days remaining.
   *
   * **Rule 9 applies to whoever reads this.** The interval passing is a fact
   * about the calendar and a prompt to look. It is never proof the soil is
   * dry, and nothing may render it as an instruction to water.
   */
  days_past: number | null;
  last_checked: ISODate | null;
}

/**
 * What the collection contains, stated rather than counted off the list.
 *
 * The first real package carried 21 plants against a record of 22, and
 * nothing in it said which was right. 009-SPD is archived — a permanent
 * record, deliberately not eligible for an AI update — and the difference
 * between "archived" and "missing" is not something a reader should have to
 * infer from a length.
 */
export interface ManifestCollection {
  permanent_record_count: number;
  active_count: number;
  archived_count: number;
  archived: { plant_id: PlantId; name: string; date: ISODate | null; reason: string | null }[];
}

export interface Manifest {
  package_id: PackageId;
  generated: ISODate;
  collection: ManifestCollection;
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
