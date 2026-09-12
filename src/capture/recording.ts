import { openDeezPlants, type DeezDB, type SessionMarker, type SessionRecord } from '../db/schema';
import { mintSessionId } from '../db/counters';
import { registerLiveSession, routeMarkerCount } from './liveSession';
import { nowLocalStamp } from '../lib/dates';
import type { ISODate, PlantId, SessionId } from '../types/ids';

/**
 * The walk recorder. FIELD_DEFINITIONS.md section 6, screen 03.
 *
 * One long recording per walk, pauses free, `audio/mp4` where the browser has
 * it, a wake lock held for as long as a walk is live, and a marker track
 * written as you go. There is exactly one of these per page — a walk has to
 * survive navigating to a plant, logging care and taking a photo, which is
 * the entire point of the markers — so the state lives in the module and
 * React subscribes to it rather than owning it.
 *
 * **Durability.** `MediaRecorder` is asked for a chunk every ten seconds and
 * each chunk is written to the `audio` store as it arrives, under
 * `session_id#NNNN`; the `SessionRecord` is written when the walk *starts* and
 * updated on every chunk. So a walk that iOS kills — backgrounded too long, a
 * call, a reload — is already in the Recordings list with its audio and its
 * markers up to the last chunk, rather than being lost with nothing to show.
 * That is why there is no crash-recovery path here: there is nothing to
 * recover, only a session whose `closed` never became true.
 */

/** Section 6: roughly 1 MB per minute, and one file per walk. Ten seconds a
    chunk keeps the write volume trivial and the worst-case loss small. */
const CHUNK_MS = 10_000;

/** Section 6 asks for `audio/mp4` (AAC). Safari has it; Chrome and Firefox do
    not and give Opus in WebM instead. Both are fine for Whisper — what matters
    is that the file is named for what it actually holds, so the chosen type is
    stored on the session and drives the export's extension. */
const MIME_PREFERENCE = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function extensionFor(mime: string | null | undefined): string {
  if (!mime) return '.audio';
  if (mime.startsWith('audio/mp4')) return '.m4a';
  if (mime.startsWith('audio/webm')) return '.webm';
  if (mime.startsWith('audio/ogg')) return '.ogg';
  if (mime.startsWith('audio/mpeg')) return '.mp3';
  return '.audio';
}

export function recordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;
}

/* -------------------------------------------------------------------------- */
/* Wake lock                                                                   */
/* -------------------------------------------------------------------------- */

/** Minimal shape rather than the DOM lib's, which not every TS target carries. */
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

export function wakeLockSupported(): boolean {
  return wakeLockApi() !== null;
}

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

export type RecPhase =
  | 'ready'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'saving'
  /** iOS ended the capture. Nothing is running; the walk is on disk waiting to
      be resumed or ended. Survives a force-quit — see `restoreInterrupted`. */
  | 'interrupted'
  | 'finished';

export interface SavedSession {
  session_id: SessionId;
  duration_s: number;
  marker_count: number;
}

export interface RecorderSnapshot {
  phase: RecPhase;
  session_id: SessionId | null;
  elapsed_s: number;
  markers: readonly SessionMarker[];
  /** What the recorder is actually producing, once a walk has started. */
  mime: string | null;
  wake_lock: boolean;
  /**
   * The app was sent to the background at some point during this walk.
   * Section 6: "the app must stay in the foreground. Switching apps mid-walk
   * can end the capture. The recording screen says so."
   */
  backgrounded: boolean;
  error: string | null;
  /** The walk just ended, and this is what was written. Cleared on the next start. */
  saved: SavedSession | null;
}

let phase: RecPhase = 'ready';
let sessionId: SessionId | null = null;
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let markers: SessionMarker[] = [];
let startedIso = '';
let mime: string | null = null;
let wakeLock: WakeLockSentinelLike | null = null;
let backgrounded = false;
let error: string | null = null;
let saved: SavedSession | null = null;

