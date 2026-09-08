import type { AppliedUpdateRecord, PackageRecord } from '../db/schema';
import type { DerivedState } from '../types/derived';
import type { EditEvent, StoredEvent } from '../types/event';
import { PLANT_ID_RE, type ISODate, type PlantId } from '../types/ids';
import { AI_EDITABLE_FIELDS, DERIVED_FIELDS, USER_ONLY_FIELDS } from '../types/plant';
import { FIELD_KINDS, STATUS_LABELS, type FieldKind } from '../db/fieldCodec';
import { formatDayMonthYear } from '../lib/dates';
import type { ReviewRow, UpdateChange, UpdateFile, ValidationResult } from '../types/package';

/**
 * FIELD_DEFINITIONS.md section 11. "The app runs these before showing you
 * anything. A file failing any check is rejected whole, with the reason
 * named." Every rule here does exactly that — the one exception is rule 13
 * (conflict), which flags a row in the review table rather than rejecting
 * the file, per the spec's own "Conflict" heading being separate from
 * "Provenance"/"Referential"/"Value"/"Completeness".
 *
 * `collection_care_instructions` is real in the data model (`derive.ts`
 * folds it) but this pass doesn't build the collection-level review row it
 * would need — rejected here with a named reason, not silently mishandled.
 */

const AI_FIELD_SET = new Set<string>(AI_EDITABLE_FIELDS);
const USER_FIELD_SET = new Set<string>(USER_ONLY_FIELDS);
const DERIVED_FIELD_SET = new Set<string>(DERIVED_FIELDS);

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isUpdateFileShape(v: unknown): v is UpdateFile {
  if (!isPlainObject(v)) return false;
  if (typeof v.package_id !== 'string' || typeof v.generated !== 'string') return false;
  if (!Array.isArray(v.changes) || !Array.isArray(v.unaddressed)) return false;
  return v.changes.every((c) => isPlainObject(c) && typeof c.plant_id === 'string' && typeof c.field === 'string');
}

function decodeJsonValue(kind: FieldKind, raw: unknown): string | number | null | undefined {
  switch (kind) {
    case 'text':
      return typeof raw === 'string' ? raw : undefined;
    case 'opt_text':
      return raw === null ? null : typeof raw === 'string' ? raw : undefined;
    case 'int':
      return typeof raw === 'number' && Number.isInteger(raw) ? raw : undefined;
    case 'opt_int':
      return raw === null ? null : typeof raw === 'number' && Number.isInteger(raw) ? raw : undefined;
    case 'status_label':
      if (raw === null) return null;
      return typeof raw === 'string' && (STATUS_LABELS as readonly string[]).includes(raw) ? raw : undefined;
    case 'instruction_list':
      return typeof raw === 'string' ? raw : undefined;
  }
}

function displayValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return 'Not set';
  return String(v);
}

export interface ValidateContext {
  state: DerivedState;
  packages: PackageRecord[];
  appliedUpdates: AppliedUpdateRecord[];
  /** The raw log, for rule 13's conflict check. */
  events: readonly StoredEvent[];
}

/** One change, checked against rules 3–10 and 6a/6b. Returns an error
    message on the first violation, or null if the row is sound. */
function validateChange(c: UpdateChange, ctx: ValidateContext): string | null {
  if (!PLANT_ID_RE.test(c.plant_id)) {
    return `"${c.plant_id}" is not a valid plant id.`;
  }
  const plant = ctx.state.plants[c.plant_id];
  if (!plant) return `Plant ${c.plant_id} does not exist.`; // rule 3
  if (plant.archived) return `Plant ${c.plant_id} (${plant.name}) is archived — no change may target it.`; // rule 4

  if (c.field === 'archived' || c.field === 'archived_date' || c.field === 'archived_reason') {
    return `"${c.field}" is derived from the Archive event and can never be a proposed change.`; // rule 4a
  }
  if (c.field === 'notes_user' || c.field === 'collection_notes_user') {
    return `"${c.field}" is yours alone — no update file may name it.`; // rule 6a
  }
  if (c.field === 'collection_care_instructions') {
    return 'Collection-level care instructions are not accepted through this import yet.';
  }
  if (USER_FIELD_SET.has(c.field)) return `"${c.field}" is editable by you only, not by an update.`; // rule 6
  if (DERIVED_FIELD_SET.has(c.field)) return `"${c.field}" is derived and can never be a proposed change.`; // rule 6
  if (!AI_FIELD_SET.has(c.field)) return `"${c.field}" is not a field this app recognises.`; // rule 5

  if (typeof c.reason !== 'string' || !c.reason.trim()) {
    return `The change to ${c.field} on ${c.plant_id} has no reason.`; // rule 12
  }

  if (c.field === 'health') {
    if (typeof c.value !== 'number' || !Number.isInteger(c.value) || c.value < 1 || c.value > 10) {
      return `Health on ${c.plant_id} must be a whole number from 1 to 10.`; // rule 10
    }
    return null;
  }

  if (c.field === 'care_instructions') {
    if (c.op !== 'add' && c.op !== 'replace') {
      return `A care-instruction change on ${c.plant_id} must have op "add" or "replace".`; // rule 6b
    }
    if (typeof c.value !== 'string' || !c.value.trim() || c.value.length > 200) {
      return `A care-instruction change on ${c.plant_id} needs text of 1–200 characters.`; // rule 6b
    }
    if (c.op === 'replace') {
      const exists = plant.care_instructions.some((i) => i.instruction_id === c.replaces);
      if (!exists) return `${c.plant_id}'s replace targets an instruction that isn't on that plant.`; // rule 6b
    }
    return null;
  }

  const kind = FIELD_KINDS[c.field as keyof typeof FIELD_KINDS];
  const decoded = decodeJsonValue(kind, c.value);
  if (decoded === undefined) return `The value for ${c.field} on ${c.plant_id} doesn't match what that field allows.`; // rule 7/8

  if (c.field === 'water_interval_days' || c.field === 'water_interval_days_winter') {
    if (decoded !== null && (typeof decoded !== 'number' || decoded < 1 || decoded > 60)) {
      return `${c.field} on ${c.plant_id} must be an integer from 1 to 60.`; // rule 9
    }
  }

  return null;
}

