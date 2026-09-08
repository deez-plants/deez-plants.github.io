import { useEffect, useState } from 'react';
import type { DerivedState } from '../types/derived';
import type { ISODate } from '../types/ids';
import { openDeezPlants } from '../db/schema';
import { buildReviewPackage, previewReviewPackage, saveBlob } from '../package/export';
import './PrepareReviewPackage.css';

/**
 * DESIGN_REFERENCE.md screen 19. The mock's own sessions/media rows are left
 * out here rather than shown as fake checkboxes — Capture isn't built, so
 * there is nothing real to check off yet (same principle as the empty bars
 * on Adherence/Health history: derive, never invent).
 */

export interface PrepareReviewPackageProps {
  state: DerivedState;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; plant_count: number; event_count: number }
  | { kind: 'building' }
  | { kind: 'done'; package_id: string; filename: string }
  | { kind: 'error'; message: string };

export default function PrepareReviewPackage({ state, as_of, backLabel, onBack }: PrepareReviewPackageProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = await openDeezPlants();
        const counts = await previewReviewPackage(db, state);
        if (live) setStatus({ kind: 'ready', ...counts });
      } catch (e: unknown) {
        if (live) setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [state]);

  const build = async () => {
    setStatus({ kind: 'building' });
    try {
      const db = await openDeezPlants();
      const pkg = await buildReviewPackage(db, state, as_of);
      saveBlob(pkg.blob, pkg.filename);
      setStatus({ kind: 'done', package_id: pkg.package_id, filename: pkg.filename });
    } catch (e: unknown) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="prep">
      <button type="button" className="prep-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="prep-title">Prepare review package</h1>
      <p className="prep-sub">
        One ZIP to hand to the AI. Nothing leaves the phone until you tap
        download.
      </p>

      {status.kind === 'loading' && <p className="prep-note">Counting what's changed…</p>}

      {(status.kind === 'ready' || status.kind === 'building' || status.kind === 'done') && (
        <ul className="prep-files">
          <li>
            <span className="prep-file-name">manifest.json</span>
            <span className="prep-file-detail">
              {status.kind === 'ready' || status.kind === 'building'
                ? `Registry state, ${status.kind === 'ready' ? status.plant_count : '…'} plants`
                : 'Registry state'}
            </span>
          </li>
          <li>
            <span className="prep-file-name">events.json</span>
            <span className="prep-file-detail">
              {status.kind === 'ready' ? `${status.event_count} events since last package` : 'Events since last package'}
            </span>
          </li>
          <li>
            <span className="prep-file-name">transcript.txt</span>
            <span className="prep-file-detail dim">No recording sessions on this device yet</span>
          </li>
          <li>
            <span className="prep-file-name">markers.json</span>
            <span className="prep-file-detail dim">No recording sessions on this device yet</span>
          </li>
        </ul>
      )}

      {status.kind === 'done' && (
        <div className="prep-done">
          <p>
            Saved as <span className="prep-filename">{status.filename}</span>.
            Drop it into a chat with the AI when you're ready — it cites{' '}
            <span className="prep-filename">{status.package_id}</span>, so the
            update file it returns can only be applied once, to this package.
          </p>
        </div>
      )}

      {status.kind === 'error' && <p className="prep-error">{status.message}</p>}

      <button
        type="button"
        className="prep-build"
        disabled={status.kind === 'loading' || status.kind === 'building'}
        onClick={() => void build()}
      >
        {status.kind === 'building' ? 'Building…' : status.kind === 'done' ? 'Build again' : 'Build package'}
      </button>
    </main>
  );
}
