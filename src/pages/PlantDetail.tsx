import { useState } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedAdherence, DerivedPlant } from '../types/derived';
import type { Health } from '../types/plant';
import { formatDayMonth } from '../lib/dates';
import { rowStatus } from '../care/careRound';
import { ratePlant } from '../care/rate';
import { openDeezPlants } from '../db/schema';
import { ScoreBlock } from '../score/ScoreBlock';
import { confirmationLine, healthBand, plantScore } from '../score/score';
import { RateSheet } from '../components/RateSheet';
import { PlantChrome } from '../components/PlantChrome';
import { PhotoCaptureButton } from '../components/PhotoCaptureButton';
import { CareMonths } from '../components/CareMonths';
import { Icon } from '../components/Icon';
import './PlantDetail.css';

/**
 * Plant detail — DESIGN_REFERENCE.md screen 04, rebuilt 2026-09-08 after the
 * design audit found this the furthest-drifted screen in the app.
 *
 * The reference's order is followed: photo and score, the status line, DO
 * NEXT, care adherence, your ratings over time, the four actions, Quick care,
 * the link rows, then the inline three-month calendar.
 *
 * Two things here are not in the reference and are deliberate. PLACEMENT was
 * added by the build and the owner asked to keep it. And the score block drops
 * its label (`label={null}`) because the score sits beside the plant's own
 * photo on a page already titled with the plant's name — the amendment to
 * section 3b recorded on 2026-09-08.
 *
 * `do_next` and `status_label` were real, wired, AI-editable fields that this
 * screen simply never rendered. That was the single biggest omission found.
 */

export interface PlantDetailProps {
  plant: DerivedPlant;
  /** The raw log — `rowStatus`, the rating history and the calendar read it. */
  events: readonly StoredEvent[];
  /** media_id -> object URL. */
  thumbs: Map<string, string>;
  as_of: ISODate;
  /** Re-read the store and rebuild. Called after a rating is written. */
  onChanged: () => Promise<void> | void;
  /** What the back button reads — the screen it returns to, never a bare "Back"
      (DESIGN_REFERENCE.md section 4 rule 3). */
  backLabel: string;
  onBack: () => void;
  /** Active plants, in list order — the Prev/Next strip and the All-plants
      picker both walk this. Locked in the original design brief (section 6):
      not optional even though the mock's own screenshot is easy to miss it in. */
  allPlants: readonly { plant_id: PlantId; name: string }[];
  /** Swaps which plant is showing without pushing a new back-stack entry —
      browsing 22 plants with Prev/Next should not take 22 taps to back out of. */
  onNavigate: (plant_id: PlantId) => void;
  /** Opens Log care in the single-plant detailed mode for this plant. */
  onLogCare: () => void;
  /** Opens this plant's entry-log History screen. */
  onHistory: () => void;
  /** Opens the walk recorder. The reference puts `Record note` in the action
      grid here; there is one recorder for the whole app, so this reaches the
      same Record screen the tab bar does, not a per-plant recording. */
  onRecordNote: () => void;
  /** Opens the full Care calendar screen — the inline preview's "View all". */
  onCareCalendar: () => void;
  /** Opens the soil / care-instructions / notes screen for this plant. */
  onWhatWorks: () => void;
  onMoreAbout: () => void;
  /** Opens the identity / placement / care-spec display for this plant. */
  onInfo: () => void;
  /** Opens this plant's photo gallery. */
  onPhotos: () => void;
}

