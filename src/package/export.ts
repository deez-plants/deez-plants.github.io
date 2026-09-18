import JSZip from 'jszip';
import type { DeezDB, PackageRecord, SessionRecord, TranscriptTier } from '../db/schema';
import { mintDatedId } from '../db/counters';
import { commitUpdate } from '../db/events';
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
    spot: p.spot,
    pot: p.pot,
    planter: p.planter,
    planter_shared_water: p.planter_shared_water,
    water_interval_days: p.water_interval_days,
    water_interval_days_winter: p.water_interval_days_winter,
    feed: p.feed,
    light: p.light,
    soil: p.soil,
    environment: p.environment,
    repotting: p.repotting,
    pruning: p.pruning,
    pests: p.pests,
    season: p.season,
    propagation: p.propagation,
    status_label: p.status_label,
    do_next: p.do_next,
    notes_user: p.notes_user,
    care_instructions: p.care_instructions,
    health: p.health.current,
    health_source: p.health.source,
    health_confirmed: p.health.confirmed,
    health_changed: p.health.changed,
    health_stale: p.health.stale,
    adherence: p.adherence.state,
    on_time_count: p.adherence.on_time_count,
    care_count: p.adherence.care_count,
    avg_days_late: p.adherence.avg_days_late,
    interval_days: p.adherence.interval_days,
    next_due: p.adherence.next_due,
    days_past: p.adherence.days_past,
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
  // Not "no recordings on this device": walks go out in exactly one package,
  // so an empty file here usually means every walk has already been sent, not
  // that none exists. The first version said the wrong one of those and a
  // reviewer reasonably read it as missing data.
  if (!sessions.length) {
    return 'No new walks in this package.\n\n'
      + 'A walk is carried by exactly one package, never repeated. If earlier\n'
      + 'packages contained walks, those words still stand - nothing has been\n'
      + 'withdrawn or replaced. An empty file here means nothing new has been\n'
      + 'recorded since the last package, not that the device holds no walks.\n';
  }

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
  /**
   * Mark this point before anything is measured.
   *
   * Two jobs at once, and both were learned the hard way. It folds in anything
   * somehow still waiting, so the manifest can never disagree with the events
   * file beside it — the 17 Sep package said a plant was four days past its
   * interval while carrying its own watering from three days earlier, and a
   * reviewer had no way to tell which half to believe.
   *
   * And it takes the snapshot. "Since last time" now means "since the last AI
   * round", which is the rhythm the owner actually works in, rather than
   * whenever a button last got tapped.
   */
  const marked = await commitUpdate(db, as_of);
  state = marked.state;

  const active = state.order.map((id) => state.plants[id]).filter((p) => !p.archived);
  const package_id = await mintDatedId(db, 'PKG', as_of) as PackageId;

  // Stated, not left to be counted off the list: the first real package
  // carried 21 plants against a record of 22 and nothing in it said which was
  // right. Archived plants are named here and nowhere else — they are still
  // not eligible for an AI update, and appearing in `plants` is what would
  // make them so.
  const archived = state.order.map((id) => state.plants[id]).filter((p) => p.archived);
  const manifest: Manifest = {
    package_id,
    generated: as_of,
    collection: {
      permanent_record_count: state.order.length,
      active_count: active.length,
      archived_count: archived.length,
      archived: archived.map((p) => ({
        plant_id: p.plant_id,
        name: p.name,
        date: p.archived_date,
        reason: p.archived_reason,
      })),
    },
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
    filename: `${stamp()} review package.zip`,
  };
}

/** Triggers the browser's own save flow. The one place this app downloads a
    file rather than reading one — package prepare has no on-device home for
    the result, unlike everything else here. */
/** `2026-09-14 2130` — when this file was made, for sorting in Files. */
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
}

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