/** Elapsed is accumulated across pauses rather than read off the wall clock,
    so a paused stretch costs the walk no time — and a marker's `offset_s`
    always lines up with the same position in the audio. */
let accumulatedMs = 0;
let runningSince = 0;
let chunkIndex = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
let lastTickSecond = -1;

function elapsedMs(): number {
  return accumulatedMs + (phase === 'recording' && runningSince ? Date.now() - runningSince : 0);
}

function elapsedSeconds(): number {
  return Math.floor(elapsedMs() / 1000);
}

/* -------------------------------------------------------------------------- */
/* Subscription — useSyncExternalStore on both the Record screen and the shell */
/* -------------------------------------------------------------------------- */

const subscribers = new Set<() => void>();
let cached: RecorderSnapshot | null = null;

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

function notify(): void {
  cached = null;
  for (const fn of subscribers) fn();
}

export function getSnapshot(): RecorderSnapshot {
  cached ??= {
    phase,
    session_id: sessionId,
    elapsed_s: elapsedSeconds(),
    markers,
    mime,
    wake_lock: wakeLock !== null && !wakeLock.released,
    backgrounded,
    error,
    saved,
  };
  return cached;
}

/** A primitive, so the shell's tab bar re-renders on a phase change and not
    once a second along with the timer. */
export function getPhase(): RecPhase {
  return phase;
}

function startTicker(): void {
  stopTicker();
  lastTickSecond = -1;
  ticker = setInterval(() => {
    const s = elapsedSeconds();
    if (s !== lastTickSecond) {
      lastTickSecond = s;
      notify();
    }
  }, 250);
}

function stopTicker(): void {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
}

/* -------------------------------------------------------------------------- */
/* Markers                                                                     */
/* -------------------------------------------------------------------------- */

function pushMarker(marker: Omit<SessionMarker, 'offset_s'>, at_offset_s?: number): void {
  if (phase !== 'recording' && phase !== 'paused' && phase !== 'saving') return;
  // Section 6's markers exist to answer "which plant was on screen when". Two
  // `plant_open` markers in a row for the same plant answer nothing, and the
  // Prev/Next strip alone would mint a dozen of them, so a repeat is dropped.
  const last = [...markers].reverse().find((m) => m.type === 'plant_open');
  if (marker.type === 'plant_open' && last?.plant_id === marker.plant_id) return;

  markers = [...markers, { ...marker, offset_s: at_offset_s ?? elapsedSeconds() }];
  notify();
  void persistProgress();
}

/** Screen 03: "Tap one to correct it." Retagging keeps the marker where it is
    in time — the offset is objective, only the attribution was a guess. */
