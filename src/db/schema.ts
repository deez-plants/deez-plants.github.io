import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  DeviceId, ISODate, MediaId, PackageId, PlantId, SessionId,
} from '../types/ids';
import type { MediaLabel, PlantBaseline, Registry } from '../types/plant';
import type { StoredEvent } from '../types/event';
import type { Snapshot } from '../types/derived';

/**
 * The store layout, and opening it.
 *
 * There is deliberately no `derived` store. Derived state exists in memory and
 * in `snapshots` (which are history, never read back as truth). Anything not
 * stored cannot be patched, which is rule 10 enforced by the schema rather than
 * by discipline.
 */

export const DB_NAME = 'deez-plants';
export const DB_VERSION = 1;

/** Section 6b: the app stores filenames, dates and labels — and, on iOS, the bytes. */
export interface MediaRecord {
  media_id: MediaId;
  plant_id: PlantId;
  date: ISODate;
  labels: MediaLabel[];
  /** True for the four seed frames that show more than one plant. */
  shared_frame: boolean;
  /** Full image. See FLAG E — section 6b says the folder holds these, iOS cannot. */
  blob: Blob;
  /** Generated at capture and at seed import. What the lists actually render. */
  thumb: Blob;
}

/** Section 6, tiers table. */
export type TranscriptTier = 'verified' | 'unverified';

export interface CoverageReport {
  passed: boolean;
  /** Which of the four assertions failed, each with the offset to replay from. */
  failures: { assertion: 1 | 2 | 3 | 4; offset_s: number; detail: string }[];
}

export interface SessionRecord {
  session_id: SessionId;
  /** `YYYY-MM-DDTHH:MM:SS`, local, no zone — section 6's own sidecar shape,
      and the same local-civil convention `ISODate` uses. Never UTC: a walk
      recorded in the evening west of Greenwich would otherwise carry
      tomorrow's date while its own events carried today's. */
  started: string;
  duration_s: number;
  /** Markers are written by the app as it goes — page opens, care, photos. */
  markers: SessionMarker[];
  transcript: string | null;
  transcript_tier: TranscriptTier | null;
  coverage: CoverageReport | null;
  /**
   * What `MediaRecorder` actually produced. Section 6 asks for `audio/mp4`,
   * which Safari gives and Chrome does not — the export names the file from
   * this rather than assuming, so a walk recorded on a laptop is still handed
   * to Whisper under a name matching its contents.
   */
  mime?: string;
  /**
   * False while the walk is still being recorded, true once it ended cleanly.
   * The record is written at the start of a walk and updated as it runs (see
   * `capture/recording.ts`), so a session left `closed: false` with no live
   * recorder is one iOS ended from under us — the audio up to the last chunk
   * is still there and still playable.
   */
  closed?: boolean;
  /**
   * True when iOS ended the capture and the walk is waiting to be resumed.
   *
   * The owner's own design (2026-09-11): a walk that gets interrupted should
   * **stop completely** — no timer running, nothing alive in the background —
   * but be remembered, so coming back costs one tap rather than starting
   * again. This flag is what makes that survive a force-quit, because it is
   * written to disk alongside the chunks rather than held in memory.
   *
   * An interrupted session's audio stays as numbered chunks and is never
   * assembled into one blob, so a later segment can keep appending. Assembly
   * happens only when the walk is finally ended.
   */
  interrupted?: boolean;
  /** How many chunks have been written, so a resumed segment carries on
      numbering instead of overwriting the first segment's audio. */
  chunk_count?: number;
}

export interface SessionMarker {
  offset_s: number;
  type: 'session_start' | 'plant_open' | 'care_logged' | 'photo' | 'gap' | 'session_end';
  plant_id?: PlantId;
  event_id?: string;
  media?: MediaId;
  /** On a `gap` marker: how long the walk was interrupted for, in seconds.
      The transcript has real silence here, and the coverage gate needs to know
      the time is genuinely missing rather than unaccounted for. */
  gap_s?: number;
  /** Screen 03 lets you retag a `plant_open` the app placed. An automatic
      marker reads AUTO; one you corrected reads MANUAL, and the difference
      is kept because the AI reading the sidecar should know which is which. */
  manual?: boolean;
}

/**
 * Section 6. Runs always, not only while recording. Pass-through visits under
 * 5 seconds are dropped before they are written, so the store holds looking,
 * not navigation. Retention: 7 days or 500 entries, whichever comes first.
 */
export interface ScreenLogEntry {
  /** Absolute timestamp, always present. Sorted and swept on this.
      `YYYY-MM-DDTHH:MM:SS`, local and zoneless like `SessionRecord.started` —
      fixed width, so lexicographic order is chronological order. */
  at: string;
  screen: string;
  plant_id?: PlantId;
  /** Both of these only when the entry falls inside a recording. */
  session_id?: SessionId;
  offset_s?: number;
  dwell_s: number;
}

/** Validation rules 1 and 2 both read this store. */
export interface PackageRecord {
  package_id: PackageId;
  generated: ISODate;
  /** Exactly what went out, so a returned file can be checked against it. */
  event_ids: string[];
  plant_ids: PlantId[];
  transcript_tier: TranscriptTier | null;
  verified: boolean;
  /** The walks this package carried, so the next one does not repeat them —
      the same rule `event_ids` applies to events. Absent on packages built
      before recording existed. */
  session_ids?: SessionId[];
}

/** Rule 2: no previously applied update cites the same package_id. */
export interface AppliedUpdateRecord {
  package_id: PackageId;
  applied: ISODate;
  accepted_count: number;
  rejected_count: number;
}

