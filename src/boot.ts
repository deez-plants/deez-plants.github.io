import { closeDeezPlants, openDeezPlants, DB_NAME, REGISTRY_KEY, type DeezDB } from './db/schema';
import { runFirstRunSeed, type SeedOutcome } from './db/seedRun';
import { derive } from './db/derive';
import { todayISO } from './lib/dates';
import type { DerivedState, Snapshot } from './types/derived';
import type { StoredEvent } from './types/event';
import type { Registry } from './types/plant';
import type { ISODate } from './types/ids';

/**
 * App boot: open the database, seed it if this is the first run, then rebuild
 * derived state from the log.
 *
 * The seed is safe to call on every open — it short-circuits on its own stamp —
 * so boot does not need to decide whether this is a first run. That is the
 * point of it being idempotent.
 */

export interface Booted {
  outcome: SeedOutcome;
  state: DerivedState;
  /**
   * The raw log, as read. Screens that need a fact derived state does not carry
   * — the last Feed on a plant, say — read it from here rather than growing
   * `DerivedState` a field per screen.
   */
  events: StoredEvent[];
  registry: Registry;
  /** Oldest first. Section 5: the app keeps the last five, saved by each
      Update commit — the Adherence-history screen's frozen record. */
  snapshots: Snapshot[];
  /** media_id -> object URL for that photo's thumbnail. */
  thumbs: Map<string, string>;
  as_of: ISODate;
}

interface Read {
  state: DerivedState;
  events: StoredEvent[];
  registry: Registry;
  snapshots: Snapshot[];
}

const EMPTY_REGISTRY: Registry = { rooms: [], planters: [], updated: '1970-01-01' as ISODate };

/**
 * Object URLs for the 26 seed thumbnails, kept for the life of the page. They
 * are revoked only on wipe: re-deriving is cheap and frequent, and minting a
 * fresh URL per render would leak far faster than holding these does.
 */
const thumbUrls = new Map<string, string>();

async function readAndDerive(db: DeezDB, as_of: ISODate): Promise<Read> {
  const [baselines, events, stored, snapshots] = await Promise.all([
    db.getAll('plants'),
    db.getAll('events'),
    db.get('registry', REGISTRY_KEY),
    db.getAll('snapshots'),
  ]);
  const registry = stored ?? EMPTY_REGISTRY;
  snapshots.sort((a, b) => (a.taken < b.taken ? -1 : a.taken > b.taken ? 1 : 0));

  return {
    events,
    registry,
    snapshots,
    state: derive({
      baselines,
      events,
      registry,
      as_of,
      // The committed view: what the numbers say between Updates.
      include_pending: false,
    }),
  };
}

async function loadThumbs(db: DeezDB): Promise<Map<string, string>> {
  for (const record of await db.getAll('media')) {
    if (!thumbUrls.has(record.media_id)) {
      thumbUrls.set(record.media_id, URL.createObjectURL(record.thumb));
    }
  }
  return thumbUrls;
}

async function start(): Promise<Booted> {
  const as_of = todayISO();
  const db = await openDeezPlants();
  const outcome = await runFirstRunSeed(db, as_of);
  return { outcome, ...await readAndDerive(db, as_of), thumbs: await loadThumbs(db), as_of };
}

// React StrictMode runs effects twice in development. Sharing one promise keeps
// that from starting two boots — though if it did, the seed would survive it.
let inFlight: Promise<Booted> | null = null;

export function boot(): Promise<Booted> {
  inFlight ??= start();
  return inFlight;
}

/** Re-read the store and rebuild. Never patches — always a full recompute. */
export async function refresh(): Promise<Booted> {
  const as_of = todayISO();
  const db = await openDeezPlants();
  const current = await inFlight;
  return {
    outcome: current?.outcome ?? { ran: false, already_seeded: true, plants: 0, events: 0, photos: 0, missing: [] },
    ...await readAndDerive(db, as_of),
    thumbs: await loadThumbs(db),
    as_of,
  };
}

/**
 * Rooms and planters are a user-editable registry, not events (FIELD_DEFINITIONS.md
 * section 4: "the AI never proposes changes here — it cannot see your flat").
 * A room name is appended directly rather than folded from a log, the same way
 * the registry itself already works — there is nothing to merge or replay.
 */
export async function addRoom(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const db = await openDeezPlants();
  const stored = await db.get('registry', REGISTRY_KEY);
  const registry = stored ?? EMPTY_REGISTRY;
  if (registry.rooms.includes(trimmed)) return;
  await db.put('registry', { ...registry, rooms: [...registry.rooms, trimmed], updated: todayISO() }, REGISTRY_KEY);
}

/** Calls the seed again on a live database. Should report `already_seeded`. */
export async function reseed(): Promise<SeedOutcome> {
  const db = await openDeezPlants();
  return runFirstRunSeed(db, todayISO());
}

/** Drops the database so the next load is a genuine first run. */
export async function wipe(): Promise<void> {
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
  inFlight = null;
  await closeDeezPlants();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
