import type { StoredEvent } from '../types/event';
import type { DerivedState, HealthReading } from '../types/derived';
import type { ISODate, PlantId } from '../types/ids';

/**
 * DESIGN_REFERENCE.md screen 18 — "the most interesting screen in the app:
 * each care change you made, with your ratings either side of it."
 *
 * And the sentence that governs every line of this file: **"Not a claim of
 * causation — the ratings are shown, the inference is yours."**
 *
 * So this module pairs, and refuses to conclude. It never sorts by "biggest
 * improvement", never labels a change as having worked, never computes an
 * average effect. It puts a change next to the two ratings that bracket it in
 * time and stops — because a plant's rating moves for a dozen reasons, most of
 * them not in this record at all, and the person who saw the plant is better
 * placed to judge than any arithmetic over two numbers.
 *
 * It is also why the delta carries its elapsed days everywhere, the same rule
 * §3b applies to the score block: a rating that rose two points over eight
 * months is a different fact from one that rose two points in a week, and
 * showing the number alone would let the reader assume the second.
 */

/** The care fields worth tracking. Changing any of these changes how the
    plant is looked after; changing its name or its room does not. */
const CARE_FIELDS = new Set([
  'water_interval_days',
  'water_interval_days_winter',
  'feed',
  'light',
  'soil',
  'pot',
]);

export const CARE_FIELD_LABEL: Record<string, string> = {
  water_interval_days: 'Watering interval',
  water_interval_days_winter: 'Winter watering interval',
  feed: 'Feed',
  light: 'Light',
  soil: 'Soil',
  pot: 'Pot',
};

export interface CareChange {
  event_id: string;
  plant_id: PlantId;
  plant_name: string;
  date: ISODate;
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  /** Who made the change — the AI proposes care spec, the owner approves. */
  source: string;
  /** The last rating on or before the change. Null if the plant was unrated. */
  before: HealthReading | null;
  /** The first rating strictly after it. Null while nobody has rated since. */
  after: HealthReading | null;
  /** after.value - before.value, or null when either side is missing. */
  delta: number | null;
  /** Days between the two readings — never show `delta` without it. */
  elapsed_days: number | null;
}

function daysBetween(a: ISODate, b: ISODate): number {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Every care change in the log, newest first, each carrying the ratings that
 * bracket it.
 *
 * Pending edits are included deliberately. A change you made this morning is
 * exactly the one you are most likely to be wondering about, and leaving it
 * out until Update would make this screen look empty at the moment it is most
 * interesting. Its `after` will simply be null until you rate the plant.
 */
export function careChanges(state: DerivedState, events: readonly StoredEvent[]): CareChange[] {
  const out: CareChange[] = [];

  for (const e of events) {
    if (e.type !== 'Edit' || !e.plant_id) continue;
    if (!CARE_FIELDS.has(e.field)) continue;
    const plant = state.plants[e.plant_id];
    if (!plant) continue;

    // `history` is oldest-first. "Before" is the last reading at or before the
    // change; a rating made the same day counts as before it, because you
    // looked at the plant and then changed something.
    const history = plant.health.history;
    let before: HealthReading | null = null;
    let after: HealthReading | null = null;
    for (const r of history) {
      if (r.date <= e.date) before = r;
      else if (!after) after = r;
    }

    const delta = before && after ? Number((after.value - before.value).toFixed(1)) : null;

    out.push({
      event_id: e.event_id,
      plant_id: e.plant_id,
      plant_name: plant.name,
      date: e.date,
      field: e.field,
      label: CARE_FIELD_LABEL[e.field] ?? e.field,
      from: e.from,
      to: e.to,
      source: e.source,
      before,
      after,
      delta,
      elapsed_days: before && after ? daysBetween(before.date, after.date) : null,
    });
  }

  // Newest first. Deliberately not "biggest change first": ordering by effect
  // size would be the app ranking what worked, which is the one thing screen
  // 18 says it must not do.
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** How many changes have a rating on both sides — the rest are still open. */
export function answeredCount(changes: readonly CareChange[]): number {
  return changes.filter((c) => c.delta !== null).length;
}