export function retagMarker(index: number, plant_id: PlantId): void {
  const marker = markers[index];
  if (!marker || marker.type !== 'plant_open') return;
  markers = markers.map((m, i) => (i === index ? { ...m, plant_id, manual: true } : m));
  notify();
  void persistProgress();
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

function chunkKey(session_id: SessionId, index: number): string {
  return `${session_id}#${String(index).padStart(4, '0')}`;
}

/** Writes the session record as it stands. Called at start, on every chunk,
    on every marker, and once more on a clean end. */
/**
 * Whether the walk is currently being held rather than run.
 *
 * This is module state rather than an argument because the chunk writes are
 * fire-and-forget: `ondataavailable` calls `persistProgress()` with no
 * arguments, and the final chunk arrives *during* `stopRecorder()` — after the
 * interrupt has been written. Passing the flag in meant that last write
 * silently cleared it, and the walk came back as an ordinary unfinished
 * session with no way to resume. Reading it from here makes every writer
 * agree, whoever gets there last.
 */
let heldInterrupted = false;

async function persistProgress(closed = false): Promise<void> {
  if (!sessionId) return;
  const db = await openDeezPlants();
  const record: SessionRecord = {
    session_id: sessionId,
    interrupted: heldInterrupted,
    chunk_count: chunkIndex,
    started: startedIso,
    duration_s: elapsedSeconds(),
    markers: [...markers],
    transcript: null,
    transcript_tier: null,
    coverage: null,
    mime: mime ?? undefined,
    closed,
  };
  const existing = await db.get('sessions', sessionId);
  // Never clobber a transcript that was attached to this session — only the
  // fields this recorder owns are rewritten.
  await db.put('sessions', existing
    ? { ...record, transcript: existing.transcript, transcript_tier: existing.transcript_tier, coverage: existing.coverage }
    : record);
}

/**
 * The audio for one session, whether it ended cleanly (one blob under the
 * session id) or was cut short (the chunks it managed to write).
 */
export async function readSessionAudio(db: DeezDB, session_id: SessionId): Promise<Blob | null> {
  const whole = await db.get('audio', session_id);
  if (whole) return whole;

  const keys = (await db.getAllKeys('audio'))
    .filter((k): k is string => typeof k === 'string' && k.startsWith(`${session_id}#`))
    .sort();
  if (!keys.length) return null;

  const parts: Blob[] = [];
  for (const key of keys) {
    const part = await db.get('audio', key);
    if (part) parts.push(part);
  }
  if (!parts.length) return null;
  return new Blob(parts, { type: parts[0].type });
}

/** Both forms, so deleting a walk leaves nothing behind. */
export async function deleteSessionAudio(db: DeezDB, session_id: SessionId): Promise<void> {
  await db.delete('audio', session_id);
  for (const key of await db.getAllKeys('audio')) {
    if (typeof key === 'string' && key.startsWith(`${session_id}#`)) {
      await db.delete('audio', key);
    }
  }
}

export async function deleteSession(db: DeezDB, session_id: SessionId): Promise<void> {
  await deleteSessionAudio(db, session_id);
  await db.delete('sessions', session_id);
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

async function acquireWakeLock(): Promise<void> {
  const api = wakeLockApi();
  if (!api || wakeLock) return;
  try {
    const sentinel = await api.request('screen');
    // The browser releases the lock itself whenever the page is hidden. Drop
    // our handle when it does, so `visibilitychange` can take a fresh one
    // rather than believing it still holds the old one.
    sentinel.addEventListener('release', () => {
      if (wakeLock === sentinel) wakeLock = null;
      notify();
    });
    wakeLock = sentinel;
  } catch {
    // Denied, or the tab is not visible. Recording continues without it —
    // losing the walk over a screen dimming policy would be much worse.
    wakeLock = null;
  }
  notify();
}

async function releaseWakeLock(): Promise<void> {
  const held = wakeLock;
  wakeLock = null;
  if (held && !held.released) {
    try { await held.release(); } catch { /* already gone */ }
  }
  notify();
}

/**
 * Leaving the app stops the clock, immediately.
 *
 * The owner hit this on their phone: switch away, hear the microphone stop,
 * come back, and the timer is still counting — the interrupted state only
 * arriving minutes later. Two faults, and the invisible one is worse. iOS
 * stops recording the moment the app is backgrounded, so every second counted
 * after that is **time that was never captured**: it inflates the offset of
 * every marker placed afterwards and hands the coverage gate a duration full
 * of silence that no transcript can ever cover.
 *
 * So the clock stops on `visibilitychange`, which fires at once and is not
 * iOS's to delay. Whether the walk is dead or merely paused is a separate
 * question, answered on the way back in.
 */
function onVisibilityChange(): void {
  if (phase !== 'recording' && phase !== 'paused') return;

  if (document.visibilityState === 'hidden') {
    backgrounded = true;
    if (phase === 'recording' && runningSince) {
      accumulatedMs = elapsedMs();
      runningSince = 0;
      stopTicker();
    }
    notify();
    return;
  }

  // Back in front. Trust the track's own state rather than waiting for its
  // `ended` event, which on iOS can take minutes to arrive — and may never,
  // if the mic was muted rather than released.
  void acquireWakeLock();
  if (phase === 'recording') {
    if (!captureAlive()) { onCaptureLost(); return; }
    // Still live, so the capture survived. Carry on from where the clock
    // stopped rather than pretending the gap was recorded.
    runningSince = Date.now();
    startTicker();
  }
  notify();
}

/** Whether the microphone is still actually delivering. A muted track is as
    dead as an ended one for our purposes, and iOS reaches for mute first. */
function captureAlive(): boolean {
  const tracks = stream?.getAudioTracks() ?? [];
  if (!tracks.length) return false;
  return tracks.some((t) => t.readyState === 'live' && !t.muted);
}

function onCaptureLost(): void {
  if (phase !== 'recording' && phase !== 'paused') return;
  // iOS ended the capture — a call, a hardware route change, or the app being
  // away too long. Confirmed on the owner's iPhone 2026-09-11: this is what
  // happens, not what might happen.
  //
  // The walk is held rather than finished. Everything recorded is already on
  // disk; the timer stops dead and nothing keeps running, which is what the
  // owner asked for — but the session stays resumable instead of being closed
  // out from under them.
  error = 'The microphone stopped — iOS ended the capture. Everything so far is saved, and the walk can be picked up where it left off.';
  void interruptSession();
}

/**
 * The third signal, for when neither event arrives and the track still claims
 * to be live: audio simply stops turning up.
 *
 * A chunk is due every `CHUNK_MS`. Going more than a couple of intervals
 * without one, while visible and supposedly recording, means the capture is
 * dead whatever the API says. Only checked in the foreground — a backgrounded
 * page has already stopped its clock and is not counting anything.
 */
const CHUNK_SILENCE_MS = CHUNK_MS * 2.5;
let lastChunkAt = 0;
let watchdog: ReturnType<typeof setInterval> | null = null;

function startWatchdog(): void {
  stopWatchdog();
  lastChunkAt = Date.now();
  watchdog = setInterval(() => {
    if (phase !== 'recording') return;
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastChunkAt < CHUNK_SILENCE_MS) return;
    onCaptureLost();
  }, 2_000);
}

function stopWatchdog(): void {
  if (watchdog !== null) clearInterval(watchdog);
  watchdog = null;
}

function attachLifecycle(): void {
  document.addEventListener('visibilitychange', onVisibilityChange);
  for (const track of stream?.getAudioTracks() ?? []) {
    track.addEventListener('ended', onCaptureLost);
    // iOS mutes an interrupted microphone well before it ends the track. This
    // is the signal that actually arrives promptly.
    track.addEventListener('mute', onCaptureLost);
  }
  startWatchdog();
}

function detachLifecycle(): void {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  for (const track of stream?.getAudioTracks() ?? []) {
    track.removeEventListener('ended', onCaptureLost);
    track.removeEventListener('mute', onCaptureLost);
  }
  stopWatchdog();
}

function teardown(): void {
  detachLifecycle();
  stopTicker();
  registerLiveSession(null);
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  recorder = null;
  runningSince = 0;
  void releaseWakeLock();
}

/* -------------------------------------------------------------------------- */
/* The controls                                                                */
/* -------------------------------------------------------------------------- */

function friendlyStartError(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError') {
    return 'Microphone access was refused. Allow it for this site and try again.';
  }
  if (name === 'NotFoundError') return 'No microphone was found on this device.';
  if (name === 'NotReadableError') {
    return 'The microphone is busy — another app or tab is holding it.';
  }
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

export async function startSession(as_of: ISODate): Promise<void> {
  if (phase !== 'ready' && phase !== 'finished') return;
  if (!recordingSupported()) {
    error = 'This browser has no MediaRecorder — recording needs Safari on iOS, or Chrome or Firefox on a laptop.';
    notify();
    return;
  }

  phase = 'starting';
  error = null;
  saved = null;
  backgrounded = false;
  heldInterrupted = false;
  markers = [];
  chunkIndex = 0;
  accumulatedMs = 0;
  notify();

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const chosen = pickMimeType();
    recorder = new MediaRecorder(stream, chosen ? { mimeType: chosen } : undefined);
    mime = chosen ?? (recorder.mimeType || null);

    const db = await openDeezPlants();
    sessionId = await mintSessionId(db, as_of);
    const session_id = sessionId;
    startedIso = nowLocalStamp();

    recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data || !e.data.size) return;
      lastChunkAt = Date.now();
      const key = chunkKey(session_id, chunkIndex);
      chunkIndex += 1;
      // Fire and forget: a slow write must never stall the recorder.
      void openDeezPlants()
        .then((handle) => handle.put('audio', e.data, key))
        .then(() => persistProgress())
        .catch(() => { /* the next chunk will try again */ });
    };
    recorder.onerror = () => {
      error = 'The recorder reported an error. Everything captured so far has been saved.';
      void endSession();
    };

    runningSince = Date.now();
    phase = 'recording';
    registerLiveSession({
      stamp: () => ({ session_id, offset_s: elapsedSeconds() }),
      mark: pushMarker,
    });

    recorder.start(CHUNK_MS);
    pushMarker({ type: 'session_start' });
    await persistProgress();
    attachLifecycle();
    startTicker();
    await acquireWakeLock();
    notify();
  } catch (e: unknown) {
    error = friendlyStartError(e);
    sessionId = null;
    teardown();
    phase = 'ready';
    notify();
  }
}

