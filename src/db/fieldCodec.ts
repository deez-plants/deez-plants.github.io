import type { EditableField, StatusLabel } from '../types/plant';

/**
 * Section 5 types an Edit event's `from`/`to` as `string`; section 10 sends
 * `"value": 6` as a number. This module is the seam between the two.
 *
 * Events keep the spec's string form on purpose: `events.json` goes into the
 * review package and gets read by whoever is reviewing it, so `"to": "6"` beats
 * a typed blob. The fold decodes on the way in, the writer encodes on the way
 * out, and nothing else in the app touches raw `from`/`to`.
 */

export type FieldKind =
  | 'text'          // required string
  | 'opt_text'      // string or null
  | 'int'           // required integer
  | 'opt_int'       // integer or null
  | 'status_label'
  | 'instruction_list'; // handled by op/instruction_id, never through the codec

export const FIELD_KINDS: Record<EditableField, FieldKind> = {
  name: 'text',
  species: 'text',
  acquired: 'opt_text',
  room: 'text',
  spot: 'text',
  pot: 'text',
  planter: 'opt_text',
  water_interval_days: 'int',
  water_interval_days_winter: 'opt_int',
  feed: 'opt_text',
  light: 'opt_text',
  soil: 'opt_text',
  environment: 'opt_text',
  repotting: 'opt_text',
  pruning: 'opt_text',
  pests: 'opt_text',
  season: 'opt_text',
  propagation: 'opt_text',
  status_label: 'status_label',
  do_next: 'opt_text',
  notes_user: 'text',
  hero_media: 'opt_text',
  care_instructions: 'instruction_list',
  collection_notes_user: 'text',
  collection_care_instructions: 'instruction_list',
};

export const STATUS_LABELS: readonly StatusLabel[] = [
  'Stable', 'Improving', 'Declining', 'Needs attention',
];

export type FieldValue = string | number | null;

export function encodeFieldValue(field: EditableField, value: FieldValue): string | null {
  // A care-instruction event carries the item text in `to` and the rest in `op`
  // and `instruction_id`, so there is nothing here to serialise.
  if (FIELD_KINDS[field] === 'instruction_list') {
    return typeof value === 'string' ? value : null;
  }
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Returns `undefined` — distinct from `null` — when the raw value cannot be read
 * as the field's kind. The fold treats that as "leave the field alone" rather
 * than writing a wrong value, so one malformed event cannot corrupt a plant.
 */
export function decodeFieldValue(
  field: EditableField,
  raw: string | null,
): FieldValue | undefined {
  const kind = FIELD_KINDS[field];

  switch (kind) {
    case 'text':
      return typeof raw === 'string' ? raw : undefined;

    case 'opt_text':
      return raw === null ? null : typeof raw === 'string' ? raw : undefined;

    case 'int':
    case 'opt_int': {
      if (raw === null || raw === '') return kind === 'opt_int' ? null : undefined;
      // Reject "6px", "6.5" and " " — Number('') is 0 and parseInt('6px') is 6.
      if (!/^-?\d+$/.test(raw.trim())) return undefined;
      return Number(raw.trim());
    }

    case 'status_label':
      if (raw === null) return null;
      return (STATUS_LABELS as readonly string[]).includes(raw) ? raw : undefined;

    case 'instruction_list':
      return undefined;
  }
}
