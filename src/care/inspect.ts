import type { CareEvent, StoredEvent } from '../types/event';
import type { ISODate, PlantId } from '../types/ids';
import { addDays } from '../lib/dates';

/**
 * Looking at a plant and deciding it does not need watering yet.
 *
 * ## The gap this fills
 *
 * A plant goes past its interval, Home says so, the owner goes and looks, the
 * soil is still wet — and until now there was nothing to do about it. Logging
 * a watering would be a lie. Logging nothing left the plant shouting the same
 * thing tomorrow, and the day after. `Inspect` already existed as an entry
 * type, and already left the watering history alone, but it had no way to say
 * **when to look again**, so it quieted nothing.
 *
 * ## Why the recheck lives on the entry
 *
 * Not as a `next_check` field on the plant, which is what it looks like it
 * wants to be. That would be state patched in place, and rule 10 says derived
 * state is rebuilt from the log and never patched. So the entry carries
 * `recheck_days`, the live state is **derived** — the most recent `Inspect`
 * whose recheck date has not yet passed — and a year from now the record reads
 * as one fact: *looked at it on 3 Oct, still moist, come back in four days.*
 *
 * Their GPT approved this shape on 2026-10-01.
 *
 * ## Why the chip sets the delay
 *
 * A flat three days was invented, and the owner was right to refuse it. The
 * first replacement — a fraction of the plant's watering interval — was also
 * wrong, and the owner caught that too: **a plant only reaches the attention
 * list once it is already past due**, so there is never a remaining interval to
 * wait out. Every check made from that screen is the exhausted case.
 *
 * What is left is the only thing that actually varies: **what the soil looked
 * like.** Still wet on a plant that waters weekly is a different wait from
 * nearly dry. So the chip chooses, scaled to that plant's own interval, and the
 * owner can always override.
 */

/** Section 6 of the 1 Oct agreement. Optional — a check with no reason is
    still a check, and the owner must not be made to classify on a walk. */
export type InspectReason =
  | 'still_moist'
  | 'looks_fine'
  | 'drying_normally'
  | 'needs_watching'
  | 'standing_water'
  | 'other';

export const INSPECT_REASONS: readonly InspectReason[] = [
  'still_moist', 'looks_fine', 'drying_normally', 'needs_watching', 'standing_water', 'other',
];

export const REASON_TEXT: Record<InspectReason, string> = {
  still_moist: 'Still moist',
  looks_fine: 'Looks fine',
  drying_normally: 'Drying normally',
  needs_watching: 'Needs watching',
  standing_water: 'Standing water',
  other: 'Other',
};

/**
 * The defer table, agreed with the owner and their GPT on 2026-10-01.
 *
 * A fraction of the plant's own watering interval, floored and capped — except
 * the two that describe something wrong, which are short and flat because the
 * interval has nothing to do with how fast a problem develops.
 *
 * `null` means "no fraction, use the fixed days".
 */
const DEFER: Record<InspectReason | 'none', { fraction: number | null; min: number; max: number }> = {
  // Genuinely not ready. The longest wait, and if it keeps happening the
  // interval itself is probably wrong — which is the AI's observation to make
  // in a review round, never the app's to apply on its own.
  still_moist: { fraction: 0.5, min: 3, max: 10 },
  looks_fine: { fraction: 0.33, min: 2, max: 7 },
  none: { fraction: 0.33, min: 2, max: 7 },
  // On its way. Short, because it will be ready soon.
  drying_normally: { fraction: 0.2, min: 2, max: 4 },
  // Something is off and the owner is not diagnosing it yet. Come back quickly.
  needs_watching: { fraction: null, min: 2, max: 2 },
  // Roots in water get worse while you wait. See `standingWaterNeedsAction`.
  standing_water: { fraction: null, min: 2, max: 2 },
  other: { fraction: 0.33, min: 2, max: 7 },
};

/** How many days before this plant is worth looking at again. */
export function deferDays(reason: InspectReason | null, interval_days: number | null): number {
  const rule = DEFER[reason ?? 'none'];
  if (rule.fraction === null) return rule.min;
  // A plant with no tracked interval has nothing to scale against, so it gets
  // the floor rather than an invented number.
  if (!interval_days || interval_days <= 0) return rule.min;
  const scaled = Math.round(interval_days * rule.fraction);
  return Math.min(rule.max, Math.max(rule.min, scaled));
}