export function pauseSession(): void {
  if (phase !== 'recording' || !recorder) return;
  accumulatedMs = elapsedMs();
  runningSince = 0;
  phase = 'paused';
  // The wake lock is deliberately held through a pause: the walk is still
  // live, and letting the screen sleep here is how a paused walk gets lost.
  try { recorder.pause(); } catch { /* already paused */ }
  notify();
}

export async function resumeSession(): Promise<void> {
  if (phase !== 'paused' || !recorder) return;
  try { recorder.resume(); } catch { /* already running */ }
  runningSince = Date.now();
  phase = 'recording';
  await acquireWakeLock();
  notify();
}

/** How long to wait for the recorder's `stop` event before giving up on it.
    A live recorder fires it in milliseconds; this only ever elapses when the
    recorder cannot answer at all. */
const STOP_TIMEOUT_MS = 3_000;

/**
 * Stop the recorder and wait for its final chunk — but never wait for ever.
 *
 * The timeout is the whole point. When iOS kills the capture, the recorder is
 * left nominally alive with a dead track underneath it: `state` is not
 * `inactive`, so the guard below does not fire, but `stop` never arrives
 * either. Without a deadline the caller hung in `saving` permanently, which
 * wedged the Record screen on "Working…" and left `closed` false so Recordings
 * reported a dead session as "Recording now". A laptop cannot produce that
 * state, which is why it survived every test until a real iOS kill.
 *
 * Resolving early costs at most the last partial chunk. The chunks already
 * written every ten seconds are untouched.
 */
