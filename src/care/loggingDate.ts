import type { ISODate } from '../types/ids';

/**
 * The date care is being logged for.
 *
 * ## Why this exists
 *
 * The owner watered a whole session and forgot to log it. A plant's own Log
 * care page has always had a date field, so one plant could be backdated — but
 * a round, the screen built for doing fifteen plants at once, stamped
 * everything with today. A missed session therefore meant fifteen separate
 * visits, which is enough friction that it does not get done, and a week of
 * real care goes unrecorded.
 *
 * ## Why it is held here and not in a component
 *
 * It outlives the screen. Set it on Log care, open a plant, come back, and it
 * is still Tuesday. That is the owner's ask — and it is also the dangerous
 * part, so the rules below are deliberately narrow.
 *
 * ## The rules
 *
 * **It resets at midnight, and on app restart.** Held in memory, never
 * persisted, and stamped with the day it was set: if that day is not today,
 * it is spent. Forgetting a date you set yesterday and silently writing
 * today's care onto it is the one failure this feature could cause that the
 * owner would not notice, and entries are permanent.
 *
 * **It can never be in the future.** You cannot water tomorrow. The same rule
 * the date input enforces, enforced again here, because the fold must be right
 * whatever reaches it.
 *
 * **Home ignores it entirely.** The owner's call, and the right one: Home's
 * board is about what is due *now*, and a backdated tick there would make rows
 * vanish for reasons tied to a date not visible from that screen. The control
 * lives on Log care, and so does its effect.
 *
 * **Photos and ratings are never backdated.** Not a scope decision — a
 * correctness one. A photograph shows what the plant looks like at the moment
 * it is taken, and a rating is a judgement made today. Care is the only thing
 * here that can honestly have happened earlier.
 */

interface State {
  /** The date chosen, or null for "today". */
  date: ISODate | null;
  /** The day the choice was made. A choice made yesterday is spent. */
  chosen_on: ISODate | null;
}

let state: State = { date: null, chosen_on: null };
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The raw store, for `useSyncExternalStore`. Compare against `today` with
    `loggingDate` rather than reading this directly. */
export function getSnapshot(): State {
  return state;
}

/**
 * The date care logged right now should carry.
 *
 * Returns `today` unless a date was chosen today, is in the past, and has not
 * been spent by the clock rolling over.
 */
export function loggingDate(today: ISODate): ISODate {
  if (!state.date || state.chosen_on !== today) return today;
  if (state.date > today) return today;
  return state.date;
}

/** True when logging is pointed at some day other than today — which is what
    every screen that can log has to say out loud. */
export function isBackdated(today: ISODate): boolean {
  return loggingDate(today) !== today;
}

export function setLoggingDate(date: ISODate, today: ISODate): void {
  // A future date is refused rather than clamped: silently moving the owner's
  // choice is worse than ignoring it, because they would not know it happened.
  state = date > today || date === today
    ? { date: null, chosen_on: null }
    : { date, chosen_on: today };
  notify();
}

/** Back to today. The one-tap escape, because a picker you have to scroll back
    is a reason not to use the feature at all. */
export function resetLoggingDate(): void {
  state = { date: null, chosen_on: null };
  notify();
}