/** Section 3: counts and days, never a score out of ten. */
function formatDaysLate(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${value} day${rounded === 1 ? '' : 's'}`;
}

function adherenceLine(a: DerivedAdherence): string {
  if (a.care_count === 0) return 'No completed waterings yet.';
  const base = `On time ${a.on_time_count} of ${a.care_count} watering${a.care_count === 1 ? '' : 's'}`;
  return a.avg_days_late === null ? `${base}.` : `${base} · average ${formatDaysLate(a.avg_days_late)} late`;
}

function adherenceBadge(a: DerivedAdherence): { text: string; tone: 'on' | 'slip' | 'behind' | 'quiet' } {
  if (!a.last_water) return { text: 'Not watered yet', tone: 'quiet' };
  if (a.state === 'behind') return { text: 'Behind', tone: 'behind' };
  if (a.state === 'slip') return { text: 'Slipping', tone: 'slip' };
  return { text: 'On schedule', tone: 'on' };
}

/**
 * Every rating this plant has had, oldest first. Read off the raw log rather
 * than derived state, which carries only the current value and the one before
 * it. Rule 1 still holds: each of these is a number a human typed.
 */
function ratingHistory(plant_id: PlantId, events: readonly StoredEvent[]): { date: ISODate; value: number }[] {
  return events
    .filter((e) => e.plant_id === plant_id && e.type === 'Rate')
    .map((e) => ({ date: e.date, value: (e as { to: Health }).to as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Care spec is a quick reference, not the full record — drop the trailing
    seasonal clause so the line reads shorter. */
function trimSeasonNote(text: string): string {
  return text.replace(/,?\s*active season\.?$/i, '').trim();
}

export default function PlantDetail({
  plant, events, thumbs, as_of, onChanged, backLabel, onBack, allPlants, onNavigate, onLogCare,
  onHistory, onRecordNote, onCareCalendar, onWhatWorks, onMoreAbout, onInfo, onPhotos,
}: PlantDetailProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hero = plant.hero ?? plant.photos[0];
  const heroUrl = hero ? thumbs.get(hero) : undefined;
  const badge = adherenceBadge(plant.adherence);
  // Rule 9: a fact about the calendar, never an instruction — "needs water" may
  // not appear here, only the interval and how far past it the date is.
  const interval = rowStatus('Water', plant, events, as_of);
  const confirmation = confirmationLine(plant.health);
  const ratings = ratingHistory(plant.plant_id, events);

  const openSheet = () => { setError(null); setSheetOpen(true); };
  const closeSheet = () => { if (!busy) setSheetOpen(false); };

  const submitRating = async (value: Health) => {
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      await ratePlant(db, plant.plant_id, value, as_of);
      await onChanged();
      setSheetOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="detail">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

      <h1 className="detail-title">{plant.name}</h1>

      {/*
        The owner's order, agreed 2026-09-12 and drawn as Round 3 of the
        screens mock-up. The identity block, then the photograph at full
        width, then the rating, then the care status — because "what I need to
        do and what's overdue is what I will be using most at a glance, then I
        can see and do what's needed; this is my main interaction". The care
        status used to sit below several cards.

        The hero is **square**. Their collection is 24 square photographs, one
        4:3 and one 3:4, and capture crops nothing — so a square frame costs
        almost nothing today and does crop a tall photograph, which they
        accepted after seeing it against the Spider Plant. `object-fit: cover`
        rather than a fixed-height box: section 6 records a photo in a
        mismatched container leaving a pale band, and that is the bug this
        would otherwise repeat.

        The plant's ID is NOT repeated here. It is in the locked Prev/Next
        strip above, and the owner asked for it in one place only.
      */}
      {heroUrl
        ? <img className="detail-hero" src={heroUrl} alt="" />
        : <div className="detail-hero detail-hero-empty" />}

      <div className="detail-score">
        <ScoreBlock {...plantScore(plant, openSheet)} label={null} />
        {confirmation && <p className="detail-confirmation">{confirmation}</p>}
      </div>

      {plant.species && <p className="detail-species">{plant.species}</p>}

      <p className="detail-checked">
        <span className={`detail-state detail-state-${badge.tone}`}>{badge.text}</span>
        {plant.last_checked
          ? <> · Checked <span className="detail-checked-date">{formatDayMonth(plant.last_checked)}</span></>
          : <> · No events logged yet</>}
      </p>

      {(plant.do_next || plant.status_label) && (
        <section className="detail-donext">
          <div className="detail-card-head">
            <span className="detail-card-label">DO NEXT</span>
            {plant.status_label && <span className="detail-status">{plant.status_label}</span>}
          </div>
          {plant.do_next
            ? <p className="detail-donext-body">{plant.do_next}</p>
            : <p className="detail-card-sub">Nothing set.</p>}
        </section>
      )}

      <section className="detail-card">
        <div className="detail-card-head">
          <span className="detail-card-label">CARE ADHERENCE</span>
          <span className={`detail-badge detail-badge-${badge.tone}`}>{badge.text}</span>
        </div>
        <p className="detail-card-line">{adherenceLine(plant.adherence)}</p>
        <p className="detail-card-sub">{interval.text}</p>
      </section>

      {/* One bar per rating, oldest at the left. The reference buckets these
          into fortnights with a schedule band beneath; that is not built —
          this shows the ratings themselves, which is the honest subset rather
          than an invented shape. */}
      {ratings.length > 0 && (
        <section className="detail-card">
          <span className="detail-card-label">YOUR RATINGS OVER TIME</span>
          <div className="detail-ratings">
            {ratings.map((r, i) => (
              <span key={`${r.date}-${i}`} className="detail-rating-col">
                <span className="detail-rating-num">{r.value}</span>
                <span
                  className={`detail-rating-bar ${healthBand(r.value)}`}
                  style={{ height: `${8 + r.value * 7}px` }}
                />
              </span>
            ))}
          </div>
          <p className="detail-card-sub">
            {ratings.length} rating{ratings.length === 1 ? '' : 's'}
            {ratings.length > 1 && <> · low {Math.min(...ratings.map((r) => r.value))}, high {Math.max(...ratings.map((r) => r.value))}</>}
            {plant.health.confirmed && <> · you rated it {formatDayMonth(plant.health.confirmed)}</>}
          </p>
        </section>
      )}

      <div className="detail-actions">
        <PhotoCaptureButton
          plant_id={plant.plant_id}
          plant_name={plant.name}
          as_of={as_of}
          className="detail-action"
          label={<><Icon name="photo" size={22} /> Take photo</>}
          onSaved={() => void onChanged()}
        />
        <button type="button" className="detail-action" onClick={onRecordNote}>
          <Icon name="mic" size={22} /> Record note
        </button>
        <button type="button" className="detail-action primary" onClick={onLogCare}>
          <Icon name="water" size={22} /> Log care
        </button>
        <button type="button" className="detail-action" onClick={onHistory}>
          <Icon name="history" size={22} /> History
        </button>
      </div>

      {sheetOpen && (
        <RateSheet
          plantName={plant.name}
          current={plant.health.current}
          busy={busy}
          error={error}
          onRate={(v) => void submitRating(v)}
          onClose={closeSheet}
        />
      )}

      <h2 className="detail-section">Quick care</h2>
      <div className="detail-quick">
        <div className="detail-quick-row">
          <span className="detail-quick-icon water"><Icon name="water" size={22} /></span>
          <span className="detail-quick-label">WATER</span>
          <span className="detail-quick-value">
            Every {plant.water_interval_days} days
            {plant.water_interval_days_winter !== null && <> · {plant.water_interval_days_winter} in winter</>}
          </span>
        </div>
        <div className="detail-quick-row">
          <span className="detail-quick-icon feed"><Icon name="feed" size={22} /></span>
          <span className="detail-quick-label">FEED</span>
          <span className="detail-quick-value">
            {plant.feed ? trimSeasonNote(plant.feed) : <span className="detail-unset">Not set</span>}
          </span>
        </div>
        <div className="detail-quick-row">
          <span className="detail-quick-icon light"><Icon name="light" size={22} /></span>
          <span className="detail-quick-label">LIGHT</span>
          <span className="detail-quick-value">
            {plant.light || <span className="detail-unset">Not set</span>}
          </span>
        </div>
        <div className="detail-quick-row">
          <span className="detail-quick-icon soil"><Icon name="pot" size={22} /></span>
          <span className="detail-quick-label">SOIL</span>
          <span className="detail-quick-value">
            {plant.soil || <span className="detail-unset">Not set</span>}
          </span>
        </div>
      </div>

      {/* Not in the reference. Added by the build, and the owner asked for it
          to stay — recorded in the 2026-09-08 audit. It is a button rather
          than a panel because tapping the block that shows your room and pot
          and having nothing happen is a dead end; editing lives in Info and
          settings, so it goes there. */}
      <button type="button" className="detail-card detail-card-button" onClick={onInfo}>
        <div className="detail-card-head">
          <span className="detail-card-label">PLACEMENT</span>
          <span className="detail-card-edit">Edit ›</span>
        </div>
        <dl className="detail-spec">
          <div><dt>Room</dt><dd>{plant.room}</dd></div>
          {plant.spot && <div><dt>Spot</dt><dd>{plant.spot}</dd></div>}
          <div><dt>Pot</dt><dd>{plant.pot}</dd></div>
          {plant.planter && (
            <div>
              <dt>Planter</dt>
              <dd>
                {plant.planter}{' '}
                <span className={plant.planter_shared_water ? 'detail-tag shared' : 'detail-tag'}>
                  {plant.planter_shared_water ? 'shared soil' : 'separate pots'}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </button>

      {/* The owner's order, 2026-09-11, and What works leads it on purpose:
          "this is really the whole point of the app". It sits directly under
          PLACEMENT, where the question "what have I changed about this one"
          naturally follows "where does it live". */}
      <button type="button" className="detail-linkrow" onClick={onWhatWorks}>
        What works <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="detail-linkrow" onClick={onMoreAbout}>
        More about this plant <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="detail-linkrow" onClick={onInfo}>
        Info and settings <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="detail-linkrow" onClick={onPhotos}>
        Photos{plant.photos.length > 0 && ` · ${plant.photos.length}`} <span aria-hidden="true">›</span>
      </button>

      {/* The inline three-month preview the reference shows here. It was a
          plain link until the grids were extracted into CareMonths. */}
      <div className="detail-cal-head">
        <h2 className="detail-section">Care calendar</h2>
        <button type="button" className="detail-viewall" onClick={onCareCalendar}>View all ›</button>
      </div>
      <CareMonths plant_id={plant.plant_id} events={events} as_of={as_of} monthCount={3} />
    </main>
  );
}
