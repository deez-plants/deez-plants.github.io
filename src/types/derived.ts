import type { DeviceId, EventId, ISODate, MediaId, PlantId } from './ids';
import type {
  Adherence, CareInstruction, Health, HealthSource, PlantBaseline, Registry, Season, StatusLabel,
} from './plant';
import type { StoredEvent } from './event';

/* -------------------------------------------------------------------------- */
/* Health — section 3b and "Confirming a rating is not a no-op" (section 4).   */
/* -------------------------------------------------------------------------- */

export interface HealthReading {
  event_id: EventId;
  date: ISODate;
  value: Health;
  source: HealthSource;
  device_id: DeviceId;
}

export interface DerivedHealth {
  /** Null until somebody rates it. "Not rated" is a legitimate, permanent state. */
  current: Health | null;
  source: HealthSource | null;
  /** Date of the most recent Rate event, whatever it said. */
  confirmed: ISODate | null;
  /**
   * Date the value last actually moved: the first reading in the trailing run of
   * equal values. 5(May 1), 7(Jun 2), 7(Aug 14) gives changed = Jun 2, which is
   * what "confirmed Aug 14 · unchanged since Jun 2" means.
   */
  changed: ISODate | null;
  /** confirmed more than 90 days before as_of. A quiet marker, never an alarm. */
  stale: boolean;
  /** The reading before current — the previous event, even if the value is equal. */
  previous: HealthReading | null;
  /** current minus previous.value. Under 0.05 renders "no change", not "+0.0". */
  delta: number | null;
  /** Days between the two readings. The delta is misleading without it (3b). */
  elapsed_days: number | null;
  history: HealthReading[];
  /**
   * Two devices rated the same plant at the same minute. Section 8: no silent
   * merge of a judgement — the app shows which device set it and you choose.
   */
  conflict: { kept: HealthReading; other: HealthReading } | null;
}

/* -------------------------------------------------------------------------- */
/* Adherence — section 3. Counts and days. Never a score out of ten.           */
/* -------------------------------------------------------------------------- */

/** One completed gap between consecutive waterings, scored against the interval. */
export interface WaterInterval {
  from: ISODate;
  to: ISODate;
  /** The interval in force on `from` — see DECISION 3. */
  interval_days: number;
  season: Season;
  /** 0 when on time or early. Never negative. */
  days_late: number;
}

export interface DerivedAdherence {
  state: Adherence;
  last_water: ISODate | null;
  /** Governing this cycle. Null when the plant has never been watered. */
  interval_days: number | null;
  season: Season | null;
  next_due: ISODate | null;
  /**
   * Days past next_due as of as_of; negative means days remaining. Rule 9: this
   * is a prompt to look, never proof the plant needs water. No caller may render
   * it as an instruction.
   */
  days_past: number | null;
  /** Completed intervals scored. Renders as "on time 14 of 18 waterings". */
  care_count: number;
  on_time_count: number;
  /** Mean lateness of the late ones only. Null when nothing was late. DECISION 3. */
  avg_days_late: number | null;
  intervals: WaterInterval[];
}

/* -------------------------------------------------------------------------- */
/* Attention — a surfacing rule, not the status_label field.                   */
/* -------------------------------------------------------------------------- */

/**
 * Why a plant is on the needs-attention list. Distinct from `status_label`,
 * which is a human or AI judgement stored on the plant (section 4,
 * editable_by: both). The app computes this list; it never writes that field.
 */
export type AttentionReason =
  | 'behind'          // more than 3 days past interval
  | 'slip'            // 1-3 days past
  | 'never_watered'
  | 'health_stale'    // confirmed over 90 days ago
  | 'unrated';

/* -------------------------------------------------------------------------- */

export interface DerivedPlant {
  plant_id: PlantId;

  /** Section 4 values after folding every Edit event over the baseline. */
  name: string;
  species: string;
  acquired: string | null;
  room: string;
  spot: string;
  pot: string;
  planter: string | null;
  /** True when the planter's registry entry says one soak serves the group. */
  planter_shared_water: boolean;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
  environment: string | null;
  repotting: string | null;
  pruning: string | null;
  pests: string | null;
  season: string | null;
  propagation: string | null;
  notes_user: string;
  status_label: StatusLabel | null;
  do_next: string | null;

  /** All three from the Archive event. No mutation exception anywhere. */
  archived: boolean;
  archived_date: ISODate | null;
  archived_reason: string | null;

  health: DerivedHealth;
  adherence: DerivedAdherence;
  care_instructions: CareInstruction[];

  photos: MediaId[];
  /** Chosen manually, usually not the newest. See FLAG B — needs a home in section 4. */
  hero: MediaId | null;

  /** Most recent event of any type on this plant. See DECISION 6. */
  last_checked: ISODate | null;
  attention: AttentionReason[];

  /** Which events behind this plant are uncommitted, for the pending badges. */
  pending_event_ids: EventId[];

  /** Per field: who set the value that is showing, and when. Provenance for free. */
  last_set_by: Record<string, { source: string; date: ISODate; device_id: DeviceId }>;
}

export interface DerivedCollection {
  /** Archived plants are excluded from this count and from the search list. */
  active_count: number;
  archived_count: number;
  rated_count: number;
  /**
   * Decimal mean of health.current across active rated plants — the only place a
   * fractional health figure legitimately appears (3b).
   */
  average_health: number | null;
  /** The average as it stood before the most recent Rate anywhere. FLAG D. */
  average_previous: { value: number; date: ISODate } | null;
  needs_attention: PlantId[];
  notes_user: string;
  care_instructions: CareInstruction[];
}

export interface DueDay {
  date: ISODate;
  plants: PlantId[];
}

export interface HistoryDay {
  date: ISODate;
  event_ids: EventId[];
}

export interface DerivedState {
  as_of: ISODate;
  /** Which call this was — the committed view, or the preview of Update. */
  included_pending: boolean;
  plants: Record<string, DerivedPlant>;
  /** Active first, then archived. Stable order for the list screens. */
  order: PlantId[];
  collection: DerivedCollection;
  /** Forward: what is due. Backward: what happened. Both stay (section 15). */
  calendar_forward: DueDay[];
  calendar_backward: HistoryDay[];
  pending_count: number;
  /**
   * Events naming a plant with no baseline — a merge that arrived before the
   * plant record did. They are excluded from the fold rather than dropped
   * silently, so the UI can say so instead of quietly losing a watering.
   */
  orphan_event_ids: EventId[];
}

/* -------------------------------------------------------------------------- */

export interface DeriveInput {
  baselines: PlantBaseline[];
  /** Every event, any order. The fold sorts them itself. */
  events: StoredEvent[];
  registry: Registry;
  /**
   * The clock, injected. Adherence and staleness both depend on "today", and a
   * function that reads Date.now() internally cannot be tested, cannot be
   * replayed to a past date for the What-works page, and gives two devices in
   * different time zones different answers from the same log.
   */
  as_of: ISODate;
  /**
   * False: the committed view — the numbers you see between Updates.
   * True: what Update would produce. Same function, called twice; the two-step
   * is the difference between the two results, not a separate code path.
   */
  include_pending: boolean;
}

/** The whole of db/derive.ts. Pure, total: no I/O, no clock, no randomness. */
export type Derive = (input: DeriveInput) => DerivedState;

/** Section 5: Update saves the state it replaced. The app keeps the last five. */
export interface Snapshot {
  taken: ISODate;
  state: DerivedState;
  folded_event_ids: EventId[];
}

export type { Adherence, Health, HealthSource, Season };
