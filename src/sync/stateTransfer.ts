import JSZip from 'jszip';
import { openDeezPlants, REGISTRY_KEY, META_KEY, type DeezDB, type MediaRecord, type SessionRecord } from '../db/schema';
import { readSessionSegments, extensionFor } from '../capture/recording';
import { stamp } from '../package/export';
import type { PlantBaseline, Registry } from '../types/plant';
import type { StoredEvent } from '../types/event';
import type { ISODate } from '../types/ids';

/**
 * Backup and restore — FIELD_DEFINITIONS.md section 8, the phone half.
 *
 * Browser storage is per-origin and per-device. `localhost`, a LAN address and
 * a hosted URL are three separate stores with no server between them, so
 * nothing moves on its own — "something has to carry it. That something is a
 * folder you already sync." On iOS that folder cannot be reached by the app
 * (no File System Access API), so the file moves by hand, and this is what
 * produces it.
 *
 * **Two exports, deliberately.** The record — plants, events, registry — is
 * tens of kilobytes and irreplaceable: you can retake a photograph, you cannot
 * reconstruct that you watered something on a Tuesday in March. Photos and
 * audio are megabytes and replaceable. Splitting them means the export that
 * protects you is fast enough that you will actually run it, which is the only
 * property a backup really needs.
 *
 * **Restore merges, it does not replace.** Events are append-only and keyed by
 * an id unique across devices (section 8's merge key), so importing the same
 * file twice adds nothing the second time and importing two devices' files
 * gives the union of both. That is not luck — it is the whole reason the model
 * is append-only, finally being used for what it was for.
 */

/** Bumped only if the shape changes in a way an older app could not read. */
export const STATE_FORMAT = 1;

export interface StateFile {
  format: number;
  exported: ISODate;
  /** Which device wrote it — section 8 shows this beside a conflicting rating. */
  device_id: string;
  device_label: string;
  plants: PlantBaseline[];
  events: StoredEvent[];
  registry: Registry | null;
  /** Counters, so ids minted after a restore do not collide with ids in it. */
  counters: { package: Record<string, number>; session: Record<string, number> };
  /** Present only in the full export. Media bytes travel as separate zip
      entries; this is the bookkeeping that goes with them. */
  media?: Omit<MediaRecord, 'blob' | 'thumb'>[];
  sessions?: SessionRecord[];
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

async function readState(db: DeezDB, as_of: ISODate): Promise<StateFile> {
  const [plants, events, registry, meta] = await Promise.all([
    db.getAll('plants'),
    db.getAll('events'),
    db.get('registry', REGISTRY_KEY),
    db.get('meta', META_KEY),
  ]);
  return {
    format: STATE_FORMAT,
    exported: as_of,
    device_id: meta?.device_id ?? 'unknown',
    device_label: meta?.device_label ?? '',
    plants,
    events,
    registry: registry ?? null,
    counters: {
      package: meta?.package_counter ?? {},
      session: meta?.session_counter ?? {},
    },
  };
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  plant_count: number;
  event_count: number;
  bytes: number;
}

/** The record alone. Small, instant, and the thing worth doing often. */
export async function exportRecord(db: DeezDB, as_of: ISODate): Promise<ExportResult> {
  const state = await readState(db, as_of);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  return {
    blob,
    filename: `${stamp()} backup — record.json`,
    plant_count: state.plants.length,
    event_count: state.events.length,
    bytes: blob.size,
  };
}

/** Everything: the record, every photo, and every walk's audio and sidecar. */
export async function exportEverything(db: DeezDB, as_of: ISODate): Promise<ExportResult> {
  const state = await readState(db, as_of);
  const media = await db.getAll('media');
  const sessions = await db.getAll('sessions');

  state.media = media.map(({ blob: _b, thumb: _t, ...rest }) => rest);
  state.sessions = sessions;

  const zip = new JSZip();
  zip.file('state.json', JSON.stringify(state, null, 2));

  // Section 8's folder shape: media/ and sessions/ beside the state file.
  for (const m of media) {
    zip.file(`media/${m.media_id}`, m.blob);
    zip.file(`media/thumbs/${m.media_id}`, m.thumb);
  }
  for (const s of sessions) {
    // A walk interrupted twice is three recordings. Every one travels, named
    // in order, because gluing them is what made a file no player would read
    // past the first seam.
    const segments = await readSessionSegments(db, s.session_id);
    segments.forEach((audio, i) => {
      const ext = extensionFor(s.mime ?? audio.type);
      const name = segments.length === 1
        ? `${s.session_id}${ext}`
        : `${s.session_id}-part${i + 1}${ext}`;
      zip.file(`sessions/${name}`, audio);
    });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: `${stamp()} backup — everything.zip`,
    plant_count: state.plants.length,
    event_count: state.events.length,
    bytes: blob.size,
  };
}

/* -------------------------------------------------------------------------- */
/* Restore                                                                     */
/* -------------------------------------------------------------------------- */

export interface RestoreResult {
  plants_added: number;
  plants_already_here: number;
  events_added: number;
  events_already_here: number;
  media_added: number;
  sessions_added: number;
  registry_taken: boolean;
  /** From the file, so the screen can say where this came from. */
  from_device: string;
  exported: string;
}

function isStateFile(v: unknown): v is StateFile {
  if (!v || typeof v !== 'object') return false;
  const f = v as Partial<StateFile>;
  return typeof f.format === 'number' && Array.isArray(f.plants) && Array.isArray(f.events);
}

export function parseStateFile(text: string): StateFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not readable JSON.');
  }
  if (!isStateFile(parsed)) {
    throw new Error('That is not a Deez Plants record file.');
  }
  if (parsed.format > STATE_FORMAT) {
    throw new Error(
      `That file was written by a newer version of the app (format ${parsed.format}). Update this device first.`,
    );
  }
  return parsed;
}

