import type { DeezDB } from '../db/schema';
import type { ClockTime, DeviceId, EventId, ISODate, PlantId } from '../types/ids';
import type { CareEvent, CareEventType, StoredEvent } from '../types/event';
import type { DerivedPlant, DerivedState } from '../types/derived';
import type { Registry } from '../types/plant';
import { appendEvents, commitUpdate, deviceId, mintEventId, nowClockTime } from '../db/events';
import { daysBetween } from '../lib/dates';

/**
 * The care round: one action, many plants, one event each.
 *
 * Section 13 says this is 90% of all use and must never require per-plant
 * navigation. Section 5 says the app writes one event per plant with
 * `source: round` and never a single grouped event, so history stays per-plant
 * and accurate.
 *
 * Everything above `logRound` is pure. The screen is a projection of derived
 * state plus a selection, which is what makes the whole of it testable without
 * a database.
 */

/** The three big buttons. Everything else is a one-plant action with detail. */
export const ROUND_ACTIONS = ['Water', 'Feed', 'Prune'] as const;
export type RoundAction = (typeof ROUND_ACTIONS)[number];

export interface RoundDraft {
  action: RoundAction | null;
  /** Selection order is irrelevant; the fold sorts by date, time and event_id. */
  selected: readonly PlantId[];
  /** Applies to every plant in the round. Section 5 caps a note at 400 chars. */
  note: string;
}

export const EMPTY_DRAFT: RoundDraft = { action: null, selected: [], note: '' };

export const NOTE_MAX = 400;

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rule 9: past the interval is a prompt to look, not proof the plant needs
 * water. So this is only ever used to pre-select and to sort — no caller may
 * render it as "water overdue".
 */
export function isPastInterval(p: DerivedPlant): boolean {
  return p.adherence.days_past !== null && p.adherence.days_past >= 0;
}

/**
 * Only `Water` has an interval to be past — adherence counts waterings and
 * nothing else. Feed and Prune therefore start empty rather than guessing at a
 * schedule the record does not hold.
 */
export function preselectFor(action: RoundAction, plants: DerivedPlant[]): PlantId[] {
  if (action !== 'Water') return [];
  return plants.filter(isPastInterval).map((p) => p.plant_id);
}

/** Active plants only. An archived plant is not a valid `plant_id` for an event. */
export function roundCandidates(state: DerivedState): DerivedPlant[] {
  return state.order.map((id) => state.plants[id]).filter((p) => !p.archived);
}