function stopRecorder(): Promise<void> {
  return new Promise<void>((resolve) => {
    const r = recorder;
    if (!r || r.state === 'inactive') { resolve(); return; }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, STOP_TIMEOUT_MS);

    r.addEventListener('stop', finish, { once: true });
    // Some engines will not fire `stop` from `paused`.
    if (r.state === 'paused') { try { r.resume(); } catch { /* ignore */ } }
    try { r.stop(); } catch { finish(); }
  });
}

/**
 * End the walk. The final chunk arrives with the `stop` event, so the chunks
 * are assembled into one blob only after that has been handled — then the
 * per-chunk records are dropped and the whole file takes their place.
 */
export async function endSession(): Promise<SessionId | null> {
  if (phase !== 'recording' && phase !== 'paused') return null;
  const session_id = sessionId;
  if (!session_id) return null;

  accumulatedMs = elapsedMs();
  runningSince = 0;
  heldInterrupted = false;
  pushMarker({ type: 'session_end' });
  phase = 'saving';
  registerLiveSession(null);
  notify();

  // Everything from here is best-effort. The walk is already on disk in
  // ten-second chunks, so the worst outcome of a failure here is a session
  // that has to be read back from its chunks — not a lost walk. What must not
  // happen is the phase staying at `saving`, because that is a freeze the
  // owner can only clear by force-quitting the app. Hence `finally`.
  try {
    await stopRecorder();

    const db = await openDeezPlants();
    // The recorder's last `ondataavailable` fires just before `stop` and writes
    // asynchronously; give it the turn it needs before assembling.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const whole = await readSessionAudio(db, session_id);
    if (whole) {
      await deleteSessionAudio(db, session_id);
      await db.put('audio', whole, session_id);
    }
    await persistProgress(true);
  } catch {
    // Mark the session closed even if assembling its audio failed, so it stops
    // reading as live. A second attempt is pointless: the chunks are the
    // record, and `readSessionAudio` already falls back to them.
    try { await persistProgress(true); } catch { /* the chunks still stand */ }
  } finally {
    saved = { session_id, duration_s: elapsedSeconds(), marker_count: routeMarkerCount(markers) };
    teardown();
    phase = 'finished';
    notify();
  }
  return session_id;
}