/**
 * Merge a state file into this device. Never destructive: a plant or event
 * already here is left exactly as it is, and nothing in the store is deleted.
 *
 * Baselines are write-once, so an incoming plant that already exists is
 * skipped rather than overwritten — if the two disagree, the log is what
 * reconciles them, not a silent replacement. Events collide on `event_id`,
 * which is unique across devices for precisely this reason.
 */
export async function restoreState(db: DeezDB, state: StateFile): Promise<RestoreResult> {
  const result: RestoreResult = {
    plants_added: 0,
    plants_already_here: 0,
    events_added: 0,
    events_already_here: 0,
    media_added: 0,
    sessions_added: 0,
    registry_taken: false,
    from_device: state.device_label || state.device_id,
    exported: state.exported,
  };

  const existingPlants = new Set((await db.getAllKeys('plants')).map(String));
  for (const p of state.plants) {
    if (existingPlants.has(p.plant_id)) { result.plants_already_here += 1; continue; }
    await db.add('plants', p);
    result.plants_added += 1;
  }

  const existingEvents = new Set((await db.getAllKeys('events')).map(String));
  for (const e of state.events) {
    if (existingEvents.has(e.event_id)) { result.events_already_here += 1; continue; }
    await db.add('events', e);
    result.events_added += 1;
  }

  // The registry is a plain user-editable record, not a folded log, so there
  // is nothing to merge — take the incoming one only if this device has none.
  const registry = await db.get('registry', REGISTRY_KEY);
  if (!registry && state.registry) {
    await db.put('registry', state.registry, REGISTRY_KEY);
    result.registry_taken = true;
  }

  // Counters move forward, never back: a restored file must not let this
  // device mint a package id that the file already used.
  const meta = await db.get('meta', META_KEY);
  if (meta) {
    const merge = (mine: Record<string, number>, theirs: Record<string, number>) => {
      const out = { ...mine };
      for (const [k, v] of Object.entries(theirs)) out[k] = Math.max(out[k] ?? 0, v);
      return out;
    };
    await db.put('meta', {
      ...meta,
      package_counter: merge(meta.package_counter, state.counters?.package ?? {}),
      session_counter: merge(meta.session_counter, state.counters?.session ?? {}),
      last_state_import: state.exported,
    }, META_KEY);
  }

  return result;
}

/**
 * The full zip: the record plus the bytes. Photos and audio are added only
 * where this device does not already hold them.
 */
export async function restoreEverything(db: DeezDB, file: Blob): Promise<RestoreResult> {
  const zip = await JSZip.loadAsync(file);
  const stateEntry = zip.file('state.json');
  if (!stateEntry) throw new Error('That zip has no state.json in it.');

  const state = parseStateFile(await stateEntry.async('string'));
  const result = await restoreState(db, state);

  const existingMedia = new Set((await db.getAllKeys('media')).map(String));
  for (const record of state.media ?? []) {
    if (existingMedia.has(record.media_id)) continue;
    const full = zip.file(`media/${record.media_id}`);
    const thumb = zip.file(`media/thumbs/${record.media_id}`);
    if (!full || !thumb) continue;
    await db.put('media', {
      ...record,
      blob: await full.async('blob'),
      thumb: await thumb.async('blob'),
    });
    result.media_added += 1;
  }

  const existingSessions = new Set((await db.getAllKeys('sessions')).map(String));
  for (const session of state.sessions ?? []) {
    if (existingSessions.has(session.session_id)) continue;
    await db.put('sessions', session);
    const audio = zip.file(new RegExp(`^sessions/${session.session_id}\\.`));
    if (audio.length) await db.put('audio', await audio[0].async('blob'), session.session_id);
    result.sessions_added += 1;
  }

  return result;
}

/** Triggers the browser's own save flow. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function openAndExportRecord(as_of: ISODate): Promise<ExportResult> {
  return exportRecord(await openDeezPlants(), as_of);
}