/**
 * The one reason that is not simply "nothing to do here".
 *
 * Every other chip records a judgement that the plant is fine for now.
 * Standing water is a condition that is still true when the owner walks away,
 * and it gets worse while it waits — so the screen asks whether it was dealt
 * with, and an undrained plant does not leave the list however long the
 * recheck is.
 */
export function standingWaterNeedsAction(reason: InspectReason | null): boolean {
  return reason === 'standing_water';
}

/** Offered beside the computed default, so an override is one tap rather than
    a dozen on a stepper. */
export const RECHECK_CHOICES: readonly number[] = [2, 3, 5, 7, 10];

/* -------------------------------------------------------------------------- */
/* Reading the log back                                                        */
/* -------------------------------------------------------------------------- */

export interface LiveRecheck {
  /** The entry that set it. */
  event_id: string;
  /** When it was looked at. */
  checked: ISODate;
  /** The first date it is worth looking again. */
  until: ISODate;
  reason: InspectReason | null;
  /** Standing water that was not drained: never quiet, whatever the date says. */
  unresolved: boolean;
}

/** The stored shape of an inspection, narrowed off the log. */
export type StoredInspect = StoredEvent & Pick<CareEvent, 'reason' | 'recheck_days' | 'resolved'>;

const isInspect = (e: StoredEvent): e is StoredInspect => e.type === 'Inspect';

/**
 * The recheck in force, from one plant's inspections.
 *
 * The form `derive.ts` uses: it already has each plant's entries in hand with
 * voided ones dropped, so handing it the whole log again would be the fold
 * doing its own work twice.
 */
export function liveRecheckFrom(
  inspects: readonly StoredInspect[],
  as_of: ISODate,
): LiveRecheck | null {
  let best: LiveRecheck | null = null;

  for (const e of inspects) {
    if (!e.recheck_days) continue;
    /**
     * A check dated in the future quiets nothing.
     *
     * Found by the Run 2 harness on 2026-10-02: the detail form lets the owner
     * set the date, so one mistyped year would have hidden a plant for twelve
     * months with nothing on screen saying why. A recheck is a promise to look
     * again after a look that has already happened.
     */
    if (e.date > as_of) continue;
    const unresolved = standingWaterNeedsAction(e.reason ?? null) && e.resolved === false;
    // Later entry wins. Equal dates fall to the later one in the log, which is
    // the later one in time — entries are appended in order and sorted by date.
    if (!best || e.date >= best.checked) {
      best = {
        event_id: e.event_id,
        checked: e.date,
        until: addDays(e.date, e.recheck_days),
        reason: e.reason ?? null,
        unresolved,
      };
    }
  }

  if (!best) return null;
  // Expired: the day named by `until` is the day it comes back, so it is live
  // only while today is before it. Dates are fixed-width, so a string compare
  // is a date compare. An unresolved standing-water check never expires into
  // silence — it stays, and `isDeferred` keeps the plant on the board.
  if (!best.unresolved && as_of >= best.until) return null;
  return best;
}

/**
 * The recheck in force for one plant, read off the whole log.
 *
 * `voided` is passed in rather than recomputed because the fold already knows
 * which entries have been taken back, and a voided inspection must not keep a
 * plant quiet.
 */
export function liveRecheck(
  events: readonly StoredEvent[],
  plant_id: PlantId,
  as_of: ISODate,
  voided: ReadonlySet<string> = new Set(),
): LiveRecheck | null {
  return liveRecheckFrom(
    events.filter((e): e is StoredInspect =>
      e.plant_id === plant_id && isInspect(e) && !voided.has(e.event_id)),
    as_of,
  );
}

/**
 * Should this plant sit out of the attention lists?
 *
 * Only while a recheck is live AND the thing it recorded was "nothing to do
 * here". **Standing water that was never drained is the exception**: the owner
 * said it was not dealt with, so the board keeps showing it.
 */
export function isDeferred(recheck: LiveRecheck | null): boolean {
  return recheck !== null && !recheck.unresolved;
}
