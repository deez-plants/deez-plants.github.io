import type {
  ClockTime, DeviceId, EventId, ISODate, InstructionId, MediaId, PackageId, PlantId, SessionId,
} from './ids';
import type { EditableField, Health, MediaLabel } from './plant';

/** Section 5. */
export type EventType =
  | 'Water' | 'Feed' | 'Prune' | 'Repot' | 'Photo' | 'Inspect'
  | 'Support' | 'Pest treat' | 'Rate' | 'Other' | 'Edit' | 'Archive'
  // Added 2026-09-13 alongside the CareEventType additions below.
  | 'Top-dress' | 'Soil flush' | 'Took cuttings' | 'Hard prune'
  | 'Dead leaves' | 'Trim back' | 'Rotate' | 'Wipe leaves' | 'Mist'
  // Added 2026-09-18. See `VoidEvent`.
  | 'Void';

/**
 * Section 5 lists `user | ai | round`. Section 6b's seed example writes
 * `source: "seed"`. See FLAG A — `seed` is included here pending your ruling.
 */
export type EventSource = 'user' | 'ai' | 'round' | 'seed';

/**
 * The care actions. Only `Water` feeds adherence — see DECISION 3.
 *
 * The nine after `Other` were added 2026-09-13. Purely additive: no existing
 * entry changes shape or meaning, and no migration was needed — unlike the
 * room/spot split, which had to append `Edit` events to catch old records up
 * (`db/migrateRoomSpot.ts`).
 *
 * **Why they were added when they were.** Entries are append-only, so every
 * week one of these was logged as `Other` was a week of record nobody could
 * ever re-tag. That is the whole reason this landed before the screens that
 * display it.
 *
 * Two distinctions that the split is *for*, and that a later pass must not
 * collapse back together:
 *
 * 1. **Severity of a cut, not its season.** The owner asked for "spring prune
 *    and winter prune". The date already says which season it was; what the
 *    date can never say is how much came off. `Dead leaves` and `Trim back`
 *    are tidying, `Hard prune` is an intervention — and only the last pairs
 *    with ratings on What works.
 * 2. **Routine versus action.** `Rotate`, `Wipe leaves`, `Mist`, `Dead leaves`
 *    and `Trim back` are counted and never paired. Without that, a plant
 *    rotated weekly would bury its own annual repot.
 */
export type CareEventType =
  | 'Water' | 'Feed' | 'Prune' | 'Repot' | 'Photo'
  | 'Inspect' | 'Support' | 'Pest treat' | 'Other'
  // Actions — a rating can sit either side of these.
  | 'Top-dress' | 'Soil flush' | 'Took cuttings' | 'Hard prune'
  // Routine — counted only, never paired with a rating.
  | 'Dead leaves' | 'Trim back' | 'Rotate' | 'Wipe leaves' | 'Mist';

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

/**
 * Takes back an entry that was just written, without removing it.
 *
 * **Why this exists.** Care logs commit the moment they are written
 * (2026-09-18 — see `db/events.ts`), so the numbers are always true. That left
 * nothing at all between a mis-tap and a permanent entry, and the owner asked
 * for exactly one thing: to be able to unselect a plant they had just logged
 * by mistake.
 *
 * **Why it is an event and not a delete.** Rule 5 — entries are append-only,
 * and that is what makes two-device merging safe. An entry deleted here could
 * walk back in from a backup or another device's copy and there would be no
 * record of the intent to remove it. A `Void` travels with the log, merges
 * like anything else, and says plainly that this happened and was taken back.
 *
 * Derived state skips the entry it names. History still shows both, because
 * "watered then undone" is a truer account of the morning than silence.
 *
 * It is not a general correction mechanism and must not grow into one. The
 * owner's mistaken watering of 008-ALO on 14 Sep stays in the record; this
 * only ever applies to an entry written moments ago, from the screen that
 * wrote it.
 */
export interface VoidEvent extends EventCommon {
  type: 'Void';
  /** The entry being taken back. Always on the same plant. */
  voids: EventId;
}

/** Section 4. `archived`, `archived_date` and `archived_reason` come from this. */
export interface ArchiveEvent extends EventCommon {
  type: 'Archive';
  plant_id: PlantId;
  /** The reason. Required here, <= 120 chars — it becomes `archived_reason`. */
  note: string;
}

/** What travels in `events.json`. */
export type PlantEvent = CareEvent | RateEvent | EditEvent | ArchiveEvent | VoidEvent;

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
