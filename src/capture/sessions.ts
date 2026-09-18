import JSZip from 'jszip';
import type { DeezDB, ScreenLogEntry, SessionRecord } from '../db/schema';
import { deleteSessionAudio, extensionFor, readSessionSegments, sessionAudioBytes } from './recording';
import { checkCoverage, parseDuration, parseQuiet, parseTranscript } from './coverage';
import { screenLogForSession } from './screenLog';
import { routeMarkerCount } from './liveSession';
import { PARTS_NOTE, mapMarkers, walkParts } from './parts';
import type { SessionId } from '../types/ids';

/**
 * Reading, exporting and transcribing recorded walks — screen 15.
 *
 * Section 6: "The phone records; the laptop transcribes." Nothing here tries
 * to turn speech into text. Export moves the audio and its marker sidecar out
 * so Whisper can run on them somewhere else, and the transcript comes back the
 * same way, through `attachTranscript`.
 */

export interface SessionSummary extends SessionRecord {
  /** Bytes of audio held for this walk, chunked or whole. */
  audio_bytes: number;
  marker_count: number;
  /** `plant_open` markers — screen 03's "Detected on route" count. */
  plant_count: number;
}

export async function listSessions(db: DeezDB): Promise<SessionSummary[]> {
  const records = await db.getAll('sessions');
  const summaries: SessionSummary[] = [];

  for (const record of records) {
    summaries.push({
      ...record,
      audio_bytes: await sessionAudioBytes(db, record.session_id),
      marker_count: routeMarkerCount(record.markers),
      plant_count: new Set(
        record.markers.filter((m) => m.type === 'plant_open').map((m) => m.plant_id),
      ).size,
    });
  }

  // Newest first.
  return summaries.sort((a, b) => (a.started < b.started ? 1 : a.started > b.started ? -1 : 0));
}