/* -------------------------------------------------------------------------- */
/* Interrupted walks                                                           */
/* -------------------------------------------------------------------------- */

/** When the capture was cut off, so the gap marker can say how long it was. */
let interruptedAt = 0;

/**
 * Hold the walk rather than end it.
 *
 * Everything recorded is already on disk in ten-second chunks. This stops the
 * recorder, drops the microphone and the wake lock, and stops the timer dead —
 * nothing keeps running, which was the owner's condition. What it does not do
 * is assemble the chunks into one blob the way `endSession` does: a resumed
 * segment has to keep appending to them, and assembly would strand it.
 */
async function interruptSession(): Promise<void> {
  if (phase !== 'recording' && phase !== 'paused') return;
  accumulatedMs = elapsedMs();
  runningSince = 0;
  interruptedAt = Date.now();
  heldInterrupted = true;
  phase = 'saving';
  registerLiveSession(null);
  notify();

  try {
    await stopRecorder();
    await persistProgress();
  } catch {
    /* The chunks are the record and they are already written. */
  } finally {
    // Not `teardown()`: that clears `runningSince` and the stream, which is
    // what we want, but the session id, markers and elapsed total must all
    // survive for the resume.
    detachLifecycle();
    stopTicker();
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    recorder = null;
    void releaseWakeLock();
    phase = 'interrupted';
    notify();
  }
}

/**
 * Pick an interrupted walk back up. A new microphone, a new recorder, the same
 * session: same id, same markers, and the elapsed time carries on from where
 * it stopped rather than restarting or counting the gap.
 *
 * The gap itself is marked. The audio really does jump, and a transcript that
 * pretended otherwise would put the wrong words next to the wrong plants —
 * and the coverage gate would read the missing minutes as a failure rather
 * than as time nobody recorded.
 *
 * Safari asks for the microphone again here. That is iOS, not something the
 * app can carry over.
 */
export async function resumeInterrupted(): Promise<void> {
  if (phase !== 'interrupted' || !sessionId) return;
  const session_id = sessionId;

  phase = 'starting';
  error = null;
  heldInterrupted = false;
  notify();

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chosen = pickMimeType();
    recorder = new MediaRecorder(stream, chosen ? { mimeType: chosen } : undefined);
    mime = chosen ?? (recorder.mimeType || null);

    recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data || !e.data.size) return;
      lastChunkAt = Date.now();
      const key = chunkKey(session_id, chunkIndex);
      chunkIndex += 1;
      void openDeezPlants()
        .then((handle) => handle.put('audio', e.data, key))
        .then(() => persistProgress())
        .catch(() => { /* the next chunk will try again */ });
    };
    recorder.onerror = () => {
      error = 'The recorder reported an error. Everything captured so far has been saved.';
      void interruptSession();
    };

    runningSince = Date.now();
    phase = 'recording';
    registerLiveSession({
      stamp: () => ({ session_id, offset_s: elapsedSeconds() }),
      mark: pushMarker,
    });

    // Placed after the phase flips, because `pushMarker` refuses to write
    // outside a live walk.
    const gap_s = interruptedAt ? Math.round((Date.now() - interruptedAt) / 1000) : 0;
    interruptedAt = 0;
    pushMarker({ type: 'gap', gap_s });

    recorder.start(CHUNK_MS);
    attachLifecycle();
    startTicker();
    void acquireWakeLock();
    await persistProgress();
    notify();
  } catch (e: unknown) {
    error = friendlyStartError(e);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    recorder = null;
    runningSince = 0;
    heldInterrupted = true;
    phase = 'interrupted';
    notify();
  }
}

