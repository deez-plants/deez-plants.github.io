import type {
  ClockTime, DeviceId, EventId, ISODate, MediaId, PlantId,
} from '../types/ids';
import type { MediaLabel, PlantBaseline, Registry } from '../types/plant';
import type { StoredEvent } from '../types/event';

/**
 * First-run seed, section 6b: the reference photos are seed data entering
 * through the normal door, not bundled assets. Every one becomes a `Photo`
 * event and a Blob in IndexedDB, so it shows in the gallery, can be labelled,
 * can be chosen as the hero and travels in review packages — exactly like a
 * photo taken on a walk.
 *
 * This module is the pure half: it decides what the seed *is*. `seedRun.ts`
 * fetches the bytes and writes them. Keeping the two apart means the plan can
 * be checked without a browser, and it is the plan that has to be right.
 *
 * Two deliberate divergences from section 6b, both decided 2026-09-02:
 *
 * - Seed photos are dated to `_meta.photos_taken` in the seed file, which is
 *   the day the owner actually photographed all 22 plants. This replaced an
 *   install-date stamp on 2026-09-08. Dating them to `acquired` made
 *   `last_checked` read "Feb 2021" on a fresh install; dating them to the
 *   install day piled 26 photo marks onto whatever arbitrary day you first
 *   opened the app, which is what made a phantom "watering" appear on two
 *   devices at two different dates. The true date fixes both at once. The
 *   files' EXIF capture dates are stripped, so this had to come from the
 *   owner. Falls back to the install date if the field is absent.
 * - The seed sets each plant's hero. 6b says the hero is picked manually; a
 *   collection of 22 unheroed plants is not worth the purity.
 *
 * FIELD_DEFINITIONS.md still describes the old behaviour and needs updating.
 */

/* ----------------------------------------------------------- the input file */

export interface SeedPlant {
  plant_id: string;
  name: string;
  species: string;
  room: string;
  pot: string;
  planter: string | null;
  acquired: string | null;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
  notes_user?: string;
  seed_photo: string;
}

export interface SeedExtraPhoto {
  file: string;
  plant_id: string;
  media_labels: MediaLabel[];
  note?: string;
}

export interface SeedFile {
  planters: Record<string, { shared_water: boolean; members: string[]; note?: string }>;
  /** `_meta.photos_taken` — when the seed photos were actually taken. */
  _meta?: { photos_taken?: string };
  plants: SeedPlant[];
  extra_photos: SeedExtraPhoto[];
}

/* ------------------------------------------------------------- the seed plan */

export interface SeedPhotoJob {
  media_id: MediaId;
  event_id: EventId;
  plant_id: PlantId;
  /** The path as `SEED_PLANTS.json` writes it, e.g. `seed-photos/001-MON.jpeg`. */
  source_file: string;
  date: ISODate;
  labels: MediaLabel[];
  /** The frame shows more than one plant. It is seeded against one of them. */
  shared_frame: boolean;
}

export interface SeedPlan {
  baselines: PlantBaseline[];
  events: StoredEvent[];
  photos: SeedPhotoJob[];
  registry: Registry;
}

export interface SeedOptions {
  install_date: ISODate;
  device_id: DeviceId;
}

/**
 * The two frames that show several plants at once. They are seeded against one
 * plant each (whichever the file names) and flagged, so nothing later reads a
 * group shot as a portrait of the plant it happens to be filed under.
 */
const SHARED_FRAMES = new Set([
  'extra-017-018-both-coconuts.jpeg',
  'extra-starwars-planter.jpeg',
]);

/**
 * Seed photos carry no capture time. Mains sit at 00:00 and extras at 00:01 so
 * a plant's own portrait sorts ahead of a group shot it appears in, and the
 * hero choice lands at 00:02, after the photo it names exists.
 */
const MAIN_TIME = '00:00' as ClockTime;
const EXTRA_TIME = '00:01' as ClockTime;
const HERO_TIME = '00:02' as ClockTime;

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Builds the whole first run from the seed file. Pure: same input, same output,
 * every id derived from the data rather than generated.
 *
 * That determinism is what makes the seed idempotent. Re-running it produces
 * byte-identical records under byte-identical keys, so a second write overwrites
 * rather than duplicates — and if two devices ever seed independently from the
 * same file, the union by `event_id` in section 8 collapses their seed events
 * into one set instead of giving every plant two photos.
 */
