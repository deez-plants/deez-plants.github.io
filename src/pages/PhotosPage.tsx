import { useEffect, useMemo, useState } from 'react';
import type { ISODate, MediaId, PlantId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedPlant } from '../types/derived';
import type { MediaLabel } from '../types/plant';
import { formatDayMonthYear } from '../lib/dates';
import { openDeezPlants } from '../db/schema';
import { ensureThumbs } from '../boot';
import { editPlantFields } from '../care/editField';
import { PhotoCaptureButton } from '../components/PhotoCaptureButton';
import { PlantChrome } from '../components/PlantChrome';
import './PhotosPage.css';

/**
 * DESIGN_REFERENCE.md screen 13: the gallery for one plant.
 *
 * **`PlantChrome` is here now, and the mock is overridden.** The mock's own
 * screenshot for this screen shows a plain "‹ Home" back button and no
 * Prev/Next strip, and this file used to match it. The owner asked for the
 * opposite after living with the app: "same for log care and photos and
 * basically all pages that have a diff page for each plant ... the idea was
 * I could scroll through here easy for each thing for each plant". That is
 * the mock being overridden knowingly by the person using it, the same way
 * the tab bar was — do not "restore" the plain back button from the mock.
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
  /** Active plants, in list order — Prev/Next and the picker walk this. */
  allPlants: readonly { plant_id: PlantId; name: string }[];
  /** Swap plant without leaving Photos. */
  onNavigate: (plant_id: PlantId) => void;
}

const LABEL_TEXT: Record<MediaLabel, string> = {
  whole: 'Whole plant', leaf: 'Leaf', soil: 'Soil', roots: 'Roots',
};

interface Entry {
  media_id: MediaId;
  date: ISODate;
  label: MediaLabel | null;
}

export default function PhotosPage({
  plant, events, thumbs, as_of, backLabel, onBack, onChanged, allPlants, onNavigate,
}: PhotosPageProps) {
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

  /**
   * Grouped by label, whole-plant first — not by date.
   *
   * This page became the one place photo decisions are made (the owner,
   * 2026-09-12: the hero and the two What-works photographs both get chosen
   * here). Date was the right axis when this was only a gallery; when you are
   * here to *choose*, the question is "which whole-plant shots do I have",
   * and having them scattered through six sessions is the wrong shape.
   */
  const labelled = useMemo(() => {
    const order: (MediaLabel | 'none')[] = ['whole', 'leaf', 'soil', 'roots', 'none'];
    const map = new Map<MediaLabel | 'none', Entry[]>();
    for (const e of entries) {
      const key = e.label ?? 'none';
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return order.filter((k) => map.has(k)).map((k) => [k, map.get(k) as Entry[]] as const);
  }, [entries]);

  const groups = useMemo(() => {
    const map = new Map<ISODate, Entry[]>();
    for (const e of entries) {
      const list = map.get(e.date);
      if (list) list.push(e); else map.set(e.date, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  /**
   * The two photographs What works compares.
   *
   * Stored as a plant field, written as an `Edit` event, exactly as the hero
   * is — so the choice survives a backup and restore rather than evaporating
   * with the browser. A preference that vanished when the owner moved to a
   * new phone would be worse than one that travels with the record.
   *
   * Null means "use the rule": the last two whole-plant shots. An explicit
   * choice sticks until it is cleared — it must not quietly expire because a
   * new photo arrived, which was the owner's own condition.
   */
  const chosen = plant.compare ?? [];

  const writeCompare = async (next: string[] | null) => {
    setBusyHero('compare' as MediaId);
    setError(null);
    try {
      const db = await openDeezPlants();
      await editPlantFields(db, plant.plant_id, [{
        field: 'compare_media',
        from: plant.compare ? plant.compare.join(',') : null,
        to: next && next.length ? next.join(',') : null,
      }], as_of);
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyHero(null);
    }
  };

  const toggleCompare = (media_id: MediaId) => {
    if (chosen.includes(media_id)) {
      void writeCompare(chosen.filter((id) => id !== media_id));
      return;
    }
    // Two is the comparison. A third replaces the older of the pair rather
    // than being refused — refusing a tap and explaining why is worse than
    // doing the obvious thing.
    const next = [...chosen, media_id].slice(-2);
    void writeCompare(next);
  };

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
      <PlantChrome
        plant={plant}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

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

      {chosen.length > 0 && (
        <div className="photos-chosen">
          <span>
            {chosen.length === 2
              ? 'Comparing two photographs you chose.'
              : 'One chosen — pick a second to compare.'}
          </span>
          <button type="button" className="photos-chosen-clear" onClick={() => void writeCompare(null)}>
            Use the latest two
          </button>
        </div>
      )}

      {labelled.map(([label, list]) => (
        <section key={label} className="photos-group">
          <div className="photos-group-head">
            <span className="photos-group-date">
              {label === 'none' ? 'Unlabelled' : LABEL_TEXT[label as MediaLabel]}
            </span>
            <span className="photos-group-count">{list.length} photo{list.length === 1 ? '' : 's'}</span>
          </div>
          <div className="photos-grid">
            {list.map((e) => {
              const isHero = e.media_id === plant.hero;
              const isCompare = chosen.includes(e.media_id);
              // `loaded` is read so this re-renders when the thumbnails arrive.
              const url = loaded >= 0 ? thumbs.get(e.media_id) : undefined;
              return (
                <div
                  key={e.media_id}
                  className={`photos-tile${isHero ? ' hero' : ''}${isCompare ? ' compare' : ''}`}
                >
                  {url
                    ? <img className="photos-tile-image" src={url} alt="" />
                    : <div className="photos-tile-image empty" />}
                  <span className="photos-tile-date">{formatDayMonthYear(e.date)}</span>
                  <div className="photos-tile-actions">
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
                    <button
                      type="button"
                      className={isCompare ? 'photos-tile-compare on' : 'photos-tile-compare'}
                      disabled={busyHero !== null}
                      onClick={() => toggleCompare(e.media_id)}
                    >
                      {isCompare ? 'Comparing ✓' : 'Compare'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="photos-note">
        Grouped by what each photograph shows, whole-plant first, because this
        is where you choose. <strong>Hero</strong> is the one image kept for
        good — it shows in lists and on the plant page.
        <strong> Compare</strong> picks the two What works puts side by side;
        leave them alone and it uses the last two whole-plant shots on its own.
      </p>
    </main>
  );
}
