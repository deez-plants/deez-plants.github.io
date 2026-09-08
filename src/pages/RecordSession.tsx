import { useState, useSyncExternalStore } from 'react';
import type { DerivedState } from '../types/derived';
import type { ISODate, PlantId } from '../types/ids';
import {
  clearFinished,
  discardSession,
  endSession,
  formatDuration,
  getSnapshot,
  pauseSession,
  recordingSupported,
  resumeSession,
  retagMarker,
  startSession,
  subscribe,
  wakeLockSupported,
} from '../capture/recording';
import './RecordSession.css';

/**
 * DESIGN_REFERENCE.md screen 03 — the walk recorder. One long recording,
 * pauses free, markers placed as you reach each plant.
 *
 * The recorder itself lives in `capture/recording.ts` as a module singleton,
 * not in this component's state: a walk has to survive navigating away to a
 * plant, logging care and taking a photo — that navigation is exactly what
 * writes the markers — so this screen subscribes to the recorder rather than
 * owning it, and unmounting it does not end the walk.
 *
 * **Two deliberate deviations from the mock.** Its record panel is always in
 * the RECORDING state with a Pause button beside "Delete recording"; a walk
 * that has not started has nothing to pause and nothing to delete, so the
 * controls here follow the four states the reference's own "States" line
 * names — ready, recording, paused, and a finished session with a marker
 * count — rather than showing a dead pair of buttons on a fresh screen.
 *
 * And it offers a plain "End session" above the mock's "End session and
 * prepare package". Ending straight into the package screen is the wrong
 * default for the normal walk: the transcript has not been made yet (the
 * laptop does that, section 6), so a package built at that moment carries a
 * walk with no words in it. The mock's combined button is kept for when you
 * do want both; it is simply not the only way out. Without a plain end, the
 * finished state the reference names would be unreachable.
 */

export interface RecordSessionProps {
  state: DerivedState;
  as_of: ISODate;
  backLabel: string | null;
  onBack: () => void;
  onPreparePackage: () => void;
  onRecordings: () => void;
}

const STATE_WORD = {
  ready: 'READY',
  starting: 'STARTING',
  recording: 'RECORDING',
  paused: 'PAUSED',
  saving: 'SAVING',
  finished: 'SESSION ENDED',
} as const;

