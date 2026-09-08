import JSZip from 'jszip';
import type { DeezDB, ScreenLogEntry, SessionRecord } from '../db/schema';
import { extensionFor, readSessionAudio } from './recording';
import { checkCoverage, parseTranscript } from './coverage';
import { screenLogForSession } from './screenLog';
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
    const audio = await readSessionAudio(db, record.session_id);
    summaries.push({
      ...record,
      audio_bytes: audio?.size ?? 0,
      marker_count: record.markers.length,
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
  return {
    session_id: session.session_id,
    started: session.started,
    duration_s: session.duration_s,
    markers: session.markers,
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
export async function exportSession(db: DeezDB, session_id: SessionId): Promise<SessionExport> {
  const session = await db.get('sessions', session_id);
  if (!session) throw new Error(`No session ${session_id} on this device.`);

  const audio = await readSessionAudio(db, session_id);
  const audio_name = `${session_id}${extensionFor(session.mime ?? audio?.type)}`;
  const entries = await screenLogForSession(session_id);

  const zip = new JSZip();
  if (audio) zip.file(audio_name, audio);
  zip.file('markers.json', JSON.stringify(sidecarFor(session), null, 2));
  zip.file('screen_log.json', JSON.stringify(screenLogFileFor(session, entries), null, 2));
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
    filename: `deez-plants-${session_id}.zip`,
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
  const coverage = verified
    ? checkCoverage(segments, session.duration_s, session.markers)
    : null;

  await db.put('sessions', {
    ...session,
    transcript: text,
    transcript_tier: verified ? 'verified' : 'unverified',
    coverage,
  });

  return { tier: verified ? 'verified' : 'unverified', coverage, segment_count: segments.length };
}

export async function removeTranscript(db: DeezDB, session_id: SessionId): Promise<void> {
  const session = await db.get('sessions', session_id);
  if (!session) return;
  await db.put('sessions', { ...session, transcript: null, transcript_tier: null, coverage: null });
}
