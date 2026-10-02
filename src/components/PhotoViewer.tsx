import { useCallback, useEffect, useState } from 'react';
import type { ISODate, MediaId } from '../types/ids';
import type { MediaLabel } from '../types/plant';
import { formatDayMonthYear } from '../lib/dates';
import { openDeezPlants } from '../db/schema';
import './PhotoViewer.css';

/**
 * One photograph, full screen.
 *
 * **The gallery had thumbnails and nothing else.** The owner, 2026-10-01:
 * "current thumbnails are not enough" — which is the whole point of the
 * photographs, since the thing being judged is a leaf edge or the surface of
 * the soil and a tile is too small to see either. Every photo decision this
 * app asks for — hero, compare, send to the AI — was being made from an image
 * too small to make it from.
 *
 * It reads the **full-resolution blob** out of `media`, not the thumbnail the
 * grid holds. That is deliberate and it is why the blob is loaded one at a
 * time and its object URL revoked on the way out: the full images are the
 * megabytes in this app, and holding twenty of them open is how a gallery
 * becomes a slow, memory-hungry screen. The same reasoning as lazy thumbnails.
 *
 * **No fixed-height frame.** `DESIGN_REFERENCE.md` section 6's lessons already
 * learned once: a photo in a container mismatched to its real aspect ratio
 * leaves a pale band. The owner's photographs are 24 square, one 4:3 and one
 * 3:4, so the frame has to hold all three — `object-fit: contain` inside the
 * screen, and nothing told what shape to be.
 */

export interface ViewerPhoto {
  media_id: MediaId;
  date: ISODate;
  label: MediaLabel | null;
}

export interface PhotoViewerProps {
  photos: readonly ViewerPhoto[];
  /** Index into `photos` of the one on screen. */
  index: number;
  onIndex: (index: number) => void;
  /** Shown in the caption, so a photo is never anonymous on screen. */
  plantName: string;
  onClose: () => void;
}

const LABEL_TEXT: Record<MediaLabel, string> = {
  whole: 'Whole plant',
  leaf: 'Leaf',
  soil: 'Soil',
  roots: 'Roots',
};

/** How far a finger must travel before it counts as a swipe rather than a tap
    or a wobble. Low enough to feel responsive, high enough that pinching to
    zoom does not throw you onto the next photograph. */
const SWIPE_MIN_PX = 48;

export function PhotoViewer({ photos, index, onIndex, plantName, onClose }: PhotoViewerProps) {
  /**
   * The loaded image, carrying the id it belongs to.
   *
   * Paired rather than held as a bare url so that swiping to the next
   * photograph reads as "not loaded yet" during render, instead of needing an
   * effect to blank the old one first. A bare url would show the previous
   * photograph under the new caption for a frame.
   */
  const [shown, setShown] = useState<{ media_id: MediaId; url: string | null } | null>(null);
  const current = photos[index];
  const ready = shown && current && shown.media_id === current.media_id;

  /** The full image for whichever photo is on screen, and only that one. */
  useEffect(() => {
    if (!current) return;
    let live = true;
    let made: string | null = null;
    void (async () => {
      try {
        const db = await openDeezPlants();
        const record = await db.get('media', current.media_id);
        if (!live) return;
        // `url: null` is "looked, and it is not here" — distinct from not
        // having looked yet, which is this pair being absent or stale.
        if (!record) { setShown({ media_id: current.media_id, url: null }); return; }
        made = URL.createObjectURL(record.blob);
        setShown({ media_id: current.media_id, url: made });
      } catch {
        if (live) setShown({ media_id: current.media_id, url: null });
      }
    })();
    return () => {
      live = false;
      // The whole reason this is one at a time. An object URL holds its blob
      // in memory until it is revoked.
      if (made) URL.revokeObjectURL(made);
    };
  }, [current]);

  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < photos.length) onIndex(next);
  }, [index, photos.length, onIndex]);

  /** The laptop half. On the phone it is swipe and the close button. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  /**
   * The body must not scroll behind a full-screen overlay — on iOS that is
   * what makes an overlay feel like a layer of the page rather than a screen.
   */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  if (!current) return null;

  const position = `${index + 1} of ${photos.length}`;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${plantName}, photo ${position}`}>
      <div className="viewer-bar">
        <span className="viewer-where">{position}</span>
        <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">Done</button>
      </div>

      <div
        className="viewer-stage"
        onTouchStart={(e) => {
          // One finger only. Two fingers is a pinch, and treating the end of a
          // pinch as a swipe is how a zoomed photo jumps to the next one.
          if (e.touches.length !== 1) { setTouchStart(null); return; }
          setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        }}
        onTouchEnd={(e) => {
          if (!touchStart || e.changedTouches.length !== 1) { setTouchStart(null); return; }
          const dx = e.changedTouches[0].clientX - touchStart.x;
          const dy = e.changedTouches[0].clientY - touchStart.y;
          setTouchStart(null);
          // Mostly sideways, or it was a scroll attempt.
          if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
          go(dx < 0 ? 1 : -1);
        }}
      >
        {ready && shown.url && (
          <img className="viewer-image" src={shown.url} alt={`${plantName}, ${formatDayMonthYear(current.date)}`} />
        )}
        {!ready && <p className="viewer-note">Loading…</p>}
        {ready && !shown.url && (
          <p className="viewer-note">
            This photograph is no longer stored on this device. The entry
            recording that you took it is still in your history.
          </p>
        )}
      </div>

      {/* Hidden from a touch screen by CSS, where swiping is the gesture, and
          present on a laptop where there is nothing to swipe with. */}
      <button
        type="button"
        className="viewer-step prev"
        onClick={() => go(-1)}
        disabled={index === 0}
        aria-label="Previous photo"
      >‹</button>
      <button
        type="button"
        className="viewer-step next"
        onClick={() => go(1)}
        disabled={index === photos.length - 1}
        aria-label="Next photo"
      >›</button>

      <div className="viewer-caption">
        <span className="viewer-plant">{plantName}</span>
        <span className="viewer-meta">
          {formatDayMonthYear(current.date)}
          {current.label && ` · ${LABEL_TEXT[current.label]}`}
        </span>
      </div>
    </div>
  );
}