function buildReviewRow(c: UpdateChange, ctx: ValidateContext, pkg: PackageRecord): ReviewRow {
  const plant = ctx.state.plants[c.plant_id];
  const plant_id = c.plant_id as PlantId;

  let currentDisplay: string;
  let proposedDisplay: string;
  let value_from: string | number | null = null;
  let value_to: string | number | null = null;
  if (c.field === 'health') {
    currentDisplay = plant.health.current !== null ? `${plant.health.current}/10` : 'Not rated';
    proposedDisplay = `${c.value as number}/10`;
  } else if (c.field === 'care_instructions') {
    currentDisplay = c.op === 'replace'
      ? plant.care_instructions.find((i) => i.instruction_id === c.replaces)?.text ?? '(missing)'
      : '(new item)';
    proposedDisplay = String(c.value);
  } else {
    const kind = FIELD_KINDS[c.field as keyof typeof FIELD_KINDS];
    const current = (plant as unknown as Record<string, string | number | null>)[c.field];
    value_from = current;
    value_to = decodeJsonValue(kind, c.value) ?? null;
    currentDisplay = displayValue(current);
    proposedDisplay = displayValue(value_to);
  }

  // Rule 13: a user Edit on this exact field, dated after the package export,
  // is flagged rather than treated as an ordinary row.
  const isConflicting = (e: StoredEvent): e is StoredEvent & EditEvent => (
    e.type === 'Edit' && e.source === 'user' && e.plant_id === plant_id
    && e.field === c.field && e.date > pkg.generated
  );
  const conflictEvent = ctx.events.find(isConflicting);

  return {
    plant_id,
    plant_name: plant.name,
    field: c.field,
    current_display: currentDisplay,
    proposed_display: proposedDisplay,
    value_from,
    value_to,
    reason: c.reason,
    conflict: conflictEvent
      ? { your_value: conflictEvent.to ?? 'Not set', your_date: conflictEvent.date }
      : null,
    change: c,
  };
}

export function validateUpdateFile(raw: unknown, ctx: ValidateContext): ValidationResult {
  if (!isUpdateFileShape(raw)) {
    return fail('This file is not shaped like an update file — it needs package_id, generated, changes and unaddressed.');
  }

  const pkg = ctx.packages.find((p) => p.package_id === raw.package_id);
  if (!pkg) return fail(`"${raw.package_id}" doesn't match any package this app exported.`); // rule 1

  if (ctx.appliedUpdates.some((a) => a.package_id === raw.package_id)) {
    return fail(`An update for ${raw.package_id} has already been applied — it cannot be applied twice.`); // rule 2
  }

  for (const c of raw.changes) {
    const err = validateChange(c, ctx);
    if (err) return fail(err);
  }

  const addressed = new Set(raw.changes.map((c) => c.plant_id));
  const unaddressedSet = new Set(raw.unaddressed);
  for (const plant_id of pkg.plant_ids) {
    if (!addressed.has(plant_id) && !unaddressedSet.has(plant_id)) {
      return fail(`${plant_id} was in the manifest but is neither changed nor listed in unaddressed.`); // rule 11
    }
  }

  return {
    ok: true,
    rows: raw.changes.map((c) => buildReviewRow(c, ctx, pkg)),
    unaddressed: raw.unaddressed.filter((id) => PLANT_ID_RE.test(id)) as PlantId[],
    notes: raw.notes ?? null,
  };
}

/** For the review table's conflict banner: "you changed it Aug 14". */
export function formatConflictDate(d: ISODate): string {
  return formatDayMonthYear(d);
}
