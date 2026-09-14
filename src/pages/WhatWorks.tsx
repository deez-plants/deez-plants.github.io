import { useMemo } from 'react';
import type { DerivedState } from '../types/derived';
import type { StoredEvent } from '../types/event';
import type { PlantId } from '../types/ids';
import {
  answeredCount, careChanges, comparePhotos, routineCounts, saidThings,
  type ComparePhoto,
} from '../score/whatWorks';
import { formatDayMonth, formatDayMonthYear } from '../lib/dates';
import { healthBand } from '../score/score';
import { PlantChrome } from '../components/PlantChrome';
import './WhatWorks.css';

/**
 * DESIGN_REFERENCE.md screen 18. Each care change you made, with your ratings
 * either side of it.
 *
 * **Not a claim of causation.** The reference says so outright, and it is the
 * whole design of the screen: the two readings sit side by side, the movement
 * between them is stated as a number with its elapsed days, and nothing
 * anywhere says the change caused it. There is no "what worked" ranking, no
 * best-change summary, no average. A rating moves for reasons this record
 * never saw — the weather, a move across the room, the plant simply settling —
 * and the person who looked at it is better placed than any arithmetic.
 *
 * The honest failure mode of a screen like this is looking authoritative. The
 * copy works against that on purpose.
 */

export interface WhatWorksProps {
  state: DerivedState;
  events: readonly StoredEvent[];
  /** One plant's changes, reached from its own page. Absent for the whole
      collection. The owner's framing: "I want to be able to see what works
      for the plants — this is the critical link." */
  plant_id?: PlantId;
  backLabel: string;
  onBack: () => void;
  onOpenPlant: (plant_id: PlantId) => void;
  /** Widen from one plant to the whole collection. Only offered when scoped. */
  onSeeAll?: () => void;
  /** media_id -> object URL, for the two photographs compared at the top. */
  thumbs?: Map<string, string>;
  /** Photos is where the pair is chosen; this is the way there. */
  onPhotos?: () => void;
  /** Active plants, in list order. Only used when scoped to one plant. */
  allPlants?: readonly { plant_id: PlantId; name: string }[];
  /** Swap plant without leaving What works. */
  onNavigate?: (plant_id: PlantId) => void;
}

