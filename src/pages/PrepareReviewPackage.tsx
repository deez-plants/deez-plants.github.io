import { useEffect, useState } from 'react';
import type { DerivedState } from '../types/derived';
import type { ISODate } from '../types/ids';
import { openDeezPlants } from '../db/schema';
import { buildReviewPackage, previewReviewPackage, saveBlob, type PackagePreview } from '../package/export';
import './PrepareReviewPackage.css';

/**
 * DESIGN_REFERENCE.md screen 19.
 *
 * The four rows report what is actually going in, walks included: how many
 * were recorded since the last package and how many of those have a
 * transcript. A walk with no transcript still ships — the AI is told it
 * exists and that it holds no words yet, which is a fact about the package
 * rather than an absence to hide. The mock's separate media checkboxes are
 * still left out: section 7's review set is the four text files, and photos
 * go in only when flagged, which has no screen yet.
 */

export interface PrepareReviewPackageProps {
  state: DerivedState;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
}

type Status =
  | { kind: 'loading' }
  | ({ kind: 'ready' } & PackagePreview)
  | { kind: 'building' }
  /** The zip is made and the Share sheet has opened. Nothing is marked sent
      yet — see `confirmSent`. */
  | { kind: 'asking'; package_id: string; filename: string; confirmSent: () => Promise<void> }
  | { kind: 'done'; package_id: string; filename: string }
  | { kind: 'error'; message: string };

export default function PrepareReviewPackage({ state, as_of, backLabel, onBack }: PrepareReviewPackageProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  /** Recount what a package would carry. Nothing here writes. */
  const loadPreview = async () => {
    try {
      const db = await openDeezPlants();
      setStatus({ kind: 'ready', ...await previewReviewPackage(db, state) });
    } catch (e: unknown) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

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
      // Not `done`. The Share sheet reports nothing back, so whether this
      // package left the device is a question only the owner can answer.
      setStatus({
        kind: 'asking',
        package_id: pkg.package_id,
        filename: pkg.filename,
        confirmSent: pkg.confirmSent,
      });
    } catch (e: unknown) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="prep">
      <button type="button" className="screen-back prep-back" onClick={onBack}>‹ {backLabel}</button>

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
            <span className={status.kind === 'ready' && status.transcribed_count ? 'prep-file-detail' : 'prep-file-detail dim'}>
              {status.kind !== 'ready' ? 'Walks since last package'
                : status.session_count === 0 ? 'No walks recorded since the last package'
                  : status.transcribed_count === 0
                    ? `${status.session_count} walk${status.session_count === 1 ? '' : 's'}, none transcribed yet`
                    : `${status.transcribed_count} of ${status.session_count} walk${status.session_count === 1 ? '' : 's'} transcribed · ${status.tier}`}
            </span>
          </li>
          <li>
            <span className="prep-file-name">markers.json</span>
            <span className={status.kind === 'ready' && status.marker_count ? 'prep-file-detail' : 'prep-file-detail dim'}>
              {status.kind !== 'ready' ? 'Marker tracks and screen log'
                : status.session_count === 0 ? 'No walks recorded since the last package'
                  : `${status.marker_count} marker${status.marker_count === 1 ? '' : 's'} across ${status.session_count} walk${status.session_count === 1 ? '' : 's'}, plus the screen log`}
            </span>
          </li>
        </ul>
      )}

      {/* The count of transcribed walks was already on the list above; what
          was missing is what it MEANS. A walk with no transcript is a walk
          the AI cannot hear, and the package's tier is the weakest transcript
          in it — one untranscribed walk makes the whole thing unverified. */}
      {status.kind === 'ready' && status.session_count > 0
        && status.transcribed_count < status.session_count && (
        <p className="prep-warn">
          {status.session_count - status.transcribed_count} of {status.session_count}{' '}
          walk{status.session_count === 1 ? '' : 's'} {status.session_count - status.transcribed_count === 1 ? 'has' : 'have'}{' '}
          no transcript. The AI gets the markers but not a word you said on{' '}
          {status.session_count - status.transcribed_count === 1 ? 'it' : 'them'} — and one
          untranscribed walk makes the whole package <strong>unverified</strong>.
          Transcribe first if you want it read properly.
        </p>
      )}

      {status.kind === 'ready' && status.session_count > 0
        && status.transcribed_count === status.session_count && (
        <p className="prep-ok">
          All {status.session_count} walk{status.session_count === 1 ? '' : 's'} transcribed.
          The AI reads your own words, attributed to the plant whose page was open.
        </p>
      )}

      {/* The app cannot see whether a Share sheet succeeded, so it asks. Until
          Yes, nothing here counts as sent and the next package carries it all
          again. See `confirmSent`. */}
      {status.kind === 'asking' && (
        <div className="prep-done">
          <p>Did <span className="prep-filename">{status.filename}</span> save?</p>
          <div className="prep-confirm">
            <button
              type="button"
              className="prep-confirm-yes"
              onClick={() => void (async () => {
                await status.confirmSent();
                setStatus({ kind: 'done', package_id: status.package_id, filename: status.filename });
              })()}
            >
              Yes, saved
            </button>
            <button
              type="button"
              className="prep-confirm-no"
              onClick={() => void loadPreview()}
            >
              No
            </button>
          </div>
        </div>
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