export interface AppMeta {
  schema_version: number;
  /** Generated once per install. Section 8 shows this beside a conflicting rating. */
  device_id: DeviceId;
  device_label: string;
  seed_completed: ISODate | null;
  /** Date -> highest N used, for PKG-YYYY-MM-DD-N and SES-YYYY-MM-DD-N. */
  package_counter: Record<string, number>;
  session_counter: Record<string, number>;
  last_state_export: ISODate | null;
  last_state_import: ISODate | null;
}

export interface DeezPlantsDB extends DBSchema {
  /**
   * The registry (validation rule 3). Write-once per plant: a baseline is the
   * plant as it entered the world and is never updated. Every later change is
   * an event, which is what lets two devices merge by union with no conflict.
   */
  plants: {
    key: string;
    value: PlantBaseline;
  };

  /**
   * The only thing that changes. Append-only.
   *
   * `plant_id` is null on collection-scoped Edit events; null is not a valid
   * IndexedDB key, so those records are simply absent from `by-plant` rather
   * than erroring — which is the behaviour we want. See FLAG C.
   */
  events: {
    key: string;
    value: StoredEvent;
    indexes: {
      'by-plant': string;
      'by-date': string;
      'by-plant-date': [string, string];
      'by-type': string;
      /** 0/1 rather than boolean because IndexedDB will not index a boolean. */
      'by-pending': number;
      'by-session': string;
    };
  };

  media: {
    key: string;
    value: MediaRecord;
    indexes: { 'by-plant': string; 'by-date': string };
  };

  sessions: {
    key: string;
    value: SessionRecord;
  };

  /**
   * Kept out of `sessions` so listing walks does not drag 20 MB per row.
   *
   * Keyed by `session_id` for a finished walk. While one is being recorded the
   * chunks land under `session_id#0000`, `#0001`, … as they arrive, so a walk
   * that iOS ends from under us keeps everything up to the last chunk instead
   * of nothing. `capture/recording.ts`'s `readSessionAudio` reads either form.
   */
  audio: {
    key: string;
    value: Blob;
  };

  screen_log: {
    key: number;
    value: ScreenLogEntry;
    indexes: { 'by-at': string };
  };

  packages: {
    key: string;
    value: PackageRecord;
  };

  applied_updates: {
    key: string;
    value: AppliedUpdateRecord;
  };

  /** Capped at five, FIFO. Feeds the Since-last-time page. */
  snapshots: {
    key: number;
    value: Snapshot;
  };

  /** Single record under the key 'registry'. Rooms and planters. */
  registry: {
    key: string;
    value: Registry;
  };

  /** Single record under the key 'app'. */
  meta: {
    key: string;
    value: AppMeta;
  };
}

/* -------------------------------------------------------------------------- */
/* Opening                                                                     */
/* -------------------------------------------------------------------------- */

export type DeezDB = IDBPDatabase<DeezPlantsDB>;

/** Both single-record stores use out-of-line keys under a fixed name. */
export const REGISTRY_KEY = 'registry';
export const META_KEY = 'app';

/** Section 5: the app keeps the last five snapshots. */
export const SNAPSHOT_LIMIT = 5;
/** Section 6: 7 days or 500 entries, whichever comes first. */
export const SCREEN_LOG_RETENTION_DAYS = 7;
export const SCREEN_LOG_MAX_ENTRIES = 500;
/** Section 6: anything on screen under 5 seconds was navigation, not looking. */
export const SCREEN_LOG_MIN_DWELL_S = 5;

let handle: Promise<DeezDB> | null = null;

export function openDeezPlants(): Promise<DeezDB> {
  if (handle) return handle;

  handle = openDB<DeezPlantsDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) createV1(db);
    },
    blocking() {
      // Another tab wants to upgrade. Let go rather than deadlock it; the next
      // call reopens on the new version.
      void handle?.then((db) => db.close());
      handle = null;
    },
    terminated() {
      // iOS evicts IndexedDB connections under memory pressure without warning.
      // Dropping the cached promise means the next call reopens instead of
      // failing on a dead handle for the rest of the session.
      handle = null;
    },
  });

  return handle;
}

/** For tests and for the state-import path, which reopens after a wholesale write. */
export async function closeDeezPlants(): Promise<void> {
  if (!handle) return;
  const db = await handle;
  handle = null;
  db.close();
}

function createV1(db: DeezDB): void {
  // Write-once per plant. The registry validation rule 3 checks against.
  db.createObjectStore('plants', { keyPath: 'plant_id' });

  const events = db.createObjectStore('events', { keyPath: 'event_id' });
  events.createIndex('by-plant', 'plant_id');
  events.createIndex('by-date', 'date');
  events.createIndex('by-plant-date', ['plant_id', 'date']);
  events.createIndex('by-type', 'type');
  events.createIndex('by-pending', 'pending');
  events.createIndex('by-session', 'session_id');

  const media = db.createObjectStore('media', { keyPath: 'media_id' });
  media.createIndex('by-plant', 'plant_id');
  media.createIndex('by-date', 'date');

  db.createObjectStore('sessions', { keyPath: 'session_id' });

  // Out-of-line, keyed by session_id: a 20 MB blob has no business being loaded
  // every time the sessions list renders.
  db.createObjectStore('audio');

  // Out-of-line auto-increment. The entry itself carries no id — nothing refers
  // to a screen-log row, it is only ever swept or exported in bulk.
  const screenLog = db.createObjectStore('screen_log', { autoIncrement: true });
  screenLog.createIndex('by-at', 'at');

  db.createObjectStore('packages', { keyPath: 'package_id' });
  db.createObjectStore('applied_updates', { keyPath: 'package_id' });
  db.createObjectStore('snapshots', { autoIncrement: true });

  db.createObjectStore('registry');
  db.createObjectStore('meta');
}
