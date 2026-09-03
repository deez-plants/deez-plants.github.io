import type {
  ClockTime, DeviceId, EventId, ISODate, InstructionId, MediaId, PackageId, PlantId, SessionId,
} from './ids';
import type { EditableField, Health, MediaLabel } from './plant';

/** Section 5. */
export type EventType =
  | 'Water' | 'Feed' | 'Prune' | 'Repot' | 'Photo' | 'Inspect'
  | 'Support' | 'Pest treat' | 'Rate' | 'Other' | 'Edit' | 'Archive';

/**
 * Section 5 lists `user | ai | round`. Section 6b's seed example writes
 * `source: "seed"`. See FLAG A — `seed` is included here pending your ruling.
 */
export type EventSource = 'user' | 'ai' | 'round' | 'seed';

/** The care actions. Only `Water` feeds adherence — see DECISION 3. */
export type CareEventType =
  | 'Water' | 'Feed' | 'Prune' | 'Repot' | 'Photo'
  | 'Inspect' | 'Support' | 'Pest treat' | 'Other';

interface EventCommon {
  event_id: EventId;
  /** Null only for collection-scoped `Edit` events. See FLAG C. */
  plant_id: PlantId | null;
  date: ISODate;
  time: ClockTime;
  /** <= 400 chars. */
  note?: string;
  media?: MediaId[];
  /** One label per entry in `media`. */
  media_labels?: MediaLabel[];
  source: EventSource;
  session_id?: SessionId;
  offset_s?: number;
  /** Not in section 5. Section 8 requires showing which device set a rating. */
  device_id: DeviceId;
  /**
   * Present when this event came from an approved update-file row: the package
   * the change was generated from. Carries the provenance a care instruction
   * needs and gives the review history somewhere to point.
   */
  package_id?: PackageId;
}

export interface CareEvent extends EventCommon {
  type: CareEventType;
  plant_id: PlantId;
}

/** Section 4. The rating lives in `to`. Confirming without changing is one of these. */
export interface RateEvent extends EventCommon {
  type: 'Rate';
  plant_id: PlantId;
  to: Health;
}

/**
 * A manual override or an approved AI change. Section 5 types `from`/`to` as
 * `string`; section 10 sends `"value": 6` as a number. See DECISION 4 — the
 * event keeps the spec's string form and a per-field codec does the conversion,
 * so `events.json` stays readable to whoever reviews the package.
 *
 * `op` and `instruction_id` apply only when `field` is a care-instruction list.
 * Section 6c gives the update file an `op` of `add` or `replace`; `delete`
 * exists here and only here, because deletion is yours alone.
 */
export interface EditEvent extends EventCommon {
  type: 'Edit';
  field: EditableField;
  from: string | null;
  to: string | null;
  /** The new item's id for `add` and `replace`; the target for `delete`. */
  instruction_id?: InstructionId;
  /** For `replace` only: the item being superseded. */
  replaces?: InstructionId;
  op?: 'add' | 'replace' | 'delete';
}

/** Section 4. `archived`, `archived_date` and `archived_reason` come from this. */
export interface ArchiveEvent extends EventCommon {
  type: 'Archive';
  plant_id: PlantId;
  /** The reason. Required here, <= 120 chars — it becomes `archived_reason`. */
  note: string;
}

/** What travels in `events.json`. */
export type PlantEvent = CareEvent | RateEvent | EditEvent | ArchiveEvent;

/**
 * Local-only columns. Stripped on export — they are not part of the record,
 * they are this device's bookkeeping.
 *
 * `pending` is 0/1 rather than boolean so IndexedDB can index it.
 */
export interface LocalEventFields {
  pending: 0 | 1;
  /** Set by the Update commit that folded this event in. */
  folded_at?: ISODate;
}

export type StoredEvent = PlantEvent & LocalEventFields;

/**
 * The total order the fold runs in. Two devices holding the same set of events
 * must produce byte-identical derived state, so the sort must never depend on
 * insertion order or arrival time: date, then time, then `event_id`
 * lexicographically as a deterministic tiebreak.
 */
export type EventSortKey = readonly [ISODate, ClockTime, EventId];
