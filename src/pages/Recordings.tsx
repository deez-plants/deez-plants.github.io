import { useEffect, useState, useSyncExternalStore } from 'react';
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
import { clearFinished, deleteSession, formatDuration, getPhase, subscribe } from '../capture/recording';
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
  const [transcribing, setTranscribing] = useState<SessionId | null>(null);
  const [draft, setDraft] = useState('');

  // A walk being recorded right now writes its record and its audio as it
  // goes, so it is already in this list. Re-read when the recorder's phase
  // changes so ending one lands here without a manual refresh.
  const phase = useSyncExternalStore(subscribe, getPhase, getPhase);

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

  return (
    <main className="recs">
      <button type="button" className="recs-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="recs-title">Recordings</h1>
      <p className="recs-sub">
        {sessions === null
          ? 'Reading…'
          : sessions.length === 0
            ? 'No walks recorded on this device yet.'
            : `${formatBytes(total)} of audio held on this device`}
      </p>

      {error && <p className="recs-error">{error}</p>}

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
              <strong>Add transcript</strong>, back on whichever device you
              like, and give it the Whisper file.
            </li>
          </ol>
          <p className="recs-how-note">
            Typing or pasting words yourself works too and is accepted whole —
            it is marked <strong>unverified</strong> because there are no
            timestamps to check it against.
          </p>
        </details>
      )}

      <div className="recs-list">
        {sessions?.map((s) => {
          const liveNow = !s.closed && phase !== 'ready' && phase !== 'finished';
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
                {!liveNow && s.closed === false && (
                  <span className="recs-badge cut">ENDED UNEXPECTEDLY</span>
                )}
              </div>

              {s.coverage && !s.coverage.passed && (
                <ul className="recs-failures">
                  {s.coverage.failures.map((f, i) => (
                    <li key={i}>
                      <span className="recs-failure-at">{formatDuration(f.offset_s)}</span>
                      <span className="recs-failure-detail">{f.detail}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="recs-actions">
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
