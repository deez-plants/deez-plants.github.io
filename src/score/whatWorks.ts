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

/**
 * What counts as an intervention — something a rating can meaningfully sit
 * either side of.
 *
 * Room and spot are here because **moving a plant is the owner's most common
 * intervention**, and an earlier version of this file left them out as "not
 * care", which was wrong: where a plant stands is most of how it is looked
 * after. Leaving them out made the screen narrower than its purpose.
 */
const CARE_FIELDS = new Set([
  'water_interval_days',
  'water_interval_days_winter',
  'feed',
  'light',
  'soil',
  'pot',
  'room',
  'spot',
]);

export const CARE_FIELD_LABEL: Record<string, string> = {
  water_interval_days: 'Watering interval',
  water_interval_days_winter: 'Winter watering interval',
  feed: 'Feed',
  light: 'Light',
  soil: 'Soil',
  pot: 'Pot',
  room: 'Moved room',
  spot: 'Moved spot',
};

/**
 * Things *done* to a plant, as opposed to settings changed about it. A repot
 * or a hard prune is a bigger intervention than any spec edit, and looking
 * only at edits missed them entirely.
 *
 * Watering and feeding are deliberately absent. They are the routine the
 * adherence record already counts, and a rating either side of one watering
 * out of hundreds means nothing — putting them here would bury the repot
 * under the noise of ordinary care.
 */
const CARE_ACTIONS: Record<string, string> = {
  Repot: 'Repotted',
  Prune: 'Pruned',
  'Pest treat': 'Treated for pests',
  Support: 'Added support',
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
  /** A setting that changed, or a thing that was done. */
  kind: 'change' | 'action';
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

/**
 * Room and spot used to be one field. `db/migrateRoomSpot.ts` split them by
 * writing an `Edit` for each — so "Living room, by the window" became room
 * "Living Room" plus spot "by the window", on 21 plants at once.
 *
 * Those are indistinguishable from real moves by type alone, and left in they
 * would fill this screen with moves that never happened — on the owner's own
 * record, the very first thing it showed. They cannot be retagged after the
 * fact, because entries are append-only and rewriting history is the one thing
 * this design will not do.
 *
 * So they are recognised by what they are: **a pair of edits, made together,
 * that leave the plant in the same place.** Comparing the old combined string
 * against the new room and spot joined back together catches the migration
 * exactly, and catches any future edit that re-types a place without moving
 * it — which is also not a move.
 */
const normalisePlace = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface PlaceEdit { event_id: string; from: string | null; to: string | null }

function migrationBatches(events: readonly StoredEvent[]): Set<string> {
  const batches = new Map<string, { room?: PlaceEdit; spot?: PlaceEdit }>();
  for (const e of events) {
    if (e.type !== 'Edit' || !e.plant_id) continue;
    if (e.field !== 'room' && e.field !== 'spot') continue;
    const key = `${e.plant_id}|${e.date}|${e.time}`;
    const batch = batches.get(key) ?? {};
    batch[e.field] = { event_id: e.event_id, from: e.from, to: e.to };
    batches.set(key, batch);
  }

  const skip = new Set<string>();
  for (const { room, spot } of batches.values()) {
    if (!room || !spot) continue;
    const before = normalisePlace(room.from ?? '');
    const after = normalisePlace(`${room.to ?? ''} ${spot.to ?? ''}`);
    if (before && before === after) {
      skip.add(room.event_id);
      skip.add(spot.event_id);
    }
  }
  return skip;
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
export function careChanges(
  state: DerivedState,
  events: readonly StoredEvent[],
  only?: PlantId,
): CareChange[] {
  const out: CareChange[] = [];
  const reRecorded = migrationBatches(events);

  for (const e of events) {
    if (!e.plant_id) continue;
    if (reRecorded.has(e.event_id)) continue;
    if (only && e.plant_id !== only) continue;

    const isEdit = e.type === 'Edit' && CARE_FIELDS.has(e.field);
    const action = CARE_ACTIONS[e.type];
    if (!isEdit && !action) continue;

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
      field: isEdit ? e.field : e.type,
      label: isEdit ? (CARE_FIELD_LABEL[e.field] ?? e.field) : action,
      // An action has no from/to — it is a thing that happened, not a value
      // that changed. Its note is the only detail there is, and often the
      // useful one ("moved up a pot size").
      from: isEdit ? e.from : null,
      to: isEdit ? e.to : (e.note ?? null),
      kind: isEdit ? 'change' : 'action',
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

/* -------------------------------------------------------------------------- */
/* The photographs What works compares                                         */
/* -------------------------------------------------------------------------- */

export interface ComparePhoto {
  media_id: string;
  date: ISODate;
  label: string | null;
}

/**
 * The two photographs to put side by side, and whether the owner picked them.
 *
 * Their rule, 2026-09-12: **the last two full-plant photographs**, "because
 * that shows the work I have done".
 *
 * **Comparing like with like is the part that matters.** Every photo carries
 * one of four labels, and a whole-plant shot beside a leaf close-up *looks*
 * like change without being it — which on a screen whose whole job is judging
 * change would be actively misleading. So whole-plant shots are preferred, and
 * the fallback to anything else is deliberate and last.
 *
 * One whole-plant photograph means **no pair**. Say so rather than padding it
 * with a close-up; a pair that is not a comparison is worse than none.
 */
export function comparePhotos(
  plant: { compare: string[] | null },
  photos: readonly ComparePhoto[],
): { pair: ComparePhoto[]; chosen: boolean } {
  // An explicit choice wins and sticks until cleared — it must not expire
  // because a newer photograph arrived.
  if (plant.compare?.length) {
    const byId = new Map(photos.map((p) => [p.media_id, p]));
    const pair = plant.compare.map((id) => byId.get(id)).filter((p): p is ComparePhoto => !!p);
    if (pair.length) return { pair: sortOldestFirst(pair), chosen: true };
  }

  const whole = photos.filter((p) => p.label === 'whole');
  const pool = whole.length >= 2 ? whole : [];
  if (pool.length < 2) return { pair: [], chosen: false };

  // The last two, oldest of the pair first, so it reads then -> now.
  return { pair: sortOldestFirst(sortNewestFirst(pool).slice(0, 2)), chosen: false };
}

function sortNewestFirst(list: readonly ComparePhoto[]): ComparePhoto[] {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function sortOldestFirst(list: readonly ComparePhoto[]): ComparePhoto[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