export function buildSeedPlan(file: SeedFile, opts: SeedOptions): SeedPlan {
  const { install_date, device_id } = opts;
  const photo_date = (file._meta?.photos_taken ?? install_date) as ISODate;

  const baselines: PlantBaseline[] = file.plants.map((p) => ({
    plant_id: p.plant_id as PlantId,
    name: p.name,
    species: p.species,
    acquired: p.acquired,
    room: p.room,
    pot: p.pot,
    planter: p.planter,
    water_interval_days: p.water_interval_days,
    water_interval_days_winter: p.water_interval_days_winter,
    feed: p.feed,
    light: p.light,
    soil: p.soil,
    notes_user: p.notes_user ?? '',
    // Neither is a judgement the seed is entitled to make. `health` has no
    // field on a baseline at all: a plant is unrated until somebody rates it.
    status_label: null,
    do_next: null,
    created: install_date,
    created_by: device_id,
    origin: 'seed',
  }));

  // Per-plant counter for the `_NN` in the media filename. Mains are numbered
  // first so a plant's own portrait is always 01.
  const seq = new Map<string, number>();
  const nextIndex = (plant_id: string): string => {
    const n = (seq.get(plant_id) ?? 0) + 1;
    seq.set(plant_id, n);
    return String(n).padStart(2, '0');
  };

  const job = (
    plant_id: string,
    source_file: string,
    labels: MediaLabel[],
  ): SeedPhotoJob => {
    // The day the photographs were taken, per the seed file. Not the install
    // date and not `acquired` — see the divergence note at the top.
    const date = photo_date;
    const nn = nextIndex(plant_id);
    return {
      // Section 6b: once imported they follow the app convention,
      // NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg.
      media_id: `${plant_id}_${date}_0000_${nn}.jpg` as MediaId,
      event_id: `EV-SEED-${plant_id}-${nn}` as EventId,
      plant_id: plant_id as PlantId,
      source_file,
      date,
      labels,
      shared_frame: SHARED_FRAMES.has(basename(source_file)),
    };
  };

  const photos: SeedPhotoJob[] = [
    ...file.plants.map((p) => job(p.plant_id, p.seed_photo, ['whole'])),
    ...file.extra_photos.map((x) => job(x.plant_id, x.file, x.media_labels)),
  ];

  const photoEvents: StoredEvent[] = photos.map((ph): StoredEvent => ({
    event_id: ph.event_id,
    plant_id: ph.plant_id,
    type: 'Photo',
    date: ph.date,
    time: ph.media_id.endsWith('_01.jpg') ? MAIN_TIME : EXTRA_TIME,
    source: 'seed',
    device_id,
    media: [ph.media_id],
    media_labels: ph.labels,
    // Nothing to fold in: the seed is the starting position, not a change to it.
    pending: 0,
  }));

  /**
   * Each plant's own portrait becomes its hero, so the collection is legible on
   * day one instead of showing 22 blank tiles until someone picks 22 photos.
   *
   * Written as a normal `Edit` event rather than a field on the baseline: the
   * hero stays derived from the log like everything else, it is overridable by
   * the same gesture that would change it later, and its provenance reads
   * `seed` rather than pretending you chose it.
   */
  const heroEvents: StoredEvent[] = photos
    .filter((ph) => ph.media_id.endsWith('_01.jpg'))
    .map((ph): StoredEvent => ({
      event_id: `EV-SEED-${ph.plant_id}-HERO` as EventId,
      plant_id: ph.plant_id,
      type: 'Edit',
      field: 'hero_media',
      from: null,
      to: ph.media_id,
      // Same day as the photographs themselves: choosing a hero is part of
      // the same import, and dating it to the install day would leave
      // `last_checked` reading the day the app was opened rather than the
      // day the plants were actually looked at.
      date: photo_date,
      time: HERO_TIME,
      source: 'seed',
      device_id,
      pending: 0,
    }));

  const events: StoredEvent[] = [...photoEvents, ...heroEvents];

  const rooms: string[] = [];
  for (const p of file.plants) if (!rooms.includes(p.room)) rooms.push(p.room);

  const registry: Registry = {
    rooms,
    planters: Object.entries(file.planters).map(([name, v]) => ({
      name,
      shared_water: v.shared_water,
      ...(v.note ? { note: v.note } : {}),
    })),
    updated: install_date,
  };

  return { baselines, events, photos, registry };
}
