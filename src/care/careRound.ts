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

/**
 * The three tiers, shared by BOTH Log care screens.
 *
 * The owner asked for one interface: the all-plants round and a single
 * plant's page offer the same actions in the same shape, so there is nothing
 * to relearn between them. The only difference is what happens after you pick
 * — the round asks which plants, the plant page asks for a note and a time.
 *
 * `Inspect` sits in routine because that is what it is: looking at a plant is
 * something you do constantly and it is not an intervention a rating should
 * sit either side of.
 *
 * **`Prune` is deliberately absent from all three.** Dead leaves, Trim back
 * and Hard prune replaced it and say which, and a plain "Prune" between them
 * means nothing. **The type still exists** — entries are append-only and the
 * owner's historic Prune events must keep rendering — it simply can no longer
 * be chosen. Retiring a button is not the same as deleting a type, and only
 * one of those is safe.
 */
export const COMMON_TIER: readonly CareEventType[] = ['Water', 'Feed'];

export const ROUTINE_TIER: readonly CareEventType[] = [
  'Dead leaves', 'Trim back', 'Rotate', 'Wipe leaves', 'Mist', 'Inspect',
];

export const RARE_TIER: readonly CareEventType[] = [
  'Photo', 'Repot', 'Support', 'Pest treat',
  'Hard prune', 'Top-dress', 'Soil flush', 'Took cuttings', 'Other',
];

/**
 * Everything the grid offers, flattened.
 *
 * `check/care.check.cjs` asserts these cover `CareEventType` apart from the
 * retired `Prune`, so a type added to the model but to no tier fails there
 * rather than becoming quietly unloggable.
 */
export const CARE_TYPES: readonly CareEventType[] = [
  ...COMMON_TIER, ...ROUTINE_TIER, ...RARE_TIER,
];

/** Retired from the pickers, kept in the model so old entries still read. */
export const RETIRED_TYPES: readonly CareEventType[] = ['Prune'];

/**
 * What the round can do to many plants at once — now everything the plant
 * page can do.
 *
 * It used to be Water, Feed and Prune, then those plus the routine five. The
 * owner asked for the two screens to match, and they are right that a rule
 * about which types "deserve" a batch was mine rather than theirs. A round
 * writes one event per plant whatever the type, so nothing about the record
 * changes.
 *
 * **The one real cost, and it is theirs to weigh:** a round applies ONE note
 * to every plant in it. Repotting four plants from here gives four events
 * with the same note. The per-plant page is where a note that differs
 * belongs, and it is one tap away.
 */
export const ROUND_ACTIONS: readonly CareEventType[] = CARE_TYPES;
export type RoundAction = CareEventType;

/**
 * Copy per action. A template will not do: "Who did you water?" is fine and
 * "Who did you dead leaves?" is not.
 *
 * `past` is how a row reads when it has happened before — "Last fed 30 days
 * ago". Types with no natural past tense fall back to the label itself.
 */
const ROUND_COPY: Record<CareEventType, { heading: string; verb: string; past: string }> = {
  Water: { heading: 'Who did you water?', verb: 'water', past: 'watered' },
  Feed: { heading: 'Who did you feed?', verb: 'feed', past: 'fed' },
  Prune: { heading: 'Who did you prune?', verb: 'prune', past: 'pruned' },
  'Dead leaves': { heading: 'Whose dead leaves did you take off?', verb: 'dead leaves', past: 'tidied' },
  'Trim back': { heading: 'Who did you trim back?', verb: 'trim back', past: 'trimmed back' },
  Rotate: { heading: 'Who did you rotate?', verb: 'rotate', past: 'rotated' },
  'Wipe leaves': { heading: 'Whose leaves did you wipe?', verb: 'leaf wipe', past: 'wiped' },
  Mist: { heading: 'Who did you mist?', verb: 'mist', past: 'misted' },
  Inspect: { heading: 'Who did you look over?', verb: 'inspection', past: 'inspected' },
  Photo: { heading: 'Who did you photograph?', verb: 'photo', past: 'photographed' },
  Repot: { heading: 'Who did you repot?', verb: 'repot', past: 'repotted' },
  Support: { heading: 'Who did you add support to?', verb: 'support', past: 'staked' },
  'Pest treat': { heading: 'Who did you treat for pests?', verb: 'pest treatment', past: 'treated' },
  'Hard prune': { heading: 'Who did you cut back hard?', verb: 'hard prune', past: 'cut back' },
  'Top-dress': { heading: 'Who did you top-dress?', verb: 'top-dress', past: 'top-dressed' },
  'Soil flush': { heading: 'Whose soil did you flush?', verb: 'soil flush', past: 'flushed' },
  'Took cuttings': { heading: 'Who did you take cuttings from?', verb: 'cuttings', past: 'taken from' },
  Other: { heading: 'Who was it?', verb: 'it', past: 'logged' },
};

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
 * nothing else. Every other round action therefore starts empty rather than
 * guessing at a schedule the record does not hold. That includes the five
 * routine types: nothing anywhere says how often a plant should be rotated,
 * and inventing one would be rule 9 by the back door.
 */