function movement(delta: number | null, days: number | null): string {
  if (delta === null || days === null) return '';
  const size = Math.abs(delta) < 0.05 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}`;
  if (size === 'no change') return `no change over ${days} day${days === 1 ? '' : 's'}`;
  return `${size} over ${days} day${days === 1 ? '' : 's'}`;
}

export default function WhatWorks({
  state, events, plant_id, backLabel, onBack, onOpenPlant, onSeeAll, thumbs, onPhotos,
  allPlants, onNavigate,
}: WhatWorksProps) {
  const changes = useMemo(
    () => careChanges(state, events, plant_id),
    [state, events, plant_id],
  );
  const answered = answeredCount(changes);
  const plant = plant_id ? state.plants[plant_id] : undefined;

  const routine = useMemo(
    () => (plant_id ? routineCounts(events, plant_id) : []),
    [events, plant_id],
  );
  const said = useMemo(
    () => (plant_id ? saidThings(events, plant_id) : []),
    [events, plant_id],
  );

  // The photographs band. Scoped to one plant only — a then-and-now pair means
  // nothing across a collection.
  const photos = useMemo<ComparePhoto[]>(() => {
    if (!plant_id) return [];
    const out: ComparePhoto[] = [];
    for (const e of events) {
      if (e.plant_id !== plant_id || e.type === 'Edit' || !e.media) continue;
      e.media.forEach((media_id, i) => {
        out.push({ media_id, date: e.date, label: e.media_labels?.[i] ?? null });
      });
    }
    return out;
  }, [events, plant_id]);

  const compare = plant ? comparePhotos(plant, photos) : { pair: [], chosen: false };

  return (
    <main className="works">
      {/* Scoped to one plant this gets the shared pinned chrome, so you can
          sweep What works across the collection without backing out each
          time — the owner named this screen specifically. Unscoped there is
          no plant to step through, so a plain back button is all there is. */}
      {plant && allPlants && onNavigate ? (
        <PlantChrome
          plant={plant}
          backLabel={backLabel}
          onBack={onBack}
          allPlants={allPlants}
          onNavigate={onNavigate}
        />
      ) : (
        <button type="button" className="screen-back works-back" onClick={onBack}>‹ {backLabel}</button>
      )}
      <h1 className="works-title">What works</h1>

      {/* Four blocks used to stand between the title and any content — an
          explaining sentence, a caveat paragraph, then the count. The owner:
          "there is too much useless extra text at the top". The sentence is
          gone (the back button names the plant, the title says what this is)
          and the caveat moved to the foot of the page. What is left is the
          one line that carries information. */}
      {plant && (
        <section className="works-photos">
          {/* First on the page, at the owner's request. "See it thrive" was
              their phrase, and two photographs answer that faster than any
              number on this screen.

              The agreed band order is **photos · the story · the routine ·
              what you said**, and all four are now on the page in that order.
              This comment previously recited all four while only two existed,
              which is how the gap survived a whole session unnoticed. If you
              change the order, change it here too — or delete the sentence
              rather than leave it describing something the code no longer
              does. */}
          {compare.pair.length === 2 ? (
            <>
              <div className="works-pair">
                {compare.pair.map((ph) => (
                  <figure className="works-shot" key={ph.media_id}>
                    {thumbs?.get(ph.media_id)
                      ? <img src={thumbs.get(ph.media_id)} alt="" />
                      : <div className="works-shot-empty" />}
                    <figcaption>{formatDayMonthYear(ph.date)}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="works-photos-note">
                {compare.chosen ? 'The two you chose.' : 'The last two whole-plant photos.'}
                {onPhotos && (
                  <button type="button" className="works-photos-link" onClick={onPhotos}>
                    {compare.chosen ? 'Change them ›' : 'Choose your own ›'}
                  </button>
                )}
              </p>
            </>
          ) : (
            /* One whole-plant photograph is not a comparison, and padding it
               with a close-up would show change that is not there. */
            <p className="works-photos-none">
              No pair to compare yet — two whole-plant photos and they appear here.
              {onPhotos && (
                <button type="button" className="works-photos-link" onClick={onPhotos}>
                  Photos ›
                </button>
              )}
            </p>
          )}
        </section>
      )}

      <p className="works-count">
        {changes.length === 0
          ? 'No care changes recorded yet.'
          : `${changes.length} change${changes.length === 1 ? '' : 's'} · ${answered} with ratings both sides`}
      </p>

      {changes.length === 0 && (
        <p className="works-empty">
          This fills in as you move {plant ? 'it' : 'a plant'}, repot, prune,
          treat for pests, or adjust the watering interval, feed, light or
          soil. Rate {plant ? 'it' : 'the plant'} before and after and the two
          readings appear here side by side.
        </p>
      )}

      <div className="works-list">
        {changes.map((c) => (
          <section className="works-item" key={c.event_id}>
            <div className="works-head">
              {/* Scoped to one plant, its name on every row is noise — the
                  page already says whose it is. */}
              {plant ? (
                <span className="works-plant as-text">{c.label}</span>
              ) : (
                <button type="button" className="works-plant" onClick={() => onOpenPlant(c.plant_id)}>
                  {c.plant_name}
                </button>
              )}
              <span className="works-date">{formatDayMonth(c.date)}</span>
            </div>

            <p className="works-what">
              {!plant && <><span className="works-field">{c.label}</span>{' '}</>}
              {c.kind === 'change' ? (
                <>
                  <span className="works-from">{c.from ?? 'not set'}</span>
                  <span className="works-arrow" aria-label="changed to"> → </span>
                  <span className="works-to">{c.to ?? 'not set'}</span>
                </>
              ) : (
                /* A thing done, not a value changed — its note is the only
                   detail there is, and often the useful one. */
                <span className={c.to ? 'works-to' : 'works-from'}>{c.to ?? 'no note'}</span>
              )}
              {/* Section 8: which hand set a value is part of the record. */}
              {c.source === 'ai' && <span className="works-by">AI</span>}
            </p>

            <div className="works-ratings">
              <div className="works-side">
                <span className="works-side-label">Before</span>
                {c.before ? (
                  <span className={`works-pill ${healthBand(c.before.value)}`}>{c.before.value}</span>
                ) : (
                  <span className="works-pill none">—</span>
                )}
                <span className="works-side-date">
                  {c.before ? formatDayMonth(c.before.date) : 'not rated'}
                </span>
              </div>

              <div className="works-side">
                <span className="works-side-label">After</span>
                {c.after ? (
                  <span className={`works-pill ${healthBand(c.after.value)}`}>{c.after.value}</span>
                ) : (
                  <span className="works-pill none">—</span>
                )}
                <span className="works-side-date">
                  {c.after ? formatDayMonth(c.after.date) : 'not rated since'}
                </span>
              </div>
            </div>

            {/* The delta never appears without its elapsed days — §3b's rule,
                and the reason is sharper here than anywhere: two points over
                eight months and two points over a week are different facts. */}
            {c.delta !== null ? (
              <p className="works-move">{movement(c.delta, c.elapsed_days)}</p>
            ) : (
              <p className="works-move open">
                {c.before
                  ? 'Nothing to compare yet — rate this plant and the other half appears.'
                  : 'No rating from before this change, so there is nothing to sit beside.'}
              </p>
            )}
          </section>
        ))}
      </div>

      {/* The routine band. Counted, never paired — the whole reason five care
          types are kept out of `CARE_ACTIONS`. The owner's reasoning: keep
          routine separate and merely counted, "or a weekly rotate buries the
          annual repot". Scoped to one plant: a tally across the collection
          would answer a question nobody asked. */}
      {plant && routine.length > 0 && (
        <section className="works-routine">
          <h2 className="works-band-title">The routine</h2>
          <ul className="works-tally">
            {routine.map((r) => (
              <li key={r.type}>
                <span className="works-tally-count">{r.count}</span>
                <span className="works-tally-label">{r.label}</span>
                {r.last && <span className="works-tally-last">last {formatDayMonth(r.last)}</span>}
              </li>
            ))}
          </ul>
          {/* No deltas, no ratings, no "so it must be working". This band is a
              tally and says so, because a count next to a rating would read as
              a claim within about two seconds. */}
          <p className="works-routine-note">Counted, not compared.</p>
        </section>
      )}

      {/* What you said — your own notes, dated, in your own words. Needed no
          new storage: `notes_user` is written as an ordinary Edit event, so
          every version is already in the log. Walk transcripts can join this
          band later as a second source. */}
      {plant && said.length > 0 && (
        <section className="works-said">
          <h2 className="works-band-title">What you said</h2>
          <ul className="works-quotes">
            {said.map((s) => (
              <li key={s.event_id}>
                <p className="works-quote">{s.text}</p>
                <p className="works-quote-when">
                  {formatDayMonthYear(s.date)}
                  {s.about && <> · when you logged “{s.about.toLowerCase()}”</>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onSeeAll && (
        <button type="button" className="works-seeall" onClick={onSeeAll}>
          What works across every plant ›
        </button>
      )}

      {/* Shortened and moved, not deleted. The reference calls this screen's
          governing sentence "not a claim of causation — the ratings are shown,
          the inference is yours", and it is what keeps the page from reading
          as a verdict. One line at the foot does that; a paragraph at the head
          was just in the way. */}
      <p className="works-caveat">Ratings shown, not conclusions drawn.</p>
    </main>
  );
}
