import JSZip from 'jszip';
import type { DeezDB, PackageRecord } from '../db/schema';
import { mintDatedId } from '../db/counters';
import type { DerivedPlant, DerivedState } from '../types/derived';
import type { ISODate, PackageId } from '../types/ids';
import type { Manifest, ManifestPlant } from '../types/package';

/**
 * Prepare review package (screen 19). FIELD_DEFINITIONS.md section 7: the
 * practical export is the small "review set" — manifest, events, transcript,
 * markers — not the full ZIP with photos and audio, which stays on-device.
 *
 * Recording isn't built yet, so `transcript.txt` and `markers.json` are
 * real, honest placeholders (no sessions exist to report on) rather than
 * invented content — the same principle as the empty-months bars on
 * Adherence/Health history.
 */

function toManifestPlant(p: DerivedPlant): ManifestPlant {
  return {
    plant_id: p.plant_id,
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
    status_label: p.status_label,
    do_next: p.do_next,
    notes_user: p.notes_user,
    care_instructions: p.care_instructions,
    health: p.health.current,
    health_confirmed: p.health.confirmed,
    health_stale: p.health.stale,
    adherence_state: p.adherence.state,
    on_time_count: p.adherence.on_time_count,
    care_count: p.adherence.care_count,
    last_checked: p.last_checked,
  };
}

export interface ReviewPackage {
  package_id: PackageId;
  manifest: Manifest;
  event_count: number;
  plant_count: number;
  /** The finished zip, ready to save. */
  blob: Blob;
  filename: string;
}

/** Every event not already carried by a previous package — a union over
    every `PackageRecord.event_ids`, not a date cutoff, so a backdated entry
    (a walk logged after the fact) is never silently skipped. */
async function eventsSincePreviousPackages(db: DeezDB, allEventIds: string[]): Promise<Set<string>> {
  const already = new Set<string>();
  for (const record of await db.getAll('packages')) {
    for (const id of record.event_ids) already.add(id);
  }
  return new Set(allEventIds.filter((id) => !already.has(id)));
}

/** What "Build package" would produce, without minting a package_id or
    writing a `PackageRecord` — safe to call just to render a preview. */
export async function previewReviewPackage(db: DeezDB, state: DerivedState): Promise<{ plant_count: number; event_count: number }> {
  const active = state.order.filter((id) => !state.plants[id].archived);
  const allEvents = await db.getAll('events');
  const newIds = await eventsSincePreviousPackages(db, allEvents.map((e) => e.event_id));
  return { plant_count: active.length, event_count: newIds.size };
}

export async function buildReviewPackage(db: DeezDB, state: DerivedState, as_of: ISODate): Promise<ReviewPackage> {
  const active = state.order.map((id) => state.plants[id]).filter((p) => !p.archived);
  const package_id = await mintDatedId(db, 'PKG', as_of) as PackageId;

  const manifest: Manifest = {
    package_id,
    generated: as_of,
    plants: active.map(toManifestPlant),
  };

  const allEvents = await db.getAll('events');
  const newIds = await eventsSincePreviousPackages(db, allEvents.map((e) => e.event_id));
  const newEvents = allEvents
    .filter((e) => newIds.has(e.event_id))
    .map(({ pending: _pending, folded_at: _folded_at, ...rest }) => rest);

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('events.json', JSON.stringify(newEvents, null, 2));
  zip.file(
    'transcript.txt',
    'No recording sessions on this device yet.\n',
  );
  zip.file('markers.json', JSON.stringify({ sessions: [] }, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });

  const record: PackageRecord = {
    package_id,
    generated: as_of,
    event_ids: [...newIds],
    plant_ids: active.map((p) => p.plant_id),
    transcript_tier: null,
    verified: false,
  };
  await db.put('packages', record);

  return {
    package_id,
    manifest,
    event_count: newEvents.length,
    plant_count: active.length,
    blob,
    filename: `deez-plants-review-${as_of}.zip`,
  };
}

/** Triggers the browser's own save flow. The one place this app downloads a
    file rather than reading one — package prepare has no on-device home for
    the result, unlike everything else here. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
