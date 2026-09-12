import { useEffect, useMemo, useState } from 'react';
import type { ISODate, MediaId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedPlant } from '../types/derived';
import type { MediaLabel } from '../types/plant';
import { formatDayMonthYear } from '../lib/dates';
import { openDeezPlants } from '../db/schema';
import { ensureThumbs } from '../boot';
import { editPlantFields } from '../care/editField';
import { PhotoCaptureButton } from '../components/PhotoCaptureButton';
import './PhotosPage.css';

/**
 * DESIGN_REFERENCE.md screen 13: the gallery for one plant, grouped by date.
 * No `PlantChrome` here — unlike History/Calendar/More about/Info, the
 * mock's own screenshot for this screen shows a plain "‹ Home" back button,
 * not the Prev/Next strip, so this one screen intentionally doesn't match
 * the others.
 *
 * The gallery lists photos off the raw `events` log directly, the same way
 * History/Entries already do, rather than through `plant.photos` (the
 * committed, pending-filtered view) — so a photo you just took shows up
 * here immediately, even though `Photo` is a `CareEvent` like `Water` and
 * won't reach the *committed* record until the next Update. Hero selection
 * is the opposite on purpose: `plant.hero` only ever reflects the committed
 * value, so choosing a new hero is pending like any other Edit until
 * Update — seeing your own photo is immediate feedback, but which one is
 * *the* hero is a real record change, not a glance.
 */

export interface PhotosPageProps {
  plant: DerivedPlant;
  events: readonly StoredEvent[];
  /** media_id -> object URL. */
  thumbs: Map<string, string>;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}

const LABEL_TEXT: Record<MediaLabel, string> = {
  whole: 'Whole plant', leaf: 'Leaf', soil: 'Soil', roots: 'Roots',
};

interface Entry {
  media_id: MediaId;
  date: ISODate;
  label: MediaLabel | null;
}

export default function PhotosPage({ plant, events, thumbs, as_of, backLabel, onBack, onChanged }: PhotosPageProps) {
  const [busyHero, setBusyHero] = useState<MediaId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const byMedia = new Map<MediaId, Entry>();
    for (const e of events) {
      if (e.plant_id !== plant.plant_id || e.type === 'Edit' || !e.media) continue;
      e.media.forEach((media_id, i) => {
        byMedia.set(media_id, { media_id, date: e.date, label: e.media_labels?.[i] ?? null });
      });
    }
    // Newest first, following `plant.photos`' own event order reversed.
    const order = new Map(plant.photos.map((id, i) => [id, i]));
    return [...byMedia.values()].sort((a, b) => (order.get(b.media_id) ?? -1) - (order.get(a.media_id) ?? -1));
  }, [events, plant.plant_id, plant.photos]);

  // Boot only loads each plant's hero, so a gallery has to fetch its own
  // thumbnails. `ensureThumbs` fills the same map every screen already holds;
  // the counter is here to re-render once it has, since mutating a Map does
  // not.
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    let live = true;
    void ensureThumbs(entries.map((e) => e.media_id)).then(() => {
      if (live) setLoaded((n) => n + 1);
    });
    return () => { live = false; };
  }, [entries]);

  const groups = useMemo(() => {
    const map = new Map<ISODate, Entry[]>();
    for (const e of entries) {
      const list = map.get(e.date);
      if (list) list.push(e); else map.set(e.date, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  const setHero = async (media_id: MediaId) => {
    setBusyHero(media_id);
    setError(null);
    try {
      const db = await openDeezPlants();
      await editPlantFields(db, plant.plant_id, [{ field: 'hero_media', from: plant.hero, to: media_id }], as_of);
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyHero(null);
    }
  };

  return (
    <main className="photos">
      <button type="button" className="photos-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="photos-title">{plant.name}</h1>
      <p className="photos-sub">{entries.length} photo{entries.length === 1 ? '' : 's'} · {groups.length} session{groups.length === 1 ? '' : 's'}</p>

      <PhotoCaptureButton
        plant_id={plant.plant_id}
        plant_name={plant.name}
        as_of={as_of}
        className="photos-take"
        label="Take photo"
        onSaved={() => void onChanged()}
      />

      {error && <p className="photos-error">{error}</p>}

      {groups.length === 0 && <p className="photos-empty">Nothing captured for this plant yet.</p>}

      {groups.map(([date, list]) => (
        <section key={date} className="photos-group">
          <div className="photos-group-head">
            <span className="photos-group-date">{formatDayMonthYear(date)}</span>
            <span className="photos-group-count">{list.length} photo{list.length === 1 ? '' : 's'}</span>
          </div>
          <div className="photos-grid">
            {list.map((e) => {
              const isHero = e.media_id === plant.hero;
              // `loaded` is read so this re-renders when the thumbnails arrive.
              const url = loaded >= 0 ? thumbs.get(e.media_id) : undefined;
              return (
                <div key={e.media_id} className={isHero ? 'photos-tile hero' : 'photos-tile'}>
                  {url
                    ? <img className="photos-tile-image" src={url} alt="" />
                    : <div className="photos-tile-image empty" />}
                  {e.label && <span className={`photos-tile-label ${e.label}`}>{LABEL_TEXT[e.label]}</span>}
                  {isHero ? (
                    <span className="photos-tile-hero-badge">HERO</span>
                  ) : (
                    <button
                      type="button"
                      className="photos-tile-sethero"
                      disabled={busyHero !== null}
                      onClick={() => void setHero(e.media_id)}
                    >
                      {busyHero === e.media_id ? '…' : 'Set hero'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="photos-note">
        Held in memory while you are on this page, then dropped. The hero is
        the one image kept for good — it is what shows in lists and on the
        plant page.
      </p>
    </main>
  );
}