export default function RecordSession({
  state, as_of, backLabel, onBack, onPreparePackage, onRecordings,
}: RecordSessionProps) {
  const rec = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retagging, setRetagging] = useState<number | null>(null);

  const live = rec.phase === 'recording' || rec.phase === 'paused';
  const busy = rec.phase === 'starting' || rec.phase === 'saving';
  const supported = recordingSupported();

  const plantName = (plant_id?: string) =>
    (plant_id && state.plants[plant_id as PlantId]?.name) || plant_id || '—';

  // Newest first, and only the ones worth reading back: `plant_open` is the
  // route, and care and photos are what happened along it. `session_start`
  // and `session_end` are bookkeeping the sidecar carries but the walker
  // does not need to see.
  const listed = rec.markers
    .map((marker, index) => ({ marker, index }))
    .filter(({ marker }) => marker.type !== 'session_start' && marker.type !== 'session_end')
    .reverse();

  const routePlants = new Set(
    rec.markers.filter((m) => m.type === 'plant_open').map((m) => m.plant_id),
  ).size;

  const endAndPrepare = async () => {
    await endSession();
    onPreparePackage();
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    await discardSession();
  };

  return (
    <main className="rec">
      {backLabel && <button type="button" className="rec-back" onClick={onBack}>‹ {backLabel}</button>}

      <h1 className="rec-title">Inspection session</h1>

      <section className={`rec-panel ${rec.phase}`}>
        <div className="rec-state">
          <span className={`rec-dot ${rec.phase}`} aria-hidden="true" />
          <span className="rec-state-word">{STATE_WORD[rec.phase]}</span>
          {rec.session_id && <span className="rec-session-id">{rec.session_id}</span>}
        </div>
        <div className="rec-time">{formatDuration(rec.elapsed_s)}</div>
        <p className="rec-panel-note">
          Audio and photos are saved as captured, whether or not transcription
          runs later.
        </p>
      </section>

      {rec.error && <p className="rec-error">{rec.error}</p>}

      {!supported && (
        <p className="rec-error">
          This browser has no MediaRecorder. Recording needs Safari on the
          iPhone, or Chrome or Firefox on a laptop.
        </p>
      )}

      {rec.phase === 'ready' && (
        <button
          type="button"
          className="rec-primary"
          disabled={!supported}
          onClick={() => void startSession(as_of)}
        >
          Start recording
        </button>
      )}

      {busy && <button type="button" className="rec-primary" disabled>Working…</button>}

      {live && (
        <div className="rec-controls">
          <button
            type="button"
            className="rec-primary"
            onClick={() => (rec.phase === 'recording' ? pauseSession() : void resumeSession())}
          >
            {rec.phase === 'recording' ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="rec-delete" onClick={() => setConfirmDelete(true)}>
            Delete recording
          </button>
        </div>
      )}

      {confirmDelete && (
        <section className="rec-confirm">
          <h2 className="rec-confirm-title">Delete this recording?</h2>
          <p className="rec-confirm-body">
            The audio and its markers go for good. Anything you logged during
            the walk — care, ratings, photos — stays: those are the record, the
            audio was only the account of it.
          </p>
          <div className="rec-confirm-actions">
            <button type="button" className="rec-keep" onClick={() => setConfirmDelete(false)}>Keep it</button>
            <button type="button" className="rec-confirm-delete" onClick={() => void doDelete()}>Delete</button>
          </div>
        </section>
      )}

      {live && (
        <>
          <button type="button" className="rec-secondary" onClick={() => void endSession()}>
            End session
          </button>
          <button type="button" className="rec-secondary" onClick={() => void endAndPrepare()}>
            End session and prepare package
          </button>
        </>
      )}

      {rec.phase === 'finished' && rec.saved && (
        <section className="rec-done">
          <h2 className="rec-done-title">Session saved</h2>
          <p className="rec-done-body">
            {formatDuration(rec.saved.duration_s)} of audio · {rec.saved.marker_count} marker
            {rec.saved.marker_count === 1 ? '' : 's'} · held on this device as {rec.saved.session_id}.
            Transcription runs on the laptop — export it from Recordings.
          </p>
          <div className="rec-done-actions">
            <button type="button" className="rec-secondary" onClick={onRecordings}>Recordings ›</button>
            <button type="button" className="rec-secondary" onClick={() => clearFinished()}>Start another</button>
          </div>
        </section>
      )}

      {live && (
        <p className="rec-warning">
          Keep this app in front. Switching apps mid-walk can end the capture —
          iOS decides that, not the app. The screen is held awake while a walk
          is live{wakeLockSupported() ? '' : ', though this browser has no wake lock so it may still dim'}.
        </p>
      )}

      <div className="rec-route-head">
        <h2 className="rec-route-title">Detected on route</h2>
        <span className="rec-route-count">{routePlants} plant{routePlants === 1 ? '' : 's'}</span>
      </div>
      <p className="rec-route-note">
        Markers are placed automatically as you reach each plant. Tap one to
        correct it — the time stays, only which plant it belongs to changes.
      </p>

      {listed.length === 0 && (
        <p className="rec-route-empty">
          {live
            ? 'Nothing yet. Open a plant and a marker lands here.'
            : 'Markers appear here once a walk is running.'}
        </p>
      )}

      <div className="rec-markers">
        {listed.map(({ marker, index }) => (
          <div key={`${index}-${marker.offset_s}`} className="rec-marker-wrap">
            <button
              type="button"
              className="rec-marker"
              disabled={marker.type !== 'plant_open' || !live}
              onClick={() => setRetagging(retagging === index ? null : index)}
            >
              <span className="rec-marker-stamp">{formatDuration(marker.offset_s)}</span>
              <span className="rec-marker-name">{plantName(marker.plant_id)}</span>
              <span className={`rec-marker-kind ${marker.type}`}>
                {marker.type === 'plant_open' ? (marker.manual ? 'MANUAL' : 'AUTO')
                  : marker.type === 'photo' ? 'PHOTO' : 'CARE'}
              </span>
            </button>
            {retagging === index && (
              <div className="rec-retag">
                <p className="rec-retag-note">Which plant was this?</p>
                <div className="rec-retag-chips">
                  {state.order
                    .map((id) => state.plants[id])
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <button
                        key={p.plant_id}
                        type="button"
                        className={p.plant_id === marker.plant_id ? 'rec-chip on' : 'rec-chip'}
                        onClick={() => { retagMarker(index, p.plant_id); setRetagging(null); }}
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="rec-foot">
        The phone records; the laptop transcribes. Audio never leaves the
        device on its own — you carry it across, Whisper runs there, and the
        transcript comes back.
      </p>

      {!live && rec.phase !== 'finished' && (
        <button type="button" className="rec-secondary" onClick={onRecordings}>Recordings ›</button>
      )}
    </main>
  );
}
