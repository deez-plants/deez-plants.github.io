import { closeDeezPlants, openDeezPlants, DB_NAME, REGISTRY_KEY, type DeezDB } from './db/schema';
import { runFirstRunSeed, type SeedOutcome } from './db/seedRun';
import { derive } from './db/derive';
import { deviceId } from './db/events';
import { restoreInterrupted } from './capture/recording';
import { todayISO } from './lib/dates';
import type { DerivedState, Snapshot } from './types/derived';
import type { StoredEvent } from './types/event';
import type { PlantBaseline, Registry } from './types/plant';
import type { ISODate, PlantId } from './types/ids';

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

/**
 * Thumbnails, loaded on demand rather than all of them at startup.
 *
 * This used to build an object URL for every photo in the database on every
 * launch. Fine at 26. At a few thousand — which a few years of this app is —
 * it is a slow, memory-hungry start for images almost none of which are on
 * screen. The owner asked for exactly this split: the heroes every time, since
 * that is 22 images and takes a moment, and the rest only when a gallery is
 * actually opened.
 *
 * `thumbUrls` is module-level and shared by reference, so filling it later
 * reaches every screen already holding it.
 */
async function loadThumbs(db: DeezDB, ids: readonly string[]): Promise<Map<string, string>> {
  const missing = ids.filter((id) => id && !thumbUrls.has(id));
  for (const id of missing) {
    const record = await db.get('media', id);
    if (record) thumbUrls.set(id, URL.createObjectURL(record.thumb));
  }
  return thumbUrls;
}

/**
 * Fill in thumbnails a screen needs but the boot did not load — a plant's
 * whole gallery, typically. Resolves to the same map every screen already
 * holds, so the caller re-renders rather than re-plumbing.
 */
export async function ensureThumbs(ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return thumbUrls;
  const db = await openDeezPlants();
  return loadThumbs(db, ids);
}

/** The hero of every plant — what the lists and Home actually draw. */
function heroIds(state: DerivedState): string[] {
  const out: string[] = [];
  for (const p of Object.values(state.plants)) {
    const hero = p.hero ?? p.photos[0];
    if (hero) out.push(hero);
  }
  return out;
}

/**
 * Ask the browser not to evict this database to reclaim space.
 *
 * Everything the owner has is in IndexedDB on one device, and without this a
 * browser is within its rights to throw it away under storage pressure. It is
 * a request, not a guarantee — Safari may refuse, and backups remain the real
 * safety net — but there is no reason not to ask, and an installed app is
 * treated far more generously than a tab.
 */
async function askToPersist(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* Not supported, or refused. Neither is worth failing a boot over. */
  }
}

async function start(): Promise<Booted> {
  const as_of = todayISO();
  const db = await openDeezPlants();
  const outcome = await runFirstRunSeed(db, as_of);
  // A walk iOS cut short, from this launch or any earlier one. The recorder
  // picks it back up into its `interrupted` phase so the Record screen can
  // offer it — this is the line that makes an interrupted walk survive the
  // app being force-quit, since everything it needs is already on disk.
  // Failing here must not stop the app opening: the walk is still recoverable
  // from Recordings either way.
  await restoreInterrupted().catch(() => false);
  void askToPersist();
  const derived = await readAndDerive(db, as_of);
  return { outcome, ...derived, thumbs: await loadThumbs(db, heroIds(derived.state)), as_of };
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
  const refreshed = await readAndDerive(db, as_of);
  return {
    outcome: current?.outcome ?? { ran: false, already_seeded: true, plants: 0, events: 0, photos: 0, missing: [] },
    ...refreshed,
    thumbs: await loadThumbs(db, heroIds(refreshed.state)),
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

export interface NewPlantInput {
  plant_id: PlantId;
  name: string;
  species: string;
  room: string;
  planter: string | null;
  water_interval_days: number;
}

/**
 * Screen 11: a new plant baseline, written once — `plant_id` is "assigned
 * once, permanent, never reused" (FIELD_DEFINITIONS.md section 2), so this
 * is `add`, not `put`: a collision would mean the ID-allocation logic on the
 * screen is broken, and silently overwriting an existing plant would be far
 * worse than a thrown error surfacing that. Everything the Add-a-plant
 * screen doesn't ask for (spot, pot, feed, light, soil, acquired and the six
 * reference fields) starts empty and is filled in later from Info and
 * settings, or proposed by the AI, same as any other field.
 */
export async function addPlant(input: NewPlantInput, as_of: ISODate): Promise<void> {
  const db = await openDeezPlants();
  const created_by = await deviceId(db);
  const baseline: PlantBaseline = {
    plant_id: input.plant_id,
    name: input.name,
    species: input.species,
    acquired: null,
    room: input.room,
    spot: '',
    pot: '',
    planter: input.planter,
    water_interval_days: input.water_interval_days,
    water_interval_days_winter: null,
    feed: null,
    light: null,
    soil: null,
    environment: null,
    repotting: null,
    pruning: null,
    pests: null,
    season: null,
    propagation: null,
    notes_user: '',
    status_label: null,
    do_next: null,
    created: as_of,
    created_by,
    origin: 'user',
  };
  await db.add('plants', baseline);
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