export function preselectFor(
  action: RoundAction,
  plants: DerivedPlant[],
  done?: ReadonlySet<PlantId>,
): PlantId[] {
  if (action !== 'Water') return [];
  return plants
    .filter((p) => isPastInterval(p) && !done?.has(p.plant_id))
    .map((p) => p.plant_id);
}

/* -------------------------------------------------------------------------- */
/* Logged already today                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The care types where logging the same plant twice in a day is an accident
 * rather than a fact.
 *
 * Deliberately short. `Photo` can happen five times in a morning and each one
 * means something; `Inspect` twice in a day is two looks; `Dead leaves` this
 * morning and again tonight is two tidies. Only the two that describe a
 * single physical act are guarded, which is what the owner asked for.
 */
export const GUARD_DUPLICATES: readonly RoundAction[] = ['Water', 'Feed'];

/**
 * Plants that already have this action logged today, PENDING EVENTS INCLUDED.
 *
 * The pending part is the whole point. On the first real walk the owner opened
 * four plants one at a time and watered them, then reached for the fast
 * multi-select round and did not deselect those four — and the round showed
 * them as "6 days past the 7-day interval", because a care event moves no
 * number until Update folds it in. Four duplicate Water events on 14 Sep. The
 * app did not fail to warn them; it had nothing to warn with.
 *
 * So this reads the raw log rather than derived state, which is the only place
 * the last ten minutes exist yet.
 */
export function loggedTodayIds(
  action: RoundAction,
  plants: readonly DerivedPlant[],
  events: readonly StoredEvent[],
  as_of: ISODate,
): Set<PlantId> {
  const out = new Set<PlantId>();
  if (!GUARD_DUPLICATES.includes(action)) return out;
  for (const p of plants) {
    if (lastOfType(events, p.plant_id, action) === as_of) out.add(p.plant_id);
  }
  return out;
}

/** Active plants only. An archived plant is not a valid `plant_id` for an event. */
export function roundCandidates(state: DerivedState): DerivedPlant[] {
  return state.order.map((id) => state.plants[id]).filter((p) => !p.archived);
}

export function toggle(selected: readonly PlantId[], id: PlantId): PlantId[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/**
 * Chips add to the selection rather than replacing it — they read `+ Kitchen`.
 *
 * `done` is never swept back in: a bulk gesture must not silently re-select a
 * plant the owner has already watered by hand this morning. Tapping that
 * plant's own row still can — see `loggedTodayIds`.
 */
export function addAll(
  selected: readonly PlantId[],
  ids: readonly PlantId[],
  done?: ReadonlySet<PlantId>,
): PlantId[] {
  return [
    ...selected,
    ...ids.filter((id) => !selected.includes(id) && !done?.has(id)),
  ];
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

/** `done` = already logged today. See `GUARD_DUPLICATES`. */
export type RowTone = 'past' | 'due' | 'quiet' | 'done';

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
  // Before anything about intervals: if it was done today, that is the fact
  // about this plant, and the interval arithmetic underneath it is stale by
  // exactly the event the owner just wrote. See `loggedTodayIds`.
  if (GUARD_DUPLICATES.includes(action) && lastOfType(events, p.plant_id, action) === as_of) {
    return { text: `${ROUND_COPY[action].past} today`, tone: 'done' };
  }

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
  const verb = ROUND_COPY[action].past;
  if (!last) return { text: `Never ${verb}`, tone: 'quiet' };
  const ago = daysBetween(last, as_of);
  return { text: `Last ${verb} ${ago} day${ago === 1 ? '' : 's'} ago`, tone: 'quiet' };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a row asks before it will accept a second one today. Only ever seen for
 * `GUARD_DUPLICATES`, so only `water` and `feed` reach it.
 */
export function againPrompt(action: RoundAction): string {
  const verb = ROUND_COPY[action].verb;
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} again today? Tap to confirm`;
}

export function roundHeading(action: RoundAction): string {
  return ROUND_COPY[action].heading;
}

/** The chip is tight on space — "Decorative" doesn't earn its width there. */
export function groupLabel(name: string): string {
  return name.replace(/\s*Decorative\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

export function roundButtonLabel(draft: RoundDraft): string {
  if (!draft.action) return 'Pick an action';
  if (!draft.selected.length) return 'Select at least one plant';
  const n = draft.selected.length;
  return `Log ${ROUND_COPY[draft.action].verb} for ${n} plant${n === 1 ? '' : 's'}`;
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
 * The per-plant half of Log care. The tiers it renders are the shared ones
 * declared at the top of this file — both screens offer the same actions in
 * the same shape, which is what the owner asked for.
 */

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
