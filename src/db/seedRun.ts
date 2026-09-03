import rawSeedFile from '../../SEED_PLANTS.json';
import type { DeviceId, ISODate } from '../types/ids';
import type { AppMeta, DeezDB, MediaRecord } from './schema';
import { META_KEY, REGISTRY_KEY } from './schema';
import { makeThumbnail } from '../capture/photos';
import { buildSeedPlan, type SeedFile, type SeedPhotoJob } from './seed';

/**
 * Running the first-run seed: fetch the reference photos, thumbnail them, and
 * write the whole starting position in one transaction.
 *
 * Vite resolves the seed photos to hashed asset URLs at build time. Only the
 * URLs are in the bundle; the bytes are fetched once here and then live in
 * IndexedDB as Blobs like any other photo (section 6b).
 */
const PHOTO_URLS = import.meta.glob('../../seed-photos/*.jpeg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface SeedOutcome {
  ran: boolean;
  /** True when a previous run already completed and this call did nothing. */
  already_seeded: boolean;
  plants: number;
  events: number;
  photos: number;
  /** Source files that could not be read. The seed stays incomplete until none. */
  missing: string[];
}

function urlFor(source_file: string): string | undefined {
  const name = source_file.split('/').pop();
  if (!name) return undefined;
  for (const [key, url] of Object.entries(PHOTO_URLS)) {
    if (key.endsWith(`/${name}`)) return url;
  }
  return undefined;
}

function newDeviceId(): DeviceId {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `DEV-${id}` as DeviceId;
}

/**
 * Section 8: the laptop gets real folder access and the phone does not, so the
 * two devices do genuinely different work. Labelling by capability is how a
 * conflicting rating can later say which one set it.
 */
function deviceLabel(): string {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window ? 'Laptop' : 'Phone';
}

function emptyMeta(device_id: DeviceId): AppMeta {
  return {
    schema_version: 1,
    device_id,
    device_label: deviceLabel(),
    seed_completed: null,
    package_counter: {},
    session_counter: {},
    last_state_export: null,
    last_state_import: null,
  };
}

async function loadPhoto(job: SeedPhotoJob): Promise<MediaRecord | null> {
  const url = urlFor(job.source_file);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return {
      media_id: job.media_id,
      plant_id: job.plant_id,
      date: job.date,
      labels: job.labels,
      shared_frame: job.shared_frame,
      blob,
      thumb: await makeThumbnail(blob),
    };
  } catch {
    return null;
  }
}

/**
 * Idempotent in three separate ways, because this runs on every app open:
 *
 * 1. A completed seed short-circuits on the `seed_completed` stamp.
 * 2. Every key the plan produces is derived from the seed file, so a second
 *    write lands on the same records and overwrites rather than appends.
 * 3. The registry is only written when absent, so re-running can never discard
 *    a room or planter you added later.
 *
 * The stamp is set only when every photo landed. A partial run leaves it unset
 * and the next open retries just the gaps — everything already stored is
 * rewritten identically, which costs nothing and heals the hole.
 */
export async function runFirstRunSeed(
  db: DeezDB,
  install_date: ISODate,
): Promise<SeedOutcome> {
  const existingMeta = await db.get('meta', META_KEY);

  if (existingMeta?.seed_completed) {
    return { ran: false, already_seeded: true, plants: 0, events: 0, photos: 0, missing: [] };
  }

  const meta = existingMeta ?? emptyMeta(newDeviceId());
  const plan = buildSeedPlan(rawSeedFile as SeedFile, {
    install_date,
    device_id: meta.device_id,
  });

  // Every fetch and every thumbnail happens before the transaction opens. An
  // IndexedDB transaction closes as soon as control returns to the event loop
  // with no request outstanding, so a single `await fetch` inside one would
  // kill it halfway through the seed.
  const media: MediaRecord[] = [];
  const missing: string[] = [];
  for (const job of plan.photos) {
    const record = await loadPhoto(job);
    if (record) media.push(record);
    else missing.push(job.source_file);
  }

  // Typed as strings so the hero event's `to` can be checked against it too.
  const landed = new Set<string>(media.map((m) => m.media_id));
  // An event must never name media that is not there — neither a Photo event
  // nor the hero choice that points at one. Whatever failed gets its event on
  // the retry, alongside its bytes.
  const events = plan.events.filter((e) => {
    if (e.media) return e.media.every((id) => landed.has(id));
    if (e.type === 'Edit' && e.field === 'hero_media' && e.to) return landed.has(e.to);
    return true;
  });

  const tx = db.transaction(['plants', 'events', 'media', 'registry', 'meta'], 'readwrite');
  const plants = tx.objectStore('plants');
  const eventStore = tx.objectStore('events');
  const mediaStore = tx.objectStore('media');

  const writes: Promise<unknown>[] = [];
  for (const b of plan.baselines) writes.push(plants.put(b));
  for (const e of events) writes.push(eventStore.put(e));
  for (const m of media) writes.push(mediaStore.put(m));

  // Rooms and planters are a user-editable registry. Seed it, never re-seed it.
  const registryStore = tx.objectStore('registry');
  if (!(await registryStore.get(REGISTRY_KEY))) {
    writes.push(registryStore.put(plan.registry, REGISTRY_KEY));
  }

  writes.push(tx.objectStore('meta').put(
    { ...meta, seed_completed: missing.length ? null : install_date },
    META_KEY,
  ));

  await Promise.all(writes);
  await tx.done;

  return {
    ran: true,
    already_seeded: false,
    plants: plan.baselines.length,
    events: events.length,
    photos: media.length,
    missing,
  };
}
