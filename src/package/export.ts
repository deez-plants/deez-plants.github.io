import JSZip from 'jszip';
import type { DeezDB, PackageRecord, SessionRecord, TranscriptTier } from '../db/schema';
import { mintDatedId } from '../db/counters';
import { SCREEN_LOG_NOTE, sidecarFor } from '../capture/sessions';
import { readScreenLog } from '../capture/screenLog';
import { routeMarkerCount } from '../capture/liveSession';
import type { DerivedPlant, DerivedState } from '../types/derived';
import type { ISODate, PackageId } from '../types/ids';
import type { Manifest, ManifestPlant } from '../types/package';

/**
 * Prepare review package (screen 19). FIELD_DEFINITIONS.md section 7: the
 * practical export is the small "review set" — manifest, events, transcript,
 * markers — not the full ZIP with photos and audio, which stays on-device.
 * Section 7 again: "Audio never leaves the device. Chat interfaces will not
 * take it. The transcript is what the AI reads."
 *
 * `transcript.txt` and `markers.json` carry the walks recorded since the last
 * package. Where a walk has no transcript yet, the file says so for that walk
 * rather than dropping it — a recorded walk the AI is not being shown the
 * words of is a fact about the package, not an absence to hide. Where there
 * are no walks at all, both files say that too.
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

/* -------------------------------------------------------------------------- */
/* The two files recording feeds                                               */
/* -------------------------------------------------------------------------- */

/** Same rule the events use: a walk goes out once, and which walks went out is
    remembered per package rather than inferred from a date. */
async function sessionsSincePreviousPackages(db: DeezDB): Promise<SessionRecord[]> {
  const already = new Set<string>();
  for (const record of await db.getAll('packages')) {
    for (const id of record.session_ids ?? []) already.add(id);
  }
  const sessions = await db.getAll('sessions');
  return sessions
    .filter((s) => !already.has(s.session_id) && s.closed !== false)
    .sort((a, b) => (a.started < b.started ? -1 : a.started > b.started ? 1 : 0));
}

/**
 * Section 6's tiers, rolled up for the package. A package holding one
 * unverified walk is an unverified package — the weakest transcript in it is
 * what the AI is actually working from.
 */
function packageTier(sessions: readonly SessionRecord[]): TranscriptTier | null {
  const tiers = sessions.map((s) => s.transcript_tier).filter((t): t is TranscriptTier => t !== null);
  if (!tiers.length) return null;
  return tiers.includes('unverified') ? 'unverified' : 'verified';
}

async function transcriptFile(sessions: readonly SessionRecord[]): Promise<string> {
  if (!sessions.length) return 'No recording sessions on this device yet.\n';

  const parts = sessions.map((s) => {
    const head = `=== ${s.session_id} · ${s.started} · ${s.duration_s}s ===`;
    if (!s.transcript) {
      return `${head}\ntier: none\n\n`
        + 'This walk was recorded but has not been transcribed yet. The audio is\n'
        + 'held on the device; nothing was said here that this file can show you.\n';
    }
    const coverage = s.coverage
      ? (s.coverage.passed
        ? 'coverage: passed (all four assertions)'
        : `coverage: FAILED · ${s.coverage.failures.map((f) => `${f.offset_s}s ${f.detail}`).join('; ')}`)
      : 'coverage: not checked — this transcript carries no timestamps';
    return `${head}\ntier: ${s.transcript_tier}\n${coverage}\n\n${s.transcript}\n`;
  });

  return parts.join('\n');
}

/** Section 7: "markers.json — one marker track per session." The screen log
    rides along here rather than in a fifth file the spec does not name, with
    the "evidence, not fact" wording section 6 requires attached to it. */
async function markersFile(sessions: readonly SessionRecord[]) {
  const screen_log = await readScreenLog();
  const ids = new Set(sessions.map((s) => s.session_id));
  return {
    sessions: sessions.map(sidecarFor),
    screen_log_note: SCREEN_LOG_NOTE,
    screen_log: screen_log
      .filter((e) => e.session_id === undefined || ids.has(e.session_id))
      .reverse(),
  };
}

/** What "Build package" would produce, without minting a package_id or
    writing a `PackageRecord` — safe to call just to render a preview. */
export interface PackagePreview {
  plant_count: number;
  event_count: number;
  /** Walks this package would carry. */
  session_count: number;
  /** How many of those have a transcript attached. */
  transcribed_count: number;
  tier: TranscriptTier | null;
  marker_count: number;
}

export async function previewReviewPackage(db: DeezDB, state: DerivedState): Promise<PackagePreview> {
  const active = state.order.filter((id) => !state.plants[id].archived);
  const allEvents = await db.getAll('events');
  const newIds = await eventsSincePreviousPackages(db, allEvents.map((e) => e.event_id));
  const sessions = await sessionsSincePreviousPackages(db);
  return {
    plant_count: active.length,
    event_count: newIds.size,
    session_count: sessions.length,
    transcribed_count: sessions.filter((s) => s.transcript).length,
    tier: packageTier(sessions),
    marker_count: sessions.reduce((sum, s) => sum + routeMarkerCount(s.markers), 0),
  };
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

  const sessions = await sessionsSincePreviousPackages(db);

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('events.json', JSON.stringify(newEvents, null, 2));
  zip.file('transcript.txt', await transcriptFile(sessions));
  zip.file('markers.json', JSON.stringify(await markersFile(sessions), null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });

  const record: PackageRecord = {
    package_id,
    generated: as_of,
    event_ids: [...newIds],
    plant_ids: active.map((p) => p.plant_id),
    transcript_tier: packageTier(sessions),
    // Section 6: "A package is not marked `verified` until coverage passes."
    // With no walk in it there is nothing to verify, which is not the same as
    // having verified something — so an audio-free package is not `verified`.
    verified: sessions.length > 0 && sessions.every((s) => s.coverage?.passed === true),
    session_ids: sessions.map((s) => s.session_id),
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
