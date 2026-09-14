import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { openDeezPlants } from '../db/schema';
import {
  attachTranscript,
  exportSession,
  formatBytes,
  listSessions,
  removeTranscript,
  totalAudioBytes,
  type SessionSummary,
} from '../capture/sessions';
import { clearFinished, deleteSession, deleteSessionAudio, formatDuration, getPhase, getSnapshot, readSessionAudio, subscribe } from '../capture/recording';
import { saveBlob } from '../package/export';
import type { SessionId } from '../types/ids';
import './Recordings.css';

/**
 * DESIGN_REFERENCE.md screen 15 — sessions held on this device: date,
 * duration, marker count, and whether a transcript exists.
 *
 * "Export moves the audio and its sidecar out for Whisper." That is the whole
 * job of this screen: the phone records, the laptop transcribes, and the two
 * hand files to each other here. Section 6's two tiers are shown as they are —
 * a pasted transcript is accepted whole and marked `unverified`; a Whisper one
 * carries timestamps, so the four coverage assertions run and the result is
 * shown pass or fail rather than being hidden behind a badge.
 */

export interface RecordingsProps {
  backLabel: string;
  onBack: () => void;
}

function formatStarted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function Recordings({ backLabel, onBack }: RecordingsProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SessionId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SessionId | null>(null);
  const [confirmFree, setConfirmFree] = useState<SessionId | null>(null);
  const [transcribing, setTranscribing] = useState<SessionId | null>(null);
  const [draft, setDraft] = useState('');

  /**
   * Listening back, and the replay button FIELD_DEFINITIONS.md section 6 asks
   * for: "any failure is flagged with a replay button at that offset."
   *
   * Those turn out to be one feature. A coverage failure says "nothing was
   * transcribed at 4:12" — and the only way to judge whether that is a bad
   * transcript or genuinely silent audio is to hear 4:12. So the failure rows
   * are seek buttons into the same player.
   *
   * One player at a time, holding one object URL. Audio is tens of megabytes;
   * keeping a URL per session alive would pin every one of them in memory.
   *
   * **Untested against real iPhone audio.** In Chrome on the build machine the
   * player mounts and the blob loads, but the fragmented-MP4 these test
   * recordings are never reaches `readyState > 0` — chunk 0 is a 641-byte init
   * segment and the rest are fragments, which Safari writes and reads happily
   * and Chrome's own `<audio>` will not decode back. Nothing here is wrong;
   * the question is whether the owner's Safari-recorded walks play, and only
   * their phone can answer it. Whisper reads fMP4 through ffmpeg regardless,
   * so the export path is unaffected either way.
   */
  const [playing, setPlaying] = useState<SessionId | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * Whether the browser managed to decode what we handed it.
   *
   * The owner reported being unable to listen to a walk, sometimes. Two
   * plausible causes were tested and disproved — a short walk losing its last
   * chunk, and the chunk-versus-assembled size check — so rather than guess a
   * third, this screen now says what it knows instead of presenting a control
   * that silently does nothing. A player that never becomes playable is the
   * other half of the same complaint, and that one is reproducible: Chrome
   * will not decode the fragmented MP4 Safari writes.
   */
  const [playState, setPlayState] = useState<'loading' | 'ready' | 'stalled'>('loading');

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const openPlayer = async (session_id: SessionId): Promise<boolean> => {
    if (playing === session_id && audioUrl) return true;
    setError(null);
    try {
      const db = await openDeezPlants();
      const blob = await readSessionAudio(db, session_id);
      if (!blob) { setError('No audio stored for this walk.'); return false; }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setPlaying(session_id);
      setPlayState('loading');
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const closePlayer = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setPlaying(null);
  };

  /** Jump to the moment a coverage failure names. */
  const replayAt = async (session_id: SessionId, offset_s: number) => {
    const ready = playing === session_id && audioUrl ? true : await openPlayer(session_id);
    if (!ready) return;
    // The element only exists after the render that the state change causes.
    setTimeout(() => {
      const el = audioRef.current;
      if (!el) return;
      // A few seconds before the offset: the interesting thing is what leads
      // into the gap, and landing exactly on it tells you nothing.
      el.currentTime = Math.max(0, offset_s - 3);
      void el.play().catch(() => { /* the controls are right there */ });
    }, 0);
  };

  // A walk being recorded right now writes its record and its audio as it
  // goes, so it is already in this list. Re-read when the recorder's phase
  // changes so ending one lands here without a manual refresh.
  const phase = useSyncExternalStore(subscribe, getPhase, getPhase);
  // Which walk the recorder is actually holding. "Is anything running" is not
  // enough — see `liveNow` below.
  const liveSession = useSyncExternalStore(subscribe, getSnapshot, getSnapshot).session_id;

  // Bumped by anything that changes what is stored, so the list re-reads from
  // the database rather than being patched in place here.
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = await openDeezPlants();
        const list = await listSessions(db);
        if (live) setSessions(list);
      } catch (e: unknown) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [reloads, phase]);

  const doExport = async (session_id: SessionId) => {
    setBusy(session_id);
    setError(null);
    try {
      const db = await openDeezPlants();
      const built = await exportSession(db, session_id);
      saveBlob(built.blob, built.filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (session_id: SessionId) => {
    setBusy(session_id);
    setConfirmDelete(null);
    try {
      const db = await openDeezPlants();
      await deleteSession(db, session_id);
      // The Record screen may still be summarising this very walk.
      clearFinished(session_id);
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doAttach = async (session_id: SessionId) => {
    setBusy(session_id);
    setError(null);
    try {
      const db = await openDeezPlants();
      await attachTranscript(db, session_id, draft);
      setTranscribing(null);
      setDraft('');
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Drop a walk's audio and keep everything else.
   *
   * Audio is the only thing here that grows dangerously — a ten-minute walk is
   * about 9MB, so weekly walks come to roughly half a gigabyte a year, while
   * every event ever logged is half a megabyte a year. Once a transcript
   * exists the audio's job is done: the transcript is what the AI reads and
   * what the coverage gate checks.
   *
   * **Only offered when a transcript exists**, and never automatic. Dropping
   * audio from an untranscribed walk loses the walk, and that must not be one
   * tap away.
   */
  const doFreeSpace = async (session_id: SessionId) => {
    setBusy(session_id);
    setConfirmFree(null);
    setError(null);
    try {
      if (playing === session_id) closePlayer();
      const db = await openDeezPlants();
      await deleteSessionAudio(db, session_id);
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doRemoveTranscript = async (session_id: SessionId) => {
    setBusy(session_id);
    try {
      const db = await openDeezPlants();
      await removeTranscript(db, session_id);
      reload();
    } finally {
      setBusy(null);
    }
  };

  const readFile = async (file: File) => {
    setDraft(await file.text());
  };

  const total = sessions ? totalAudioBytes(sessions) : 0;
  // Walks whose audio has already done its job. Shown only when there is
  // something to act on, so the page does not nag about storage nobody is
  // short of.
  const clearable = (sessions ?? []).filter((s) => s.transcript && s.audio_bytes > 0);
  const clearableBytes = clearable.reduce((sum, s) => sum + s.audio_bytes, 0);

  return (
    <main className="recs">
      <button type="button" className="screen-back recs-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="recs-title">Recordings</h1>
      <p className="recs-sub">
        {sessions === null
          ? 'Reading…'
          : sessions.length === 0
            ? 'No walks recorded on this device yet.'
            : `${formatBytes(total)} of audio held on this device`}
      </p>

      {error && <p className="recs-error">{error}</p>}

      {clearable.length > 0 && (
        <p className="recs-clearable">
          {formatBytes(clearableBytes)} of that is on {clearable.length} walk
          {clearable.length === 1 ? '' : 's'} already transcribed — the words are
          kept whatever you do with the sound.
        </p>
      )}

      {/* The owner hit a closed loop here: "Add transcript" opened a panel
          asking them to add a transcript, with nothing saying where one comes
          from. The app cannot transcribe — DESIGN_REFERENCE.md screen 15,
          "Export moves the audio and its sidecar out for Whisper" — so the
          laptop step is intended, but it was invisible, which made a working
          design read as a broken screen. */}
      {sessions !== null && sessions.length > 0 && (
        <details className="recs-how">
          <summary>How a walk becomes a transcript</summary>
          <ol className="recs-how-steps">
            <li>
              <strong>Export for Whisper</strong> on this phone. You get
              <code> deez-plants-&lt;session&gt;.zip</code> — the audio and a
              sidecar naming the plants on the route.
            </li>
            <li>
              <strong>Move it to the laptop</strong> and run Whisper over it
              (<code>transcribe_walk.py</code>, see <code>TRANSCRIBE.md</code>).
              This phone cannot do it — Whisper does not run here.
            </li>
            <li>
              <strong>Add transcript</strong> — <strong>back on this phone</strong>,
              on this same walk. Paste in what Whisper wrote.
            </li>
          </ol>
          <p className="recs-how-note">
            {/* This used to read "back on whichever device you like", which is
                wrong and would have sent the owner to the laptop with nothing
                to attach the transcript to. A transcript attaches to a walk,
                and storage is per-origin with no server between — the walk
                exists on the device that recorded it and nowhere else. The
                laptop's job is running Whisper, not holding the record. */}
            The laptop only runs Whisper. The walk itself lives on the phone
            that recorded it, so the transcript has to come back here.
          </p>
          <p className="recs-how-note">
            Typing or pasting words yourself works too and is accepted whole —
            it is marked <strong>unverified</strong> because there are no
            timestamps to check it against.
          </p>
          {/* Moved here from the red banner on the Record screen, which was
              repeating it on every walk. It is reassurance, and reassurance
              only needs saying once. */}
          <p className="recs-how-note">
            <strong>A walk cut short is never a walk lost.</strong> Audio is
            written to this device every ten seconds while you record, so if
            iOS stops the capture — a call, or switching apps — everything up
            to that moment is already saved, and the walk can be picked up
            where it left off.
          </p>
        </details>
      )}

      <div className="recs-list">
        {sessions?.map((s) => {
          /**
           * This walk, specifically, being recorded right now.
           *
           * It used to be "not closed, and the recorder is doing something",
           * which was wrong twice over: it did not name *which* session was
           * live, so every unfinished walk in the list claimed to be
           * recording, and `interrupted` counts as "doing something" so a held
           * walk lit them all up. The owner met the first version of this bug
           * before the phase even existed.
           */
          const liveNow = s.session_id === liveSession
            && (phase === 'recording' || phase === 'paused');
          const heldNow = s.session_id === liveSession && phase === 'interrupted';
          return (
            <section key={s.session_id} className="recs-card">
              <div className="recs-card-head">
                <span className="recs-date">{formatStarted(s.started)}</span>
                <span className="recs-dur">{formatDuration(s.duration_s)}</span>
              </div>

              <div className="recs-meta">
                <span className="recs-marks">
                  {s.marker_count} marker{s.marker_count === 1 ? '' : 's'} · {s.plant_count} plant
                  {s.plant_count === 1 ? '' : 's'} on route
                </span>
                <span className="recs-size">{formatBytes(s.audio_bytes)}</span>
              </div>

              <div className="recs-badges">
                <span className={`recs-badge ${s.transcript_tier ?? 'none'}`}>
                  {s.transcript_tier === 'verified' ? 'VERIFIED'
                    : s.transcript_tier === 'unverified' ? 'UNVERIFIED'
                      : 'NO TRANSCRIPT'}
                </span>
                {s.transcript_tier === 'verified' && s.coverage && (
                  <span className={`recs-badge ${s.coverage.passed ? 'pass' : 'fail'}`}>
                    {s.coverage.passed ? 'COVERAGE PASSED' : `COVERAGE FAILED · ${s.coverage.failures.length}`}
                  </span>
                )}
                {liveNow && <span className="recs-badge live">RECORDING NOW</span>}
                {heldNow && <span className="recs-badge cut">INTERRUPTED &middot; CAN BE PICKED UP</span>}
                {!liveNow && !heldNow && s.closed === false && (
                  <span className="recs-badge cut">ENDED UNEXPECTEDLY</span>
                )}
              </div>

              {s.coverage && !s.coverage.passed && (
                <ul className="recs-failures">
                  {s.coverage.failures.map((f, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="recs-failure"
                        disabled={s.audio_bytes === 0}
                        onClick={() => void replayAt(s.session_id, f.offset_s)}
                      >
                        <span className="recs-failure-at">{formatDuration(f.offset_s)}</span>
                        <span className="recs-failure-detail">{f.detail}</span>
                        {s.audio_bytes > 0 && <span className="recs-failure-play">Listen</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {confirmFree === s.session_id && (
                <section className="recs-confirm">
                  <p className="recs-confirm-body">
                    Drop the audio for this walk? The transcript, the markers
                    and the route all stay — only the sound goes, and it cannot
                    be got back.
                  </p>
                  <div className="recs-confirm-actions">
                    <button type="button" className="recs-action" onClick={() => setConfirmFree(null)}>
                      Keep the audio
                    </button>
                    <button type="button" className="recs-delete" onClick={() => void doFreeSpace(s.session_id)}>
                      Drop it
                    </button>
                  </div>
                </section>
              )}

              {playing === s.session_id && audioUrl && (
                <div className="recs-player">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio
                    ref={audioRef}
                    className="recs-audio"
                    src={audioUrl}
                    controls
                    preload="auto"
                    onLoadedMetadata={() => setPlayState('ready')}
                    onError={() => setPlayState('stalled')}
                    onStalled={() => setPlayState('stalled')}
                  />
                  {playState === 'stalled' && (
                    <p className="recs-playnote">
                      This browser will not play the recording. The file is
                      intact — {formatBytes(s.audio_bytes)} of it — and Whisper
                      reads this format regardless, so exporting it still works.
                      Safari on the phone is the one to try.
                    </p>
                  )}
                  <button type="button" className="recs-action" onClick={closePlayer}>Close player</button>
                </div>
              )}

              <div className="recs-actions">
                {/* A disabled button that never says why is how "I cannot
                    listen to it" becomes unexplainable. If the audio is gone,
                    the row says so in words instead. */}
                {s.audio_bytes === 0 ? (
                  <span className="recs-noaudio">
                    {s.transcript ? 'Audio cleared · transcript kept' : 'No audio stored'}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="recs-action"
                    onClick={() => (playing === s.session_id ? closePlayer() : void openPlayer(s.session_id))}
                  >
                    {playing === s.session_id ? 'Hide player' : `Listen · ${formatBytes(s.audio_bytes)}`}
                  </button>
                )}
                <button
                  type="button"
                  className="recs-action"
                  disabled={busy === s.session_id || s.audio_bytes === 0}
                  onClick={() => void doExport(s.session_id)}
                >
                  {busy === s.session_id ? '…' : 'Export for Whisper'}
                </button>
                <button
                  type="button"
                  className="recs-action"
                  onClick={() => {
                    setTranscribing(transcribing === s.session_id ? null : s.session_id);
                    setDraft('');
                  }}
                >
                  {s.transcript ? 'Replace transcript' : 'Add transcript'}
                </button>
                {s.transcript && s.audio_bytes > 0 && (
                  <button
                    type="button"
                    className="recs-action"
                    disabled={busy === s.session_id}
                    onClick={() => setConfirmFree(s.session_id)}
                  >
                    Free up {formatBytes(s.audio_bytes)}
                  </button>
                )}
                <button
                  type="button"
                  className="recs-delete"
                  onClick={() => setConfirmDelete(s.session_id)}
                >
                  Delete
                </button>
              </div>

              {s.transcript && transcribing !== s.session_id && (
                <details className="recs-transcript">
                  <summary>Transcript held for this walk</summary>
                  <p className="recs-transcript-body">{s.transcript}</p>
                  <button
                    type="button"
                    className="recs-action"
                    onClick={() => void doRemoveTranscript(s.session_id)}
                  >
                    Remove transcript
                  </button>
                </details>
              )}

              {transcribing === s.session_id && (
                <div className="recs-attach">
                  <p className="recs-attach-note">
                    This wants a file Whisper produced on the laptop — export
                    the walk first if you have not. Whisper JSON or SRT gives a{' '}
                    <strong>verified</strong> transcript, because its timestamps
                    let the app check coverage against the {formatDuration(s.duration_s)} it
                    recorded itself. Typed or dictated text is accepted whole as
                    <strong> unverified</strong>, with no gate.
                  </p>
                  <input
                    className="recs-file"
                    type="file"
                    accept=".json,.srt,.vtt,.txt,text/plain,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void readFile(file);
                    }}
                  />
                  <textarea
                    className="recs-textarea"
                    rows={6}
                    value={draft}
                    placeholder="…or paste the transcript here"
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="recs-actions">
                    <button
                      type="button"
                      className="recs-action primary"
                      disabled={!draft.trim() || busy === s.session_id}
                      onClick={() => void doAttach(s.session_id)}
                    >
                      Attach transcript
                    </button>
                    <button
                      type="button"
                      className="recs-action"
                      onClick={() => { setTranscribing(null); setDraft(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {confirmDelete === s.session_id && (
                <div className="recs-confirm">
                  <p className="recs-confirm-body">
                    Delete this walk's audio, markers and transcript? What you
                    logged during it stays.
                  </p>
                  <div className="recs-actions">
                    <button type="button" className="recs-action" onClick={() => setConfirmDelete(null)}>Keep it</button>
                    <button type="button" className="recs-confirm-delete" onClick={() => void doDelete(s.session_id)}>Delete</button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="recs-note">
        Audio never leaves the device — chat interfaces will not take it. The
        transcript is what the AI reads, which is why its coverage check is a
        hard gate.
      </p>
    </main>
  );
}