export function toggle(selected: readonly PlantId[], id: PlantId): PlantId[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** Chips add to the selection rather than replacing it — they read `+ Kitchen`. */
export function addAll(selected: readonly PlantId[], ids: readonly PlantId[]): PlantId[] {
  return [...selected, ...ids.filter((id) => !selected.includes(id))];
}

export interface SelectionGroup {
  name: string;
  ids: PlantId[];
  /** True when the planter's registry entry says one soak serves the group. */
  shared_water: boolean;
}

/**
 * Planters only — a shared-soil planter is a care fact, one soak really does
 * serve all of them. Rooms are not a group here: with most of the collection
 * sitting in the same living room, a room chip would just be a second "All"
 * button. Groups of one are dropped: a chip that selects a single plant is
 * slower than the row itself.
 */
export function selectionGroups(plants: DerivedPlant[], registry: Registry): SelectionGroup[] {
  const shared = new Map(registry.planters.map((p) => [p.name, p.shared_water]));
  const planters = new Map<string, PlantId[]>();

  for (const p of plants) {
    if (!p.planter) continue;
    const list = planters.get(p.planter);
    if (list) list.push(p.plant_id);
    else planters.set(p.planter, [p.plant_id]);
  }

  return [...planters]
    .map(([name, ids]) => ({ name, ids, shared_water: shared.get(name) ?? false }))
    .filter((g) => g.ids.length > 1);
}

/* -------------------------------------------------------------------------- */
/* The per-row line                                                            */
/* -------------------------------------------------------------------------- */

export type RowTone = 'past' | 'due' | 'quiet';

export interface RowStatus {
  text: string;
  tone: RowTone;
}

/** Most recent event of the given type on that plant, from the raw log. */
export function lastOfType(
  events: readonly StoredEvent[],
  plant_id: PlantId,
  type: RoundAction,
): ISODate | null {
  let latest: ISODate | null = null;
  for (const e of events) {
    if (e.plant_id !== plant_id || e.type !== type) continue;
    if (!latest || e.date > latest) latest = e.date;
  }
  return latest;
}

/**
 * What each row says under the name.
 *
 * Rule 9 is the whole of the design here. For water this reports the interval
 * and the elapsed days and stops — "6 days past the 7-day interval" is a fact
 * about the calendar, and the row never turns it into "needs water". For feed
 * and prune there is no interval in the record at all, so the row states the
 * last date and nothing more rather than inventing a schedule to be late
 * against.
 */
export function rowStatus(
  action: RoundAction,
  p: DerivedPlant,
  events: readonly StoredEvent[],
  as_of: ISODate,
): RowStatus {
  if (action === 'Water') {
    const { days_past, interval_days } = p.adherence;
    if (days_past === null || interval_days === null) {
      return { text: 'No watering logged yet', tone: 'quiet' };
    }
    if (days_past > 0) {
      return {
        text: `${days_past} day${days_past === 1 ? '' : 's'} past the ${interval_days}-day interval`,
        tone: 'past',
      };
    }
    if (days_past === 0) return { text: `${interval_days}-day interval is up today`, tone: 'due' };
    // `days_past` is negative here, so its negation is the days remaining.
    const left = -days_past;
    return {
      text: `${left} day${left === 1 ? '' : 's'} left of a ${interval_days}-day interval`,
      tone: 'quiet',
    };
  }

  const last = lastOfType(events, p.plant_id, action);
  const verb = action === 'Feed' ? 'fed' : 'pruned';
  if (!last) return { text: `Never ${verb}`, tone: 'quiet' };
  const ago = daysBetween(last, as_of);
  return { text: `Last ${verb} ${ago} day${ago === 1 ? '' : 's'} ago`, tone: 'quiet' };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export function roundHeading(action: RoundAction): string {
  return `Who did you ${action.toLowerCase()}?`;
}

/** The chip is tight on space — "Decorative" doesn't earn its width there. */
export function groupLabel(name: string): string {
  return name.replace(/\s*Decorative\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

export function roundButtonLabel(draft: RoundDraft): string {
  if (!draft.action) return 'Pick an action';
  if (!draft.selected.length) return 'Select at least one plant';
  const n = draft.selected.length;
  return `Log ${draft.action.toLowerCase()} for ${n} plant${n === 1 ? '' : 's'}`;
}

export function eventCount(count: number): string {
  return `${count} event${count === 1 ? '' : 's'}`;
}

/* -------------------------------------------------------------------------- */
/* Writing the round                                                           */
/* -------------------------------------------------------------------------- */

export interface RoundContext {
  device_id: DeviceId;
  date: ISODate;
  time: ClockTime;
}

/**
 * One event per plant, `source: round`, all sharing the round's date, time and
 * note. Pure but for the random tail of each `event_id`, which is what makes
 * them unique across devices.
 */
export function buildRoundEvents(draft: RoundDraft, ctx: RoundContext): CareEvent[] {
  const { action } = draft;
  if (!action) throw new Error('A round needs an action.');
  if (!draft.selected.length) throw new Error('A round needs at least one plant.');

  const note = draft.note.trim();
  if (note.length > NOTE_MAX) throw new Error(`A note is at most ${NOTE_MAX} characters.`);

  return draft.selected.map((plant_id) => ({
    event_id: mintEventId(ctx.device_id, ctx.date, ctx.time),
    plant_id,
    type: action,
    date: ctx.date,
    time: ctx.time,
    ...(note ? { note } : {}),
    source: 'round' as const,
    device_id: ctx.device_id,
  }));
}

export interface LoggedRound {
  action: RoundAction;
  event_ids: EventId[];
}

/**
 * Log the round. Instant and local — the events land pending and move no number
 * until Update folds them in (section 5).
 */
export async function logRound(
  db: DeezDB,
  draft: RoundDraft,
  today: ISODate,
): Promise<LoggedRound> {
  const action = draft.action;
  if (!action) throw new Error('A round needs an action.');
  const ctx: RoundContext = { device_id: await deviceId(db), date: today, time: nowClockTime() };
  const written = await appendEvents(db, buildRoundEvents(draft, ctx));
  return { action, event_ids: written.map((e) => e.event_id) };
}

/**
 * The commit, re-exported so the care screen has one import: the Update button
 * here and the one on Home are the same action, not two implementations.
 */
export { commitUpdate };
export type { CommitResult } from '../db/events';

/* -------------------------------------------------------------------------- */
/* One plant, with detail (screen 05's "ONE PLANT, WITH DETAIL")              */
/* -------------------------------------------------------------------------- */

/**
 * The care-type grid. Distinct from `ROUND_ACTIONS`: the round is Water,
 * Feed, Prune only — everything else has always been a one-plant action
 * (`preselectFor`'s own comment). `source: 'user'`, never `'round'` — this is
 * one plant, one tap, not a batch.
 *
 * **Three tiers, two of them collapsed** (settled with the owner 2026-09-13,
 * drawn as Round 4 of the screens mock-up page). Nine types became eighteen,
 * and fifteen-plus equal buttons would have made watering — which happens
 * constantly — compete for the eye with taking cuttings, which happens twice
 * a year.
 *
 * The principle, in case this is ever flattened back: **richer data, quieter
 * screen.** Every type is real, logged properly and counted. The screen gives
 * each the weight it earns in use. With both lower tiers shut this is
 * *shorter* than the nine-button grid it replaces.
 *
 * `ROUTINE_TIER` is in the owner's own order, most frequent first. Do not
 * re-sort it alphabetically or by the order of `CareEventType` — dead leaves
 * leads because that is what they actually do most.
 */
export const COMMON_TIER: readonly CareEventType[] = [
  'Water', 'Feed', 'Inspect', 'Prune',
];

export const ROUTINE_TIER: readonly CareEventType[] = [
  'Dead leaves', 'Trim back', 'Rotate', 'Wipe leaves', 'Mist',
];

export const RARE_TIER: readonly CareEventType[] = [
  'Photo', 'Repot', 'Support', 'Pest treat',
  'Hard prune', 'Top-dress', 'Soil flush', 'Took cuttings', 'Other',
];

/**
 * Every type the grid offers, flattened.
 *
 * Kept exhaustive on purpose: a type that exists in the model but appears in
 * no tier would be unloggable, and nothing else in the app would notice.
 * `check/care.check.cjs` asserts the tiers cover `CareEventType` exactly.
 */
export const CARE_TYPES: readonly CareEventType[] = [
  ...COMMON_TIER, ...ROUTINE_TIER, ...RARE_TIER,
];

export interface DetailDraft {
  type: CareEventType | null;
  /** Prefilled to now, editable — "a different time on it" is the whole point
      of this mode over the round. */
  date: ISODate;
  time: ClockTime;
  note: string;
}

export function emptyDetailDraft(as_of: ISODate): DetailDraft {
  return { type: null, date: as_of, time: nowClockTime(), note: '' };
}

export function buildDetailEvent(
  plant_id: PlantId,
  draft: DetailDraft,
  ctx: { device_id: DeviceId },
): CareEvent {
  if (!draft.type) throw new Error('Pick what you did.');
  const note = draft.note.trim();
  if (note.length > NOTE_MAX) throw new Error(`A note is at most ${NOTE_MAX} characters.`);

  return {
    event_id: mintEventId(ctx.device_id, draft.date, draft.time),
    plant_id,
    type: draft.type,
    date: draft.date,
    time: draft.time,
    ...(note ? { note } : {}),
    source: 'user',
    device_id: ctx.device_id,
  };
}

/** Instant and local, same as a round's write — pending until Update. */
export async function logDetailEvent(
  db: DeezDB,
  plant_id: PlantId,
  draft: DetailDraft,
): Promise<EventId> {
  const device_id = await deviceId(db);
  const [written] = await appendEvents(db, [buildDetailEvent(plant_id, draft, { device_id })]);
  return written.event_id;
}
