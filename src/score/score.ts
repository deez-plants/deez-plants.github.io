import type { ISODate } from '../types/ids';
import type { DerivedCollection, DerivedHealth, DerivedPlant, DerivedState } from '../types/derived';
import type { HealthSource } from '../types/plant';
import { formatDayMonth } from '../lib/dates';

/**
 * What the score block is given, and the only ways to build it.
 *
 * These live beside the component rather than in each caller so that no screen
 * ever assembles the fields itself — rule 6 is about the block rendering
 * identically everywhere, and the surest way to break that is to let two
 * screens each decide what "previous" means.
 */

export interface ScoreReading {
  value: number;
  date: ISODate;
}

export interface ScoreBlockProps {
  /**
   * Line 1. Mono caps, dim. `HEALTH` unless the subject needs naming.
   *
   * `null` omits the line — see the amendment recorded in
   * `FIELD_DEFINITIONS.md` section 3b (2026-09-08). The label is carried
   * where the block is one card among several and would otherwise be
   * unidentifiable; it is dropped where the surrounding screen already says
   * what the number is — beside the plant's own photo on plant detail, and
   * in a plants-list row. Lines 2 and 3 never change, which is what rule 6
   * is actually protecting.
   */
  label?: string | null;
  /** Null is a legitimate, permanent state — the block then reads `Not rated`. */
  current: number | null;
  /** When the current value was last confirmed. */
  confirmed: ISODate | null;
  /** The reading before it. Null gives line 3 as `first record`. */
  previous: ScoreReading | null;
  /** ME / AI, shown beside the value so provenance is visible without opening anything. */
  source?: HealthSource | null;
  /** `health_confirmed` over 90 days old. A quiet marker, never an alarm (section 4). */
  stale?: boolean;
  /** Supply on screens where rating is possible. Absent, line 2 is text only. */
  onRate?: () => void;
}

/** Per-plant. "Previous" is your previous rating of that plant, whenever it was. */
export function plantScore(p: DerivedPlant, onRate?: () => void): ScoreBlockProps {
  return healthScore(p.health, onRate);
}

export function healthScore(h: DerivedHealth, onRate?: () => void): ScoreBlockProps {
  return {
    current: h.current,
    confirmed: h.confirmed,
    previous: h.previous ? { value: h.previous.value, date: h.previous.date } : null,
    source: h.source,
    stale: h.stale,
    onRate,
  };
}

/**
 * Section 4's worked example: "confirmed Aug 14 · unchanged since Jun 2".
 * `ScoreBlock` itself never renders this — it is fixed at three lines (rule 6)
 * and its line 3 already carries the previous *value*, not this sentence — so
 * callers that want the confirm/change gap spelled out show it beside the
 * block, on plant detail, from this adapter.
 *
 * Null when there is nothing to confirm yet (line 2 already reads `Not rated`
 * in that case). When `changed` equals `confirmed`, the rating just moved and
 * there is no gap to report, so only the confirm date is shown.
 */
export function confirmationLine(h: DerivedHealth): string | null {
  if (h.current === null || h.confirmed === null) return null;
  const confirmed = `confirmed ${formatDayMonth(h.confirmed)}`;
  if (h.changed === null || h.changed === h.confirmed) return confirmed;
  return `${confirmed} · unchanged since ${formatDayMonth(h.changed)}`;
}

/**
 * The collection average — the only place a fractional health figure
 * legitimately appears (3b). "Previous" here means the previous collection
 * average, and `confirmed` is the most recent rating anywhere in the
 * collection, because that is the date this average was last touched.
 */
export function collectionScore(state: DerivedState): ScoreBlockProps {
  const collection: DerivedCollection = state.collection;
  let confirmed: ISODate | null = null;
  let stale = true;
  for (const id of state.order) {
    const p = state.plants[id];
    if (p.archived || !p.health.confirmed) continue;
    if (!confirmed || p.health.confirmed > confirmed) confirmed = p.health.confirmed;
    if (!p.health.stale) stale = false;
  }

  return {
    current: collection.average_health,
    confirmed,
    previous: collection.average_previous,
    source: null,
    // Every rating in the collection has gone stale. Nobody has looked at
    // anything in three months, which is worth a marker on Home.
    stale: confirmed !== null && stale,
  };
}

/* -------------------------------------------------------------------------- */
/* Line 3                                                                      */
/* -------------------------------------------------------------------------- */

/** No band thresholds are specified anywhere in the spec — this is a
    reasonable reading of the mock's 1-10 scale, not a derived fact. Shared
    between Home's HEALTH block and Health history so a given average is
    never coloured differently on the two screens. */
export function healthBand(value: number): 'good' | 'holding' | 'struggling' {
  if (value >= 7) return 'good';
  if (value >= 4) return 'holding';
  return 'struggling';
}

/** Section 3b: under 0.05 reads `no change`, not `+0.0`. */
const NO_MOVEMENT = 0.05;

export interface Movement {
  text: string;
  tone: 'up' | 'down' | 'flat';
}

export function movement(current: number, previous: number): Movement {
  const delta = Math.round((current - previous) * 10) / 10;
  if (Math.abs(delta) < NO_MOVEMENT) return { text: 'no change', tone: 'flat' };
  return {
    text: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
    tone: delta > 0 ? 'up' : 'down',
  };
}

/* -------------------------------------------------------------------------- */
