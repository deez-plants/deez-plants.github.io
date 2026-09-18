import type { DeezDB } from './schema';
import { META_KEY, REGISTRY_KEY, SNAPSHOT_LIMIT } from './schema';
import type { ClockTime, DeviceId, EventId, ISODate } from '../types/ids';
import type { PlantEvent, StoredEvent } from '../types/event';
import type { DerivedState, Snapshot } from '../types/derived';
import type { Registry } from '../types/plant';
import { derive } from './derive';
import { markCareLogged, markPhoto, sessionStamp } from '../capture/liveSession';
import { nowLocalStamp } from '../lib/dates';

/**
 * Appending events, and the Update commit.
 *
 * This is the only module that writes to the log, and it only ever adds to it.
 * Rule 5: nothing is edited in place — a correction is a new event. The single
 * exception is the two local-only bookkeeping columns, `pending` and
 * `folded_at`, which are not part of the record and are stripped on export.
 * Flipping `pending` is not editing an event; it is this device noting that it
 * has folded one in.
 */

const EMPTY_REGISTRY: Registry = { rooms: [], planters: [], updated: '1970-01-01' as ISODate };

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Unique across devices (section 8's merge key) and lexicographically stable,
 * because `event_id` is the fold's final tiebreak: two devices holding the same
 * event must sort it to the same place. The date and time lead so that a raw
 * sort of the ids is already roughly chronological, which makes a merged log
 * readable; the device and a random tail make collisions impossible in practice.
 */
export function mintEventId(device_id: DeviceId, date: ISODate, time: ClockTime): EventId {
  const device = device_id.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
  return `EV-${date}-${time.replace(':', '')}-${device}-${randomSuffix()}` as EventId;
}

/** `HH:MM`, local, 24h. The only other place besides `todayISO` that reads the clock. */
export function nowClockTime(): ClockTime {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` as ClockTime;
}

export async function deviceId(db: DeezDB): Promise<DeviceId> {
  const meta = await db.get('meta', META_KEY);
  if (!meta) throw new Error('No device identity yet — the seed has not run.');
  return meta.device_id;
}

/* -------------------------------------------------------------------------- */
/* Append                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Add events to the log. **They count immediately** (2026-09-18).
 *
 * Entries used to arrive `pending: 1` and move no number until a separate
 * Update was tapped. That step is gone — see `foldPending` for why, and for
 * what replaced the one thing it was genuinely doing. The fold happens HERE,
 * in the one place every write already goes through, rather than at six call
 * sites where the seventh would eventually be forgotten.
 *
 * They are still written pending and folded a moment later rather than stored
 * committed outright, so the two steps stay separable: an entry that is
 * written but not yet folded is a state the log can hold and recover from,
 * and collapsing them would remove the only seam a future two-device merge
 * could use.
 *
 * Refuses to overwrite an existing `event_id`: append-only means append-only,
 * and a silent overwrite here would lose a watering.
 */
export async function appendEvents(db: DeezDB, events: PlantEvent[]): Promise<StoredEvent[]> {
  // Section 6: anything logged during a walk belongs to that walk. The stamp is
  // null outside a recording, which is the ordinary case, and an event that
  // already carries a session (an imported one) is left as it is.
  const stamp = sessionStamp();
  const stored: StoredEvent[] = events.map((e) => ({
    ...e,
    ...(stamp && e.session_id === undefined
      ? { session_id: stamp.session_id, offset_s: stamp.offset_s }
      : {}),
    pending: 1,
  }));

  const tx = db.transaction('events', 'readwrite');
  for (const e of stored) {
    if (await tx.store.get(e.event_id)) {
      throw new Error(`Event ${e.event_id} already exists — the log is append-only.`);
    }
    await tx.store.add(e);
  }
  await tx.done;

  // Only after the write: a marker pointing at an event that failed to store
  // would be worse than no marker. Section 6 records `care_logged` and `photo`
  // automatically; `Rate`, `Edit` and `Archive` have no marker type and get none.
  if (stamp) {
    for (const e of stored) {
      // A Void has no marker of its own: the marker it takes back is already
      // in the walk's track, and adding a second one would make an undo read
      // as two things happening rather than one being unwritten.
      if (e.type === 'Rate' || e.type === 'Edit' || e.type === 'Archive' || e.type === 'Void') continue;
      if (e.type === 'Photo' && e.media?.length) {
        for (const media of e.media) markPhoto(e.plant_id, media);
      } else {
        markCareLogged(e.plant_id, e.event_id);
      }
    }
  }

  // Count it. Everything above this line is the write; this is what makes the
  // numbers agree with it. `folded_at` is the entry's own date rather than a
  // separate "today", because an entry backdated by hand should read as folded
  // in when it happened, not when it was typed.
  await foldPending(db, stored[0]?.date ?? nowLocalStamp().slice(0, 10) as ISODate);

  return stored;
}

/* -------------------------------------------------------------------------- */
/* The Update commit                                                           */
/* -------------------------------------------------------------------------- */

export interface CommitResult {
  /** Events folded in by this commit. Empty when there was nothing waiting. */
  folded_event_ids: EventId[];
  /** How many distinct plants those events touched. */
  plants_touched: number;
  /** The state after the fold. Recomputed from the log, never patched (rule 10). */
  state: DerivedState;
  /** The state this one replaced, as saved to `snapshots`. Null on a no-op commit. */
  replaced: DerivedState | null;
}

async function readLog(db: DeezDB) {
  const [baselines, events, registry] = await Promise.all([
    db.getAll('plants'),
    db.getAll('events'),
    db.get('registry', REGISTRY_KEY),
  ]);
  return { baselines, events, registry: registry ?? EMPTY_REGISTRY };
}

/**
 * Fold every waiting entry in, and take no snapshot.
 *
 * **This is what every write calls now, 2026-09-18.** Logging care, editing a
 * field and applying an approved AI row all fold immediately, so the numbers
 * on Home, on a plant's page and in a review package are true the moment
 * something is written.
 *
 * **Why the two-step went.** Entries were marked pending until a separate
 * Update was tapped. The owner did not tap it, and the reason he did not is
 * that it was never worth tapping: pending delayed the NUMBERS, never the
 * RECORD. The entry was already written, append-only, with nothing able to
 * remove it — so the step offered a safety that did not exist while charging
 * stale figures on every screen for it. By 17 Sep his manifest was reporting
 * plants as past their interval that he had watered three days earlier, and
 * his own Home screen had been saying the same thing to him.
 *
 * The app's own specification named this fallback in advance, in its closed
 * decisions: "an immediate write plus an undo toast, not a redesign". The undo
 * is `VoidEvent`, and it is the safety the two-step only appeared to be.
 *
 * What the two-step genuinely did, and what had to be kept: it SNAPSHOTTED.
 * That is now `takeSnapshot`, taken at boundaries that mean something rather
 * than at every tap — see `commitUpdate`.
 */
export async function foldPending(db: DeezDB, as_of: ISODate): Promise<EventId[]> {
  const log = await readLog(db);
  const pending = log.events.filter((e) => e.pending === 1);
  if (!pending.length) return [];

  const tx = db.transaction('events', 'readwrite');
  for (const e of pending) {
    await tx.store.put({ ...e, pending: 0, folded_at: as_of });
  }
  await tx.done;
  return pending.map((e) => e.event_id);
}

/**
 * Section 5: Update recomputes adherence, due dates, needs-attention, calendars
 * and history in one pass, and saves a snapshot of the state it replaced.
 *
 * Nothing is patched. The whole of derived state is rebuilt from the event log
 * both before and after — it is 22 plants, and the two-step is the difference
 * between two calls of the same pure function, not a separate code path.
 *
 * Ratings are never touched by this. A `Rate` event is already in the committed
 * view the moment it is written; all this does for one is clear its badge.
 *
 * **Since 2026-09-18 this is the SNAPSHOT path, not the commit path.** Writes
 * fold themselves (`foldPending`), so by the time this runs there is usually
 * nothing waiting — and it takes a snapshot anyway, because marking a point to
 * compare against is now the whole of its job. It is called when a review
 * package is built, which makes "since last time" mean "since the last AI
 * round", and by the owner marking a point by hand.
 */
export async function commitUpdate(db: DeezDB, as_of: ISODate): Promise<CommitResult> {
  const log = await readLog(db);

  // What the numbers said before the fold — this is what gets snapshotted.
  const replaced = derive({ ...log, as_of, include_pending: false });

  const pending = log.events.filter((e) => e.pending === 1);
  const folded_event_ids = pending.map((e) => e.event_id);
  const plants_touched = new Set(pending.map((e) => e.plant_id).filter((id) => id !== null)).size;

  const snapshot: Snapshot = { taken: as_of, state: replaced, folded_event_ids };

  const tx = db.transaction(['events', 'snapshots'], 'readwrite');
  const events = tx.objectStore('events');
  for (const e of pending) {
    // `put` rather than a partial write: idb has no field update, and the only
    // fields differing from what was read are the two local-only ones.
    await events.put({ ...e, pending: 0, folded_at: as_of });
  }

  const snapshots = tx.objectStore('snapshots');
  await snapshots.add(snapshot);
  // Section 5: the app keeps the last five. Oldest keys first — the store is
  // auto-increment, so key order is insertion order.
  const keys = await snapshots.getAllKeys();
  for (const key of keys.slice(0, Math.max(0, keys.length - SNAPSHOT_LIMIT))) {
    await snapshots.delete(key);
  }
  await tx.done;

  // Re-read rather than reusing the in-memory list: the fold must run over what
  // is actually stored, so a failed write shows up as a wrong number here
  // rather than as a state that quietly disagrees with the database.
  const after = await readLog(db);
  return {
    folded_event_ids,
    plants_touched,
    state: derive({ ...after, as_of, include_pending: false }),
    replaced,
  };
}