/**
 * Finish an interrupted walk without resuming it — "I'm done, keep what you
 * got." It goes through `endSession`'s assembly, so the segments become one
 * file and the walk stops reading as live anywhere.
 */
export async function endInterrupted(): Promise<SessionId | null> {
  if (phase !== 'interrupted') return null;
  phase = 'paused';
  return endSession();
}

/**
 * Find a walk that was interrupted and never picked up, and make it resumable
 * again. Called once at boot.
 *
 * This is what makes an interrupted walk survive the app being closed: the
 * flag, the markers and the elapsed total are all on disk, so a force-quit
 * mid-walk costs the last few seconds of audio and nothing else.
 */
export async function restoreInterrupted(): Promise<boolean> {
  if (phase !== 'ready') return false;
  const db = await openDeezPlants();
  const held = (await db.getAll('sessions'))
    .filter((r) => r.interrupted && !r.closed)
    .sort((a, b) => (a.started < b.started ? 1 : -1))[0];
  if (!held) return false;

  sessionId = held.session_id;
  startedIso = held.started;
  markers = [...held.markers];
  accumulatedMs = held.duration_s * 1000;
  chunkIndex = held.chunk_count ?? held.markers.length;
  mime = held.mime ?? null;
  runningSince = 0;
  // Not restored: `interruptedAt`. A walk picked up tomorrow would otherwise
  // claim a sixteen-hour gap, which is true of the clock and useless in a
  // transcript. An unknown gap is recorded as zero and the marker still says
  // the audio jumps.
  interruptedAt = 0;
  heldInterrupted = true;
  phase = 'interrupted';
  // No error line here. On a live interrupt the message explains something the
  // owner could not otherwise know — the microphone stopped, and why. Restored
  // from disk there is nothing to explain that the panel does not already say,
  // and saying it twice in two colours makes a handled situation look wrong.
  error = null;
  notify();
  return true;
}

/**
 * Screen 03's "Delete recording". The audio and the session record go; events
 * and photos logged during the walk stay, because they are the record and the
 * audio was only ever the account of it.
 */
export async function discardSession(): Promise<void> {
  if (phase === 'ready') return;
  const session_id = sessionId;
  registerLiveSession(null);
  await stopRecorder();
  teardown();

  if (session_id) {
    const db = await openDeezPlants();
    await deleteSession(db, session_id);
  }

  phase = 'ready';
  sessionId = null;
  markers = [];
  accumulatedMs = 0;
  chunkIndex = 0;
  saved = null;
  error = null;
  backgrounded = false;
  notify();
}

/**
 * Leaves the finished-session summary behind and returns the screen to READY.
 *
 * Pass a `session_id` to clear it only if that is the walk being summarised —
 * deleting a walk from Recordings calls it that way, so the Record screen
 * stops offering a summary of something that is no longer on the device.
 */
export function clearFinished(session_id?: SessionId): void {
  if (phase !== 'finished' && phase !== 'interrupted') return;
  if (session_id && sessionId !== session_id) return;
  phase = 'ready';
  sessionId = null;
  markers = [];
  accumulatedMs = 0;
  saved = null;
  error = null;
  backgrounded = false;
  notify();
}

/** `M:SS`, or `H:MM:SS` past the hour. The timer on screen 03. */
export function formatDuration(total_s: number): string {
  const s = Math.max(0, Math.floor(total_s));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
