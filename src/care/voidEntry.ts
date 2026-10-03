import type { DeezDB } from '../db/schema';
import type { StoredEvent, VoidEvent } from '../types/event';
import type { EventId, ISODate } from '../types/ids';
import { appendEvents, deviceId, mintEventId, nowClockTime } from '../db/events';
import { CARE_TYPES, RETIRED_TYPES } from './careRound';

/**
 * Taking back an entry long after it was written.
 *
 * ## Why this took three asks to build
 *
 * The owner asked for it three times in different words — a longer undo, a list
 * of past actions, a way to take back a mis-tap — before it was clear they were
 * all one feature. The mechanism has existed since September: the `Void` event
 * type works, the fold already skips both entries, and merging across devices is
 * already safe. The only thing restricting it was **where the button lived**,
 * which was on the round you had just logged, before you left the screen.
 *
 * The wrong 008-ALO watering of 14 September still stands because of that.
 *
 * What made it overdue is the board. Making six things as easy to log as one
 * makes six things just as easy to mis-log, and ticking quickly while walking
 * round the flat is precisely how a wrong entry gets in.
 *
 * ## Never a deletion
 *
 * Rule 5, and it has no exceptions. A `Void` names the entry it takes back;
 * both stay in the log, neither counts, and history shows both. A deleted entry
 * could come back from a backup with no record of the intent to remove it —
 * which is the whole reason the model is append-only.
 *
 * A consequence worth saying out loud on the screen: **voiding an old watering
 * recalculates adherence**, so a figure the owner has already seen can move.
 * "On time 14 of 18" becomes "13 of 17". That is correct, and it is the point.
 *
 * ## Why only care entries, for now
 *
 * Settled with the owner on 1 October. Water, Feed, Inspect and the routine
 * types — the mis-tap they actually described. Deliberately not:
 *
 * - **Ratings.** Voiding one rolls health back to an earlier judgement, and
 *   there is already a cheaper answer: rate it again. Rule 7 makes that one tap.
 * - **Edits, including the AI's own.** The correction for a wrong value is a
 *   new edit, not a retraction, and voiding one tangles with the conflict rule
 *   that compares an AI proposal against the owner's last change.
 * - **Archive.** It has its own path and its own reason field.
 *
 * Small surface, covers the real case. Widening it later is a decision, not an
 * oversight.
 */

/** The three the owner chose. Optional — a reason is worth having and not
    worth blocking a correction over. */
export type VoidReason = 'wrong_plant' | 'didnt_do_it' | 'mis_tapped';

export const VOID_REASONS: readonly VoidReason[] = ['wrong_plant', 'didnt_do_it', 'mis_tapped'];

export const VOID_REASON_TEXT: Record<VoidReason, string> = {
  wrong_plant: 'Wrong plant',
  didnt_do_it: "Didn't do it",
  mis_tapped: 'Mis-tapped',
};

const VOIDABLE = new Set<string>([...CARE_TYPES, ...RETIRED_TYPES]);

/**
 * May this entry be taken back? Returns the reason it may not, or null.
 *
 * A sentence rather than a boolean, because every refusal here is one the owner
 * should be told the reason for — a greyed-out button that does not say why is
 * how a person decides the app is broken.
 */
export function voidBlocker(
  entry: StoredEvent,
  voided: ReadonlySet<string>,
): string | null {
  if (entry.type === 'Void') {
    return 'This entry is itself a correction. Taking back a correction would leave the record saying two opposite things.';
  }
  if (voided.has(entry.event_id)) {
    return 'This one has already been taken back.';
  }
  if (entry.type === 'Rate') {
    return 'A rating is not taken back — rate the plant again instead. Confirming or changing it is one tap and keeps the history readable.';
  }
  if (entry.type === 'Edit') {
    return 'A change to a field is corrected by changing it again, not by taking it back.';
  }
  if (entry.type === 'Archive') {
    return 'Archiving has its own path. This is for care entries.';
  }
  if (!VOIDABLE.has(entry.type)) {
    return `A ${entry.type} entry cannot be taken back here.`;
  }
  return null;
}

/** Every entry already taken back, so nothing is voided twice. */
export function voidedIds(events: readonly StoredEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.type === 'Void') out.add(e.voids);
  return out;
}

/** One line per entry on the Recently logged list. */
export interface RecentEntry {
  event: StoredEvent;
  plant_name: string;
  /** Null when it can be taken back; the reason it cannot, otherwise. */
  blocked: string | null;
  /** Already taken back, so it renders struck through with its Void beneath. */
  voided: boolean;
}

/**
 * The newest entries across every plant.
 *
 * Deliberately not filtered down to only the voidable ones: a list that quietly
 * omitted a rating would make the owner think it had not been saved. Everything
 * shows; what cannot be taken back says why when you ask.
 */
export function recentEntries(
  events: readonly StoredEvent[],
  nameOf: (plant_id: string) => string,
  limit: number,
): RecentEntry[] {
  const voided = voidedIds(events);
  return [...events]
    .filter((e) => e.plant_id !== null)
    .sort((a, b) => (a.date === b.date ? (a.time < b.time ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((event) => ({
      event,
      plant_name: nameOf(event.plant_id as string),
      blocked: voidBlocker(event, voided),
      voided: voided.has(event.event_id),
    }));
}

export async function voidEntry(
  db: DeezDB,
  entry: StoredEvent,
  reason: VoidReason | null,
  as_of: ISODate,
): Promise<EventId> {
  const all = await db.getAll('events');
  const blocked = voidBlocker(entry, voidedIds(all));
  // Checked again here and not only in the screen: this is the one write in the
  // app that changes what past numbers say, so the rule belongs where the write
  // happens.
  if (blocked) throw new Error(blocked);

  const device_id = await deviceId(db);
  const time = nowClockTime();
  const event: VoidEvent = {
    event_id: mintEventId(device_id, as_of, time),
    plant_id: entry.plant_id,
    type: 'Void',
    date: as_of,
    time,
    voids: entry.event_id,
    ...(reason ? { note: VOID_REASON_TEXT[reason] } : {}),
    source: 'user',
    device_id,
  };

  const [written] = await appendEvents(db, [event]);
  return written.event_id;
}