export function totalAudioBytes(sessions: readonly SessionSummary[]): number {
  return sessions.reduce((sum, s) => sum + s.audio_bytes, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* The sidecar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Section 6's marker file, in the shape the spec prints. "Written as a sidecar
 * file, not stamped into the audio — audio chapter markers are fragile,
 * tool-dependent, and stripped by anything that re-encodes."
 */
export function sidecarFor(session: SessionRecord) {
  const parts = walkParts(session);
  const mapped = mapMarkers(session);
  return {
    session_id: session.session_id,
    started: session.started,
    duration_s: session.duration_s,
    /** Only for a walk that was interrupted — see `capture/parts.ts`. A walk
        that ran start to finish has one clock and one recording, and saying so
        in four extra fields helps nobody. */
    ...(parts.length > 1 ? { parts, parts_note: PARTS_NOTE } : {}),
    markers: parts.length > 1
      ? mapped.map((m) => ({ ...m.marker, part: m.part, stitched_at_least_s: m.stitched_at_least_s }))
      : session.markers,
  };
}

/**
 * Section 6: the screen log "is labelled as evidence, not fact. The export
 * calls it 'screen open at this time', never 'plant discussed'." The note
 * travels with the entries so it cannot be separated from them.
 */
export const SCREEN_LOG_NOTE =
  'Evidence, not fact: each entry means this screen was open at this time, '
  + 'for this long. It does not mean the plant was discussed. Where it '
  + 'disagrees with the words, the words win.';

export function screenLogFileFor(session: SessionRecord, entries: readonly ScreenLogEntry[]) {
  return {
    session_id: session.session_id,
    note: SCREEN_LOG_NOTE,
    entries,
  };
}

/* -------------------------------------------------------------------------- */
/* Export — the step that moves a walk out for Whisper                         */
/* -------------------------------------------------------------------------- */

export interface SessionExport {
  blob: Blob;
  filename: string;
  audio_name: string;
}

/**
 * One zip per walk: the audio, its sidecar, the screen log for that stretch,
 * and the transcript if one has already come back. One file to move to the
 * laptop rather than three to keep together — section 6's "audio moves by
 * hand", made as few hands as possible.
 */
/**
 * A human name for a walk: `2026-09-14 1907 walk 4`.
 *
 * Date then 24-hour time then which walk that day, so a folder of them sorts
 * into the order they happened — which is the only sort a phone gives you for
 * free. The owner asked for a real timestamp rather than just a date, and
 * they were right: several walks a day is normal.
 *
 * The session id stays inside every file, on the first line, so nothing loses
 * its link back to the record.
 */
export function walkLabel(session: SessionRecord): string {
  const [date, time] = session.started.split('T');
  const hhmm = (time ?? '').replace(/:/g, '').slice(0, 4);
  const n = session.session_id.split('-').pop();
  return `${date}${hhmm ? ' ' + hhmm : ''} walk ${n ?? ''}`.trim();
}

export async function exportSession(db: DeezDB, session_id: SessionId): Promise<SessionExport> {
  const session = await db.get('sessions', session_id);
  if (!session) throw new Error(`No session ${session_id} on this device.`);

  const segments = await readSessionSegments(db, session_id);
  const ext = extensionFor(session.mime ?? segments[0]?.type);
  // A walk that was interrupted holds one file per stretch. They are named in
  // order and Whisper reads them in order; joining them would produce bytes
  // no player reads past the first seam, which is the bug this replaced.
  const label = walkLabel(session);
  const names = segments.map((_, i) => (segments.length === 1
    ? `${label} — audio${ext}`
    : `${label} — audio ${i + 1} of ${segments.length}${ext}`));
  const audio_name = names[0] ?? `${session_id}${ext}`;
  const entries = await screenLogForSession(session_id);

  const zip = new JSZip();
  segments.forEach((audio, i) => zip.file(names[i], audio));
  // `markers.json` keeps its plain name as well as the readable one: the
  // transcription script has always looked for exactly that, and an export
  // made today should still work with a script from last week.
  zip.file('markers.json', JSON.stringify(sidecarFor(session), null, 2));
  zip.file(`${label} — markers.json`, JSON.stringify(sidecarFor(session), null, 2));
  // What happened to the walk, when something did. It travels with the export
  // so a walk that came back short can be explained by whoever looks at it
  // next, rather than being re-guessed from two numbers.
  if (session.trail?.length) {
    const lines = [
      session.session_id,
      `clock ${session.duration_s}s · captured ${session.captured_s ?? '?'}s`,
      '',
      ...session.trail,
      '',
    ];
    zip.file('what-happened.txt', lines.join('\n'));
  }
  zip.file(`${label} — screen log.json`, JSON.stringify(screenLogFileFor(session, entries), null, 2));
  if (session.transcript) {
    zip.file('transcript.txt', session.transcript);
  } else {
    zip.file(
      'README.txt',
      `${session_id}\n\n`
      + `Run Whisper over ${audio_name}, then bring the result back into the app:\n`
      + '  whisper ' + audio_name + ' --output_format json\n\n'
      + 'Recordings → this walk → Add transcript. Paste the JSON (or the SRT) to\n'
      + 'get a verified, coverage-checked transcript; paste plain text to get an\n'
      + 'unverified one, which is accepted whole but not gated.\n',
    );
  }

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: `${label}.zip`,
    audio_name,
  };
}

/* -------------------------------------------------------------------------- */
/* Transcripts                                                                 */
/* -------------------------------------------------------------------------- */

export interface AttachResult {
  tier: 'verified' | 'unverified';
  coverage: SessionRecord['coverage'];
  segment_count: number;
  /** Audio released because the words now account for all of it, in bytes. */
  freed_bytes: number;
}

/**
 * Section 6's two tiers. Timestamps present -> verified, and the four coverage
 * assertions run; no timestamps -> unverified, accepted whole with no gate.
 *
 * "A session may hold both: an unverified paste now, replaced by verified
 * Whisper output later. Replacing raises the tier and re-runs the gate." That
 * falls out of this being a plain replace — there is no separate upgrade path.
 */
export async function attachTranscript(
  db: DeezDB,
  session_id: SessionId,
  raw: string,
): Promise<AttachResult> {
  const session = await db.get('sessions', session_id);
  if (!session) throw new Error(`No session ${session_id} on this device.`);

  const { text, segments } = parseTranscript(raw);
  if (!text) throw new Error('That transcript is empty.');

  const verified = segments.length > 0;

  /**
   * An interrupted walk's clock is known to understate, so the audio wins.
   *
   * The clock freezes while the app is backgrounded and iOS carries on
   * recording. The owner's walk of 14 Sep held 13:05 of audio against a
   * record of 5:57 — and judging its complete transcript against 5:57
   * rejected it for running past the end of a recording that was actually
   * twice as long.
   *
   * Narrow on purpose. Only for a walk that was interrupted, only upwards,
   * and only from a measurement the transcriber made by decoding the files.
   * A walk that ran start to finish has a clock worth trusting, and a
   * transcript claiming a walk is SHORTER than recorded is never believed.
   */
  const interrupted = (session.segment_starts?.length ?? 1) > 1;
  const measured = parseDuration(raw);
  const duration_s = interrupted && measured && measured > session.duration_s
    ? Math.round(measured)
    : session.duration_s;

  // The script measures where the audio was quiet and writes it into the
  // transcript; without it, gaps are judged the old way rather than wrongly
  // forgiven.
  const coverage = verified
    ? checkCoverage(segments, duration_s, session.markers, parseQuiet(raw))
    : null;

  await db.put('sessions', {
    ...session,
    // Corrected duration is persisted, not just used for the check: every
    // later reader — Recordings, the export, the review package the AI sees —
    // should see the walk's real length rather than the clock's guess.
    duration_s,
    transcript: text,
    transcript_tier: verified ? 'verified' : 'unverified',
    coverage,
  });

  /**
   * The owner's rule, 2026-09-14: **a walk's audio has done its job once the
   * words are in the app.** Audio runs about 1MB a minute and a single
   * interrupted walk came to 18.6MB; the transcript is what the AI reads,
   * what the coverage gate checks, and what survives a backup.
   *
   * **The guard is not a hedge, and it earned itself the same day.** The
   * audio goes only when coverage PASSES — which is precisely the app's own
   * statement that the words account for the whole recording. Walk 4's first
   * transcript failed coverage because the app had the duration wrong, and
   * it had to be regenerated from the audio twice. Under an unconditional
   * rule that audio would already have been deleted and seven minutes of the
   * owner's walk would have been permanently missing, silently.
   *
   * A failing transcript is exactly when the recording is still needed.
   *
   * This reverses an earlier decision recorded in the handoff — "do not let
   * it become automatic" — knowingly and at the owner's request, having seen
   * how fast audio accumulates. The coverage guard is what satisfies the
   * caution behind that earlier note rather than ignoring it.
   */
  let freed_bytes = 0;
  if (verified && coverage?.passed) {
    freed_bytes = await sessionAudioBytes(db, session_id);
    if (freed_bytes > 0) await deleteSessionAudio(db, session_id);
  }

  return {
    tier: verified ? 'verified' : 'unverified',
    coverage,
    segment_count: segments.length,
    freed_bytes,
  };
}

export async function removeTranscript(db: DeezDB, session_id: SessionId): Promise<void> {
  const session = await db.get('sessions', session_id);
  if (!session) return;
  await db.put('sessions', { ...session, transcript: null, transcript_tier: null, coverage: null });
}
