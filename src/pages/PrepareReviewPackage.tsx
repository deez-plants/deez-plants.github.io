import { useEffect, useState } from 'react';
import type { DerivedState } from '../types/derived';
import type { ISODate, MediaId, PackageId } from '../types/ids';
import { openDeezPlants } from '../db/schema';
import {
  buildReviewPackage, discardBuiltPackage, photosSinceLastPackage, previewReviewPackage,
  saveBlob, type PackagePreview, type PhotoChoice,
} from '../package/export';
import { FLAG_CAP, readFlags, setFlags } from '../package/reviewFlags';
import { ensureThumbs } from '../boot';
import { formatDayMonth } from '../lib/dates';
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
  /** They answered no. The build is thrown away and nothing was used up. */
  | { kind: 'not-saved' }
  | { kind: 'done'; package_id: string; filename: string }
  | { kind: 'error'; message: string };

export default function PrepareReviewPackage({ state, as_of, backLabel, onBack }: PrepareReviewPackageProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  /**
   * The photographs this package could carry, and which of them are ticked.
   *
   * **The owner, 2026-10-01: "this is a HUGE hassle."** Flagging was built as
   * the minimum that made a photo travel at all — one button per photograph,
   * on each plant's own gallery — and the screen that should simply ask never
   * got made. So choosing eight photographs meant visiting eight plants.
   *
   * Everything taken since the last confirmed package, newest first, **ticked
   * on arrival**. These are the owner's own photographs going out, not AI
   * changes coming in, so rule 4's "rows arrive unselected" does not apply
   * here — that rule is about what it takes to accept someone else's work.
   *
   * Selection is held here and written only when the package is built, so
   * opening this screen to look at it changes nothing.
   */
  const [choices, setChoices] = useState<PhotoChoice[] | null>(null);
  const [picked, setPicked] = useState<Set<MediaId>>(new Set());
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [photosOpen, setPhotosOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const db = await openDeezPlants();
      const [list, already] = await Promise.all([photosSinceLastPackage(db), readFlags(db)]);
      if (!live) return;
      setChoices(list);
      // Ticked on arrival, newest first, up to the cap. Anything already
      // flagged from a plant's own gallery is in the same list and so is
      // already ticked — `already` is read only so that a flag set elsewhere
      // can never be silently dropped by this screen's cap.
      const flagged = new Set(already);
      const ordered = [...list].sort((a, b) =>
        Number(flagged.has(b.media_id)) - Number(flagged.has(a.media_id)));
      setPicked(new Set(ordered.slice(0, FLAG_CAP).map((c) => c.media_id)));
      setThumbs(await ensureThumbs(list.map((c) => c.media_id)));
    })();
    return () => { live = false; };
  }, []);

  const toggle = (media_id: MediaId) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(media_id)) next.delete(media_id);
      else if (next.size < FLAG_CAP) next.add(media_id);
      return next;
    });
  };

  /** Newest first, up to the cap — and the screen says when it stopped. */
  const selectAll = () => {
    setPicked(new Set((choices ?? []).slice(0, FLAG_CAP).map((c) => c.media_id)));
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
      // The picker's answer, written now rather than as it was tapped — so
      // looking at this screen and leaving changes nothing about the record.
      await setFlags(db, [...picked]);
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

      {(status.kind === 'ready' || status.kind === 'building' || status.kind === 'asking' || status.kind === 'done') && (
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
          {/* Only when there are some. An empty row here would read as a
              missing feature rather than an unused one. */}
          {/* Reads the picker below rather than the stored flags, so the file
              list and the choice on screen can never disagree. */}
          {picked.size > 0 && (
            <li>
              <span className="prep-file-name">media/</span>
              <span className="prep-file-detail">
                {picked.size} photo{picked.size === 1 ? '' : 's'},
                named so the AI knows which plant it is looking at
              </span>
            </li>
          )}
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

      {/* Choosing this round's photographs, in one place. See the note on
          `choices` for why this screen exists at all. */}
      {(status.kind === 'ready' || status.kind === 'building') && choices !== null && choices.length > 0 && (
        <section className="prep-photos">
          <button
            type="button"
            className="prep-photos-head"
            aria-expanded={photosOpen}
            onClick={() => setPhotosOpen(!photosOpen)}
          >
            <span className="prep-photos-title">
              Photos for the AI
              <span className="prep-photos-count">
                {picked.size} of {choices.length} chosen
              </span>
            </span>
            <span className="prep-photos-mark">{photosOpen ? '−' : '+'}</span>
          </button>

          {photosOpen && (
            <>
              <p className="prep-photos-note">
                Everything photographed since your last package, newest first.
                They travel named, so the AI knows which plant it is looking at.
                {choices.length > FLAG_CAP && (
                  <> One package carries {FLAG_CAP}, so the newest {FLAG_CAP} are
                    chosen and the other {choices.length - FLAG_CAP} are not —
                    untick one to make room.
                  </>
                )}
              </p>

              <div className="prep-photos-bulk">
                <button type="button" onClick={selectAll}>
                  Select {choices.length > FLAG_CAP ? `newest ${FLAG_CAP}` : 'all'}
                </button>
                <button type="button" onClick={() => setPicked(new Set())}>Clear</button>
              </div>

              <div className="prep-photos-grid">
                {choices.map((c) => {
                  const on = picked.has(c.media_id);
                  const url = thumbs.get(c.media_id);
                  return (
                    <button
                      key={c.media_id}
                      type="button"
                      className={on ? 'prep-photo on' : 'prep-photo'}
                      aria-pressed={on}
                      onClick={() => toggle(c.media_id)}
                    >
                      {url
                        ? <img className="prep-photo-image" src={url} alt="" />
                        : <span className="prep-photo-image empty" />}
                      <span className="prep-photo-meta">
                        {c.plant_id ? state.plants[c.plant_id]?.name ?? c.plant_id : 'Collection'}
                      </span>
                      <span className="prep-photo-date">{formatDayMonth(c.date)}</span>
                      {on && <span className="prep-photo-tick">✓</span>}
                    </button>
                  );
                })}
              </div>

              {picked.size >= FLAG_CAP && (
                <p className="prep-photos-note">
                  That is the {FLAG_CAP} one package carries. Untick one to choose another.
                </p>
              )}
            </>
          )}
        </section>
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
              onClick={() => void (async () => {
                // An explicit no is an answer, so the build it names is thrown
                // away rather than left in the registry for the owner to tidy
                // up later. Nothing is lost: an unconfirmed package consumes
                // no entries and no walks, so Build package again is free.
                try {
                  const db = await openDeezPlants();
                  await discardBuiltPackage(db, status.package_id as PackageId);
                } catch {
                  // A build that cannot be discarded is still visible on the
                  // Handoff log as NOT CONFIRMED SENT, with Discard beside it.
                }
                setStatus({ kind: 'not-saved' });
              })()}
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

      {status.kind === 'not-saved' && (
        <div className="prep-done">
          <p>
            Nothing was marked as sent, and that build has been thrown away.
            Every entry and every walk it held is still waiting — build again
            when you're ready.
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
        {status.kind === 'building' ? 'Building…'
          : status.kind === 'done' || status.kind === 'not-saved' ? 'Build again'
            : 'Build package'}
      </button>
    </main>
  );
}
