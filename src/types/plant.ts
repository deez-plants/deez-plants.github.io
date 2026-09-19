import type {
  DeviceId, ISODate, InstructionId, MediaId, PackageId, PlantId,
} from './ids';

/** Section 4 status. Integer only — a decimal on a single plant is a bug (3b). */
export type Health = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Section 3. Never rendered as a score out of ten. */
export type Adherence = 'on' | 'slip' | 'behind';

/** Section 4. Derived from who last wrote the number. There is no `App`. */
export type HealthSource = 'Me' | 'AI';

/** Section 4. A judgement, not a computation — `editable_by: both`. */
export type StatusLabel = 'Stable' | 'Improving' | 'Declining' | 'Needs attention';

/** Section 4 care spec. Summer is in force Mar-Oct, winter Nov-Feb. */
export type Season = 'summer' | 'winter';

/** Section 6b. One tap at capture, never a text field. */
export type MediaLabel = 'whole' | 'leaf' | 'soil' | 'roots';

/**
 * The registry record: a plant as it entered the world, written once and never
 * touched again. Every later change to any field is an event. See DECISION 1.
 *
 * `health` is deliberately absent. A plant has no health until a `Rate` event
 * exists — that is rule 1 expressed in the type system rather than in a comment.
 * `care_instructions` is likewise absent: always folded from events.
 */
export interface PlantBaseline {
  plant_id: PlantId;
  name: string;
  species: string;
  /** `MMM YYYY`. Null when unknown. */
  acquired: string | null;
  room: string;
  /** Where in the room, in the owner's own words — "bookshelf", "by the
      window". Split out of `room` on 2026-09-08; see section 4, Placement. */
  spot: string;
  pot: string;
  /** A key into the planter registry. Null means own pot. */
  planter: string | null;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
  /** Section 4, Reference. Six longer free-text fields behind "More about
      this plant" — mostly species knowledge the AI can propose, which is why
      they are `editable_by: both`. Null until somebody fills them. */
  environment: string | null;
  repotting: string | null;
  pruning: string | null;
  pests: string | null;
  season: string | null;
  propagation: string | null;
  notes_user: string;
  status_label: StatusLabel | null;
  do_next: string | null;
  created: ISODate;
  created_by: DeviceId;
  origin: 'seed' | 'user';
}

/** Section 6c. A list, not a blob. Each item stands alone. */
export interface CareInstruction {
  instruction_id: InstructionId;
  /** <= 200 chars. */
  text: string;
  added: ISODate;
  source: 'ai' | 'user';
  package_id: PackageId | null;
  replaces: InstructionId | null;
}

/** Section 4 placement. A user-editable registry, not a fixed enum. */
export interface Planter {
  name: string;
  /** True = one soak serves all. False = a selection gesture, not a care claim. */
  shared_water: boolean;
  note?: string;
}

export interface Registry {
  rooms: string[];
  planters: Planter[];
  updated: ISODate;
}

export interface PhotoRecord {
  media_id: MediaId;
  plant_id: PlantId;
  date: ISODate;
  labels: MediaLabel[];
  /** True for the four `extra-*` files that show more than one plant. */
  shared_frame: boolean;
}

/* -------------------------------------------------------------------------- */
/* Field permissions — section 4's `editable_by` column, as data.              */
/* validate.ts (section 11 rules 5, 6, 6a) reads these; it does not re-list.   */
/* -------------------------------------------------------------------------- */

/**
 * The agreed contract length for the six reference fields, applied to the
 * owner's own editor so their limit matches the one the importer enforces on
 * a proposal. See `TEXT_MAX` in `package/validate.ts` for the figures and the
 * reasoning behind them.
 */
export const REFERENCE_MAX = 200;

/** `editable_by: both`. The only fields an update file may name. */
export const AI_EDITABLE_FIELDS = [
  'species',
  'water_interval_days',
  'water_interval_days_winter',
  'feed',
  'light',
  'soil',
  'environment',
  'repotting',
  'pruning',
  'pests',
  'season',
  'propagation',
  'health',
  'status_label',
  'do_next',
  'care_instructions',
  'collection_care_instructions',
] as const;

/** `editable_by: user`. Yours alone. Rules 6 and 6a reject any file naming one. */
export const USER_ONLY_FIELDS = [
  'name',
  'acquired',
  'room',
  'spot',
  'pot',
  'planter',
  'notes_user',
  'collection_notes_user',
  'hero_media',
  /** Which two photographs What works compares. See `compare_media` in
      FIELD_DEFINITIONS.md section 4 — a presentation preference the owner sets,
      stored as a plant field so it survives a backup and restore the way the
      hero does. */
  'compare_media',
] as const;

/** `editable_by: derived`. Recomputed from events; never written, never proposed. */
export const DERIVED_FIELDS = [
  'archived',
  'archived_date',
  'archived_reason',
  'health_source',
  'health_confirmed',
  'health_changed',
  'health_stale',
  'adherence',
  'on_time_count',
  'care_count',
  'avg_days_late',
  'last_checked',
] as const;

export type AiEditableField = (typeof AI_EDITABLE_FIELDS)[number];
export type UserOnlyField = (typeof USER_ONLY_FIELDS)[number];
export type DerivedField = (typeof DERIVED_FIELDS)[number];

/** Everything an `Edit` event may target. `health` is excluded — it is a `Rate`. */
export type EditableField = Exclude<AiEditableField, 'health'> | UserOnlyField;
